const express = require('express');
const { Parser } = require('json2csv');
const upload = require('../middleware/upload');
const auth = require('../middleware/auth');
const candidateModel = require('../models/candidateModel');
const {
  uploadResume,
  uploadBatch,
  getCandidates,
  getCandidate,
  updateStatus,
  deleteCandidate,
  reindexCandidate,
} = require('../controllers/candidatesController');

const router = express.Router();

function parseSkills(skillsJson) {
  try {
    if (Array.isArray(skillsJson)) {
      return skillsJson;
    }

    const parsed = JSON.parse(skillsJson || '[]');
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return skillsJson?.split(',').map(skill => skill.trim()).filter(Boolean) || [];
  }
}

async function resolveCandidate(idOrJobId) {
  const candidate = await candidateModel.getCandidateById(idOrJobId);
  if (candidate) {
    return candidate;
  }

  return candidateModel.getLatestCandidateByJobId(idOrJobId);
}

async function exportCandidatesCsv(req, res) {
  try {
    const jobId = req.params.jobId || req.query.job_id || req.query.jobId;
    if (!jobId) {
      return res.status(400).json({ error: 'job_id is required' });
    }

    const candidates = await candidateModel.getCandidatesByJob(jobId);
    if (candidates.length === 0) {
      return res.status(404).json({ error: 'No candidates found for this job' });
    }

    const rows = candidates.map(candidate => ({
      Name: candidate.name || 'Unknown',
      Email: candidate.email || '-',
      Phone: candidate.phone || '-',
      Status: candidate.status || 'uploaded',
      Match_Score: candidate.match_score || 0,
      Skills: parseSkills(candidate.skills_json).join(', '),
      GitHub: candidate.github_url || '-',
      AI_Summary: candidate.ai_summary || '-',
      Applied_On: candidate.created_at
        ? new Date(candidate.created_at).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
        : '-',
    }));

    const parser = new Parser({
      fields: [
        'Name',
        'Email',
        'Phone',
        'Status',
        'Match_Score',
        'Skills',
        'GitHub',
        'AI_Summary',
        'Applied_On',
      ],
    });

    const csv = parser.parse(rows);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="candidates-job-${jobId}-${Date.now()}.csv"`
    );

    return res.status(200).send(`\uFEFF${csv}`);
  } catch (err) {
    console.error('Export error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

router.post('/upload', auth, upload.single('resume'), uploadResume);
router.post('/upload-batch', auth, upload.array('resumes', 20), uploadBatch);
router.get('/', auth, getCandidates);
router.get('/export', auth, exportCandidatesCsv);
router.get('/export/:jobId', auth, exportCandidatesCsv);

router.get('/:id', auth, getCandidate);
router.patch('/:id/status', auth, updateStatus);
router.post('/:id/reindex', auth, reindexCandidate);
router.delete('/:id', auth, deleteCandidate);

router.post('/:id/rescore', auth, async (req, res) => {
  try {
    const candidate = await resolveCandidate(req.params.id);
    if (!candidate) {
      return res.status(404).json({ error: 'Not found' });
    }

    const job = await require('../models/jobModel').getJobById(candidate.job_id);
    if (!job || !job.description) {
      return res.status(400).json({ error: 'Job has no description to score against' });
    }

    const { scoreResume } = require('../services/grokService');
    const scoreData = await scoreResume(candidate.resume_text, job.title, job.description);
    await candidateModel.updateMatchScore(candidate.id, scoreData.score);

    return res.json({
      message: 'Rescored successfully',
      candidate_id: candidate.id,
      score: scoreData.score,
      details: scoreData,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:id/analyze-trust', auth, async (req, res) => {
  try {
    const candidate = await resolveCandidate(req.params.id);
    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    const githubData = await candidateModel.getGithubData(candidate.id);
    const { analyzeTrust } = require('../services/grokService');
    const trustData = await analyzeTrust(candidate.resume_text, githubData);

    await candidateModel.updateTrustScore(
      candidate.id,
      trustData.trust_score,
      trustData.red_flags || []
    );

    return res.json({
      message: 'Trust analysis complete',
      candidate_id: candidate.id,
      trust_score: trustData.trust_score,
      verdict: trustData.verdict,
      details: trustData,
    });
  } catch (err) {
    console.error('Trust analysis error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
