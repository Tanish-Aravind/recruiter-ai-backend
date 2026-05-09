const { parseResume } = require('../services/resumeParser');
// const { summarizeResume, scoreResume } = require('../services/grokService');
const { uploadToCloudinary, deleteFromCloudinary } = require('../services/cloudinaryService');
const { indexCandidate, deleteIndex } = require('../services/ragService');
const candidateModel = require('../models/candidateModel');
const jobModel = require('../models/jobModel');
const fs = require('fs');
const { summarizeResume, scoreResume, analyzeTrust } = require('../services/grokService');

function normalizeMatchScore(score) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(numericScore)));
}

async function ensureCandidateScores(job, candidates) {
  if (!job || !job.description || !Array.isArray(candidates) || candidates.length === 0) {
    return candidates;
  }

  const candidatesNeedingScore = candidates.filter(
    (candidate) => candidate.match_score === null || candidate.match_score === undefined
  );

  for (const candidate of candidatesNeedingScore) {
    let matchScore = 0;

    if (candidate.resume_text) {
      try {
        const scoreData = await scoreResume(candidate.resume_text, job.title, job.description);
        matchScore = normalizeMatchScore(scoreData?.score);
      } catch (err) {
        console.error(`Score backfill error for candidate ${candidate.id}:`, err.message);
      }
    }

    candidate.match_score = matchScore;

    try {
      await candidateModel.updateMatchScore(candidate.id, matchScore);
    } catch (err) {
      console.error(`Failed to save score for candidate ${candidate.id}:`, err.message);
    }
  }

  for (const candidate of candidates) {
    candidate.match_score = normalizeMatchScore(candidate.match_score);
  }

  candidates.sort((a, b) => {
    if (b.match_score !== a.match_score) {
      return b.match_score - a.match_score;
    }

    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });

  return candidates;
}

function extractFirstMatch(text, regex) {
  const match = text.match(regex);
  return match ? match[1].trim() : null;
}

function parseSkills(skillsJson) {
  try {
    if (Array.isArray(skillsJson)) {
      return skillsJson.filter(Boolean);
    }

    const parsed = JSON.parse(skillsJson || '[]');
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return skillsJson?.split(',').map((skill) => skill.trim()).filter(Boolean) || [];
  }
}

function normalizeUrl(url) {
  if (!url) return null;
  const trimmed = String(url).trim();
  return trimmed || null;
}

function extractLinks(resumeText) {
  const githubUrl = extractFirstMatch(
    resumeText,
    /\b(https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9._-]+\/?)\b/i
  );
  const linkedinUrl = extractFirstMatch(
    resumeText,
    /\b(https?:\/\/(?:www\.)?linkedin\.com\/[^\s)]+)\b/i
  );

  const urlMatches = resumeText.match(/\bhttps?:\/\/[^\s)]+/gi) || [];
  const portfolioUrl = urlMatches.find((url) => {
    const lower = url.toLowerCase();
    return !lower.includes('github.com') && !lower.includes('linkedin.com');
  }) || null;

  return {
    github_url: normalizeUrl(githubUrl),
    linkedin_url: normalizeUrl(linkedinUrl),
    portfolio_url: normalizeUrl(portfolioUrl),
  };
}

function toRoleScoreOutOf10(matchScore) {
  const score = normalizeMatchScore(matchScore);
  return Number((score / 10).toFixed(1));
}

function buildCandidateSummary(candidate) {
  const techSkills = parseSkills(candidate.skills_json).slice(0, 8);

  return {
    name: candidate.name || 'Unknown Candidate',
    email: candidate.email || null,
    phone: candidate.phone || null,
    current_role: candidate.current_role || null,
    total_experience_years: candidate.total_experience_years ?? null,
    tech_skills: techSkills,
    role_score_out_of_10: toRoleScoreOutOf10(candidate.match_score),
    short_summary: candidate.ai_summary || null,
    github_link: candidate.github_url || null,
    linkedin_link: candidate.linkedin_url || null,
    portfolio_link: candidate.portfolio_url || null,
    trust_score: candidate.trust_score ?? null,
    status: candidate.status || 'uploaded',
  };
}

function attachCandidateSummary(candidate) {
  if (!candidate) return candidate;

  return {
    ...candidate,
    candidate_summary: buildCandidateSummary(candidate),
  };
}

function buildFallbackParsedResume(resumeText, originalname = '') {
  const lines = resumeText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const email = extractFirstMatch(resumeText, /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i);
  const phone = extractFirstMatch(
    resumeText,
    /(\+?\d[\d\s\-()]{7,}\d)/
  );
  const name = lines[0] || originalname.replace(/\.[^.]+$/, '') || 'Unknown Candidate';

  return {
    name,
    email,
    phone,
    current_role: null,
    total_experience_years: null,
    skills: [],
    summary: lines.slice(0, 2).join(' ').slice(0, 220) || 'Resume uploaded successfully.',
    ...extractLinks(resumeText),
  };
}

