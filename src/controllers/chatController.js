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

    // Get or create chat session
    const sessionId = await chatModel.getOrCreateSession(candidateId, userId);

    // Get previous messages for conversation history
    const previousMessages = await chatModel.getMessages(sessionId);

    // Save user message
    await chatModel.saveMessage(sessionId, 'user', question);

    // Retrieve relevant RAG chunks and answer with conversation history
    const retrievedChunks = await retrieveContext(candidateId, question);
    const answer = await answerQuestion(question, retrievedChunks, previousMessages);

    // Save assistant message
    await chatModel.saveMessage(sessionId, 'assistant', answer);

    res.json({ question, answer });
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

function buildContext(candidate, githubData) {
  // Safely parse skills_json whether it's a string, array, or already parsed
  let skills = [];
  try {
    if (Array.isArray(candidate.skills_json)) {
      skills = candidate.skills_json;
    } else if (typeof candidate.skills_json === 'string') {
      const parsed = JSON.parse(candidate.skills_json);
      skills = Array.isArray(parsed) ? parsed : [parsed];
    }
  } catch {
    // If it's a plain comma-separated string like "Python,C,C++"
    skills = candidate.skills_json ? candidate.skills_json.split(',').map(s => s.trim()) : [];
  }

  let context = `
CANDIDATE PROFILE:
Name: ${candidate.name}
Email: ${candidate.email}
Phone: ${candidate.phone}
AI Summary: ${candidate.ai_summary}
Skills: ${skills.join(', ')}

FULL RESUME TEXT:
${candidate.resume_text}
`;

  if (githubData) {
    let repos = [];
    let languages = {};

    try {
      repos = typeof githubData.repos_json === 'string'
        ? JSON.parse(githubData.repos_json)
        : githubData.repos_json;

      languages = typeof githubData.languages_json === 'string'
        ? JSON.parse(githubData.languages_json)
        : githubData.languages_json;
    } catch (e) {
      console.error('Error parsing github data:', e.message);
    }

    context += `
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

  return context;
}

module.exports = { sendMessage, getChatHistory };
