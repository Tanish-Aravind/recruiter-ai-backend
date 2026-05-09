const { fetchGithubData } = require('../services/githubService');
const candidateModel = require('../models/candidateModel');
const { indexCandidate } = require('../services/ragService');

function formatTopLanguages(languages = {}, limit = 5) {
  const entries = Object.entries(languages).sort(([, a], [, b]) => b - a);
  const sorted = entries.slice(0, limit);

  const totalBytes = entries.reduce((sum, [, bytes]) => sum + bytes, 0);

  return sorted.map(([name, bytes]) => ({
    name,
    bytes,
    percentage: totalBytes ? `${Math.round((bytes / totalBytes) * 100)}%` : '0%',
  }));
}

function formatRepos(repos = [], limit = 8) {
  return repos.slice(0, limit).map((repo) => ({
    name: repo.name,
    primary_language: repo.language || 'N/A',
    description: repo.description || 'No description provided',
    stars: repo.stars,
    forks: repo.forks,
    updated_at: repo.updated_at,
    url: repo.url,
    highlights: [
      `Primary language: ${repo.language || 'N/A'}`,
      `Stars: ${repo.stars}`,
      `Forks: ${repo.forks}`,
      repo.description || 'No description provided',
    ],
  }));
}

function buildGithubSummary(githubData) {
  const repos = githubData.repos || [];
  const topLanguages = formatTopLanguages(githubData.languages);

  return {
    profile: {
      username: githubData.username,
      name: githubData.name,
      bio: githubData.bio || 'No bio provided',
      public_repos: githubData.public_repos,
      followers: githubData.followers,
    },
    overview_points: [
      `${githubData.public_repos} public repositories`,
      `${githubData.followers} followers`,
      `${topLanguages.length} major languages identified`,
      `${repos.length} recently updated repositories analyzed`,
    ],
    top_languages: topLanguages,
    repositories: formatRepos(repos),
  };
}

function buildStoredGithubSummary(data) {
  let repos = [];
  let languages = {};

  try {
    repos = typeof data.repos_json === 'string' ? JSON.parse(data.repos_json) : (data.repos_json || []);
    languages = typeof data.languages_json === 'string' ? JSON.parse(data.languages_json) : (data.languages_json || {});
  } catch (err) {
    console.error('GitHub parse error:', err.message);
  }

  return {
    fetched_at: data.fetched_at,
    summary: buildGithubSummary({
      username: null,
      name: null,
      bio: null,
      public_repos: repos.length,
      followers: 0,
      repos,
      languages,
    }),
  };
}

async function analyzeGithub(req, res) {
  try {
    const { candidateId } = req.params;
    const { github_url } = req.body;

    if (!github_url) {
      return res.status(400).json({ error: 'github_url is required' });
    }

    const candidate = await candidateModel.getCandidateById(candidateId);
    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    // Fetch GitHub data
    const githubData = await fetchGithubData(github_url);

    // Save github_url to candidate
    await candidateModel.updateCandidateGithub(candidateId, github_url);

    // Save repos and languages to github_data table
    await candidateModel.saveGithubData(candidateId, {
      repos_json: githubData.repos,
      languages_json: githubData.languages,
    });

    indexCandidate(candidateId, candidate.resume_text, {
      repos_json: githubData.repos,
      languages_json: githubData.languages,
    }).catch((err) => {
      console.error('GitHub reindex error:', err.message);
    });

    res.json({
      message: 'GitHub successfully analyzed',
    });
  } catch (err) {
    console.error('GitHub error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

async function getGithubData(req, res) {
  try {
    const { candidateId } = req.params;
    const data = await candidateModel.getGithubData(candidateId);
    if (!data) {
      return res.status(404).json({ error: 'No GitHub data found for this candidate' });
    }

    const candidate = await candidateModel.getCandidateById(candidateId);
    const formatted = buildStoredGithubSummary(data);

    res.json({
      github_url: candidate?.github_url || null,
      ...formatted,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { analyzeGithub, getGithubData };