async function parseCandidateDetails(resumeText, originalname) {
  try {
    const parsed = await summarizeResume(resumeText);
    const fallback = buildFallbackParsedResume(resumeText, originalname);
    return {
      ...fallback,
      ...parsed,
      skills: Array.isArray(parsed?.skills) ? parsed.skills : [],
      github_url: normalizeUrl(parsed?.github_url) || fallback.github_url,
      linkedin_url: normalizeUrl(parsed?.linkedin_url) || fallback.linkedin_url,
      portfolio_url: normalizeUrl(parsed?.portfolio_url) || fallback.portfolio_url,
    };
  } catch (err) {
    console.error('Resume summarization error:', err.message);
    return buildFallbackParsedResume(resumeText, originalname);
  }
}

async function uploadResumeAsset(file) {
  try {
    const { public_id, url } = await uploadToCloudinary(
      file.path,
      file.originalname
    );

    return { resume_path: public_id, resume_url: url };
  } catch (err) {
    console.error('Cloudinary upload error:', err.message);

    return {
      resume_path: file.filename,
      resume_url: `/uploads/${file.filename}`,
    };
  }
}

function isLocalUpload(candidate) {
  return typeof candidate?.resume_url === 'string' && candidate.resume_url.startsWith('/uploads/');
}

async function uploadResume(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { job_id } = req.body;
    if (!job_id) {
      return res.status(400).json({ error: 'job_id is required' });
    }

    // 1. Parse text from local temp file
    const resumeText = await parseResume(req.file.path);

    if (!resumeText || resumeText.trim().length < 50) {
      fs.existsSync(req.file.path) && fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Could not extract text from resume' });
    }

    // 2. Upload to Cloudinary
    const resumeAsset = await uploadResumeAsset(req.file);

    // 3. Summarize with Groq
    const parsed = await parseCandidateDetails(resumeText, req.file.originalname);

    // 4. Score against JD
    let matchScore = 0;
    let scoreData = null;
    try {
      const job = await jobModel.getJobById(job_id);
      if (job && job.description) {
        scoreData = await scoreResume(resumeText, job.title, job.description);
        matchScore = normalizeMatchScore(scoreData?.score);
      }
    } catch (err) {
      console.error('Scoring error:', err.message);
    }

    // 5. Save to DB
    const candidateId = await candidateModel.createCandidate({
      job_id,
      name: parsed.name,
      email: parsed.email,
      phone: parsed.phone,
      resume_path: resumeAsset.resume_path,
      resume_url: resumeAsset.resume_url,
      resume_text: resumeText,
      ai_summary: parsed.summary,
      skills_json: parsed.skills || [],
      github_url: parsed.github_url || null,
      linkedin_url: parsed.linkedin_url || null,
      portfolio_url: parsed.portfolio_url || null,
      current_role: parsed.current_role || null,
      total_experience_years: parsed.total_experience_years ?? null,
      match_score: matchScore,
    });

    const candidate = attachCandidateSummary(await candidateModel.getCandidateById(candidateId));

    // 7. Trust analysis (non-blocking)
    (async () => {
      try {
        const trustData = await analyzeTrust(resumeText, null);
        await candidateModel.updateTrustScore(
          candidateId,
          trustData.trust_score,
          trustData.red_flags || []
        );
        console.log(`✅ Trust score for candidate ${candidateId}: ${trustData.trust_score}`);
      } catch (err) {
        console.error('Trust analysis error:', err.message);
      }
    })();

    // 6. Index for RAG (non-blocking)
    indexCandidate(candidateId, resumeText, null).catch(err =>
      console.error('RAG indexing error:', err.message)
    );

    res.status(201).json({
      message: 'Resume uploaded and analyzed successfully',
      candidate,
      parsed,
      score: scoreData,
      candidate_summary: candidate.candidate_summary,
    });
  } catch (err) {
    console.error('Upload error:', err.message);
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: err.message });
  }
}

