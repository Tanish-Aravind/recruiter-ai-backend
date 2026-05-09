const candidateModel = require('../models/candidateModel');
const chatModel = require('../models/chatModel');
const { answerQuestion } = require('../services/grokService');
const { retrieveContext } = require('../services/ragService');

async function sendMessage(req, res) {
  try {
    const { candidateId } = req.params;
    const { question } = req.body;
    const userId = req.user.id;

    if (!question) {
      return res.status(400).json({ error: 'question is required' });
    }

    // Get candidate + github data
    const candidate = await candidateModel.getCandidateById(candidateId);
    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }
    const githubData = await getCandidateGithubData(candidateId);

    // Get or create chat session
    const sessionId = await chatModel.getOrCreateSession(candidateId, userId);

    // Get previous messages for conversation history
    const previousMessages = await chatModel.getMessages(sessionId);

    // Save user message
    await chatModel.saveMessage(sessionId, 'user', question);

    // Retrieve relevant RAG chunks and answer with conversation history
    let retrievedChunks = [];
    try {
      retrievedChunks = await retrieveContext(candidateId, question);
    } catch (err) {
      console.error('RAG retrieval error:', err.message);
    }

    if (!retrievedChunks.length) {
      retrievedChunks = buildRetrievedChunks(candidate, githubData);
    } else {
      retrievedChunks = ensureBothSources(retrievedChunks, candidate, githubData);
    }

    const answer = await answerQuestion(question, retrievedChunks, previousMessages);

    // Save assistant message
    await chatModel.saveMessage(sessionId, 'assistant', answer);

    res.json({
      question,
      answer,
      sources: [...new Set(retrievedChunks.map((chunk) => chunk.source))],
    });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

async function getChatHistory(req, res) {
  try {
    const { candidateId } = req.params;
    const userId = req.user.id;

    const sessionId = await chatModel.getOrCreateSession(candidateId, userId);
    const messages = await chatModel.getMessages(sessionId);

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function getCandidateSkills(candidate) {
  let skills = [];
  try {
    if (Array.isArray(candidate.skills_json)) {
      skills = candidate.skills_json;
    } else if (typeof candidate.skills_json === 'string') {
      const parsed = JSON.parse(candidate.skills_json);
      skills = Array.isArray(parsed) ? parsed : [parsed];
    }
  } catch {
    skills = candidate.skills_json ? candidate.skills_json.split(',').map(s => s.trim()) : [];
  }

  return skills;
}

function buildResumeContext(candidate) {
  const skills = getCandidateSkills(candidate);

  return `
CANDIDATE PROFILE:
Name: ${candidate.name}
Email: ${candidate.email}
Phone: ${candidate.phone}
AI Summary: ${candidate.ai_summary}
Skills: ${skills.join(', ')}

FULL RESUME TEXT:
${candidate.resume_text}
`;
}

function buildGithubContext(githubData) {
  let repos = [];
  let languages = {};

  try {
    repos = typeof githubData.repos_json === 'string'
      ? JSON.parse(githubData.repos_json)
      : (githubData.repos_json || []);

    languages = typeof githubData.languages_json === 'string'
      ? JSON.parse(githubData.languages_json)
      : (githubData.languages_json || {});
  } catch (e) {
    console.error('Error parsing github data:', e.message);
  }

  return `
GITHUB PROFILE:
Languages used across repos: ${Object.keys(languages).join(', ')}

REPOSITORIES:
${repos.map(r => `
- ${r.name} (${r.language || 'N/A'})
  URL: ${r.url}
  Description: ${r.description || 'No description'}
  README excerpt: ${r.readme ? r.readme.slice(0, 300) : 'No README'}
`).join('')}
`;
}

function buildRetrievedChunks(candidate, githubData) {
  const chunks = [];

  if (candidate?.resume_text) {
    chunks.push({
      source: 'resume',
      chunk_text: buildResumeContext(candidate),
      similarity: 1,
    });
  }

  if (githubData) {
    chunks.push({
      source: 'github',
      chunk_text: buildGithubContext(githubData),
      similarity: 1,
    });
  }

  return chunks;
}

function ensureBothSources(retrievedChunks, candidate, githubData) {
  const chunks = Array.isArray(retrievedChunks) ? [...retrievedChunks] : [];
  const hasResume = chunks.some((chunk) => chunk.source === 'resume');
  const hasGithub = chunks.some((chunk) => chunk.source === 'github');

  if (!hasResume && candidate?.resume_text) {
    chunks.push({
      source: 'resume',
      chunk_text: buildResumeContext(candidate),
      similarity: 0,
    });
  }

  if (!hasGithub && githubData) {
    chunks.push({
      source: 'github',
      chunk_text: buildGithubContext(githubData),
      similarity: 0,
    });
  }

  return chunks;
}

async function getCandidateGithubData(candidateId) {
  try {
    return await candidateModel.getGithubData(candidateId);
  } catch (err) {
    console.error('GitHub context load error:', err.message);
    return null;
  }
}

module.exports = { sendMessage, getChatHistory };
