const OpenAI = require('openai');

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: process.env.GROQ_BASE_URL,
});

function formatChatAnswer(answer) {
  if (!answer) return '- No answer available.';

  const cleaned = answer.replace(/\r/g, '').trim();

  if (/^(\s*[-*]\s+|\s*\d+\.\s+)/m.test(cleaned)) {
    return cleaned;
  }

  const sentences = cleaned
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);

  if (!sentences.length) {
    return '- No answer available.';
  }

  return sentences.map((sentence) => `- ${sentence}`).join('\n');
}

async function summarizeResume(resumeText) {
  const response = await client.chat.completions.create({
    model: process.env.GROQ_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are an expert technical recruiter. Analyze the resume text and return ONLY a valid JSON object with no extra text, no markdown, no backticks. Use this exact structure:
{
  "name": "full name or null",
  "email": "email or null",
  "phone": "phone or null",
  "total_experience_years": number or null,
  "current_role": "latest job title or null",
  "skills": ["skill1", "skill2"],
  "linkedin_url": "linkedin profile url or null",
  "portfolio_url": "portfolio/personal website url or null",
  "github_url": "github profile url or null",
  "education": [{"degree": "", "institution": "", "year": ""}],
  "experience": [{"role": "", "company": "", "duration": "", "summary": ""}],
  "summary": "very short 1-2 sentence summary, under 220 characters",
  "strengths": ["strength1", "strength2"],
  "red_flags": ["anything concerning or empty array"]
}`,
      },
      {
        role: 'user',
        content: `Here is the resume text:\n\n${resumeText}`,
      },
    ],
    max_tokens: 1500,
  });

  const raw = response.choices[0].message.content.trim();

  try {
    return JSON.parse(raw);
  } catch {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  }
}

async function answerQuestion(question, retrievedChunks, conversationHistory = []) {
  const safeChunks = Array.isArray(retrievedChunks) ? retrievedChunks : [];
  const context = safeChunks
    .map((c, i) => `[${c.source.toUpperCase()} chunk ${i + 1}]:\n${c.chunk_text}`)
    .join('\n\n');

  const history = conversationHistory.map(msg => ({
    role: msg.role,
    content: msg.content,
  }));

  const response = await client.chat.completions.create({
    model: process.env.GROQ_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a helpful recruiter assistant. Answer questions about a candidate using ONLY the retrieved context chunks below. Be specific about whether the answer comes from the resume or GitHub. If GitHub context is not present, answer using only the resume. If the answer isn't in the available context, say so clearly.

Retrieved context:
${context}`,
      },
      ...history,
      {
        role: 'user',
        content: question,
      },
    ],
    max_tokens: 800,
  });

  return response.choices[0].message.content.trim();
}

async function scoreResume(resumeText, jobTitle, jobDescription) {
  const response = await client.chat.completions.create({
    model: process.env.GROQ_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are an expert technical recruiter. Compare the resume against the job description and return ONLY a valid JSON object with no extra text, no markdown, no backticks. Use this exact structure:
{
  "score": <number 0-100>,
  "summary": "<2-3 sentence explanation of the score>",
  "matched_skills": ["skill1", "skill2"],
  "missing_skills": ["skill1", "skill2"],
  "experience_match": "<strong|partial|weak>",
  "education_match": "<strong|partial|weak>",
  "recommendation": "<hire|consider|reject>"
}`,
      },
      {
        role: 'user',
        content: `Job Title: ${jobTitle}
Job Description: ${jobDescription}

Resume:
${resumeText}`,
      },
    ],
    max_tokens: 800,
  });

  const raw = response.choices[0].message.content.trim();
  try {
    return JSON.parse(raw);
  } catch {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  }
}

async function analyzeTrust(resumeText, githubData = null) {
  let githubContext = '';

  if (githubData) {
    let repos = [];
    try {
      repos = typeof githubData.repos_json === 'string'
        ? JSON.parse(githubData.repos_json)
        : githubData.repos_json || [];
    } catch {}

    const languages = typeof githubData.languages_json === 'string'
      ? JSON.parse(githubData.languages_json)
      : githubData.languages_json || {};

    githubContext = `
GitHub Profile:
- Languages actually used: ${Object.keys(languages).join(', ')}
- Number of public repos: ${repos.length}
- Repos: ${repos.map(r => `${r.name} (${r.language || 'N/A'})`).join(', ')}
- Repos with no README or empty: ${repos.filter(r => !r.readme).length}
- Single commit repos: ${repos.filter(r => r.stars === 0 && r.forks === 0).length}
    `;
  }

  const response = await client.chat.completions.create({
    model: process.env.GROQ_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are an expert fraud detection analyst for resumes. Analyze the resume carefully for signs of fabrication, exaggeration, or inconsistency. Return ONLY a valid JSON object with no extra text, no markdown, no backticks:
{
  "trust_score": <number 0-100, where 100 is fully trustworthy>,
  "verdict": "<trusted|suspicious|fake>",
  "red_flags": ["specific issue 1", "specific issue 2"],
  "green_flags": ["positive signal 1", "positive signal 2"],
  "timeline_analysis": "<brief analysis of employment/education timeline>",
  "skill_analysis": "<are claimed skills consistent with experience level?>",
  "github_analysis": "<how well does GitHub match resume claims, or N/A if no GitHub>",
  "ai_generated_likelihood": "<low|medium|high>",
  "recommendation": "<brief 1-2 sentence recommendation for the recruiter>"
}

Scoring guide:
- 80-100: Trustworthy — consistent timeline, skills match experience, GitHub aligns
- 60-79: Minor concerns — small gaps or slight exaggerations but mostly credible  
- 40-59: Suspicious — multiple inconsistencies, skills don't match experience level
- 0-39: Likely fake — major red flags, impossible timeline, clear fabrication`,
      },
      {
        role: 'user',
        content: `Analyze this resume for authenticity:

${resumeText}

${githubContext ? `\nGitHub Data for cross-verification:\n${githubContext}` : '\nNo GitHub data available for cross-verification.'}`,
      },
    ],
    max_tokens: 1000,
  });

  const raw = response.choices[0].message.content.trim();
  try {
    return JSON.parse(raw);
  } catch {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  }
}
module.exports = { summarizeResume, answerQuestion, scoreResume, analyzeTrust };