async function uploadBatch(req, res) {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const { job_id } = req.body;
    if (!job_id) {
      return res.status(400).json({ error: 'job_id is required' });
    }

    // Fetch job once for all candidates
    let job = null;
    try {
      job = await jobModel.getJobById(job_id);
    } catch {}

    const results = [];

    for (const file of req.files) {
      try {
        // 1. Parse text
        const resumeText = await parseResume(file.path);

        if (!resumeText || resumeText.trim().length < 50) {
          fs.existsSync(file.path) && fs.unlinkSync(file.path);
          results.push({
            filename: file.originalname,
            status: 'failed',
            error: 'Could not extract text',
          });
          continue;
        }

        // 2. Upload to Cloudinary
        const resumeAsset = await uploadResumeAsset(file);

        // 3. Summarize with Groq
        const parsed = await parseCandidateDetails(resumeText, file.originalname);

        // 4. Score against JD
        let matchScore = 0;
        try {
          if (job && job.description) {
            const scoreData = await scoreResume(resumeText, job.title, job.description);
            matchScore = normalizeMatchScore(scoreData?.score);
          }
        } catch (err) {
          console.error('Batch scoring error:', err.message);
        }

        // 5. Save to DB
        const candidateId = await candidateModel.createCandidate({
          job_id,
          name: parsed.name,
          email: parsed.email,
          phone: parsed.phone,
          resume_path: resumeAsset.resume_path,
          resume_url: resumeAsset.resume_url,
          resume_text: resumeText,
          ai_summary: parsed.summary,
          skills_json: parsed.skills || [],
          github_url: parsed.github_url || null,
          linkedin_url: parsed.linkedin_url || null,
          portfolio_url: parsed.portfolio_url || null,
          current_role: parsed.current_role || null,
          total_experience_years: parsed.total_experience_years ?? null,
          match_score: matchScore,
        });

        // 6. Index for RAG (non-blocking)
        indexCandidate(candidateId, resumeText, null).catch(err =>
          console.error('RAG indexing error:', err.message)
        );

        // Trust analysis (non-blocking)
        (async () => {
          try {
            const trustData = await analyzeTrust(resumeText, null);
            await candidateModel.updateTrustScore(
              candidateId,
              trustData.trust_score,
              trustData.red_flags || []
            );
          } catch (err) {
            console.error('Trust analysis error:', err.message);
          }
        })();

        results.push({
          filename: file.originalname,
          status: 'success',
          id: candidateId,
          candidate_id: candidateId,
          name: parsed.name,
          email: parsed.email,
          match_score: matchScore,
          candidate_summary: buildCandidateSummary({
            name: parsed.name,
            email: parsed.email,
            phone: parsed.phone,
            current_role: parsed.current_role || null,
            total_experience_years: parsed.total_experience_years ?? null,
            skills_json: parsed.skills || [],
            match_score: matchScore,
            ai_summary: parsed.summary,
            github_url: parsed.github_url || null,
            linkedin_url: parsed.linkedin_url || null,
            portfolio_url: parsed.portfolio_url || null,
            trust_score: null,
            status: 'uploaded',
          }),
        });

      } catch (err) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        results.push({
          filename: file.originalname,
          status: 'failed',
          error: err.message,
        });
      }
    }

    const succeeded = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'failed').length;

    res.status(200).json({
      message: `Processed ${succeeded} successfully, ${failed} failed`,
      results,
    });

  } catch (err) {
    console.error('Batch upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

async function getCandidates(req, res) {
  try {
    const { job_id } = req.query;
    if (!job_id) return res.status(400).json({ error: 'job_id is required' });
    const [job, candidates] = await Promise.all([
      jobModel.getJobById(job_id),
      candidateModel.getCandidatesByJob(job_id),
    ]);

    await ensureCandidateScores(job, candidates);

    res.json(candidates.map(attachCandidateSummary));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getCandidate(req, res) {
  try {
    const candidate = await candidateModel.getCandidateById(req.params.id);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
    res.json(attachCandidateSummary(candidate));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateStatus(req, res) {
  try {
    const { status } = req.body;
    const validStatuses = ['uploaded', 'reviewed', 'shortlisted', 'rejected', 'interview'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    await candidateModel.updateCandidateStatus(req.params.id, status);
    res.json({ message: 'Status updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function reindexCandidate(req, res) {
  try {
    const candidateId = req.params.id;
    const candidate = await candidateModel.getCandidateById(candidateId);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    let githubData = null;
    if (candidateModel.getGithubData) {
      githubData = await candidateModel.getGithubData(candidateId);
    }

    await indexCandidate(candidateId, candidate.resume_text, githubData);
    res.json({ message: 'Candidate re-indexed for RAG', candidateId });
  } catch (err) {
    console.error('Reindex error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

async function deleteCandidate(req, res) {
  try {
    const candidate = candidateModel.getCandidateDeleteData
      ? await candidateModel.getCandidateDeleteData(req.params.id)
      : await candidateModel.getCandidateById(req.params.id);
    if (!candidate) return res.status(404).json({ error: 'Not found' });

    await candidateModel.deleteCandidate(req.params.id);

    const cleanupTasks = [];

    if (candidate.resume_path && isLocalUpload(candidate)) {
      cleanupTasks.push(
        new Promise((resolve) => {
          const localPath = `uploads/${candidate.resume_path}`;
          if (fs.existsSync(localPath)) {
            fs.unlink(localPath, (err) => {
              if (err) {
                console.error('Local file delete error:', err.message);
              }
              resolve();
            });
            return;
          }

          resolve();
        })
      );
    } else if (candidate.resume_path) {
      cleanupTasks.push(
        deleteFromCloudinary(candidate.resume_path).catch(err =>
          console.error('Cloudinary delete error:', err.message)
        )
      );
    }

    cleanupTasks.push(
      deleteIndex(req.params.id).catch(err =>
        console.error('RAG delete error:', err.message)
      )
    );

    Promise.allSettled(cleanupTasks).catch(() => {});

    res.json({ message: 'Candidate deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  uploadResume,
  uploadBatch,
  getCandidates,
  getCandidate,
  updateStatus,
  deleteCandidate,
  reindexCandidate,
};
