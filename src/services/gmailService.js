const { google } = require('googleapis');
const OpenAI = require('openai');

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: process.env.GROQ_BASE_URL,
});

async function sendEmail({ accessToken, to, subject, body }) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CALLBACK_URL
  );

  oauth2Client.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\n');

  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  });
}

async function draftEmail(candidate, type = 'interview') {
  const prompts = {
    interview: `Write a professional, warm email to ${candidate.name} inviting them for an interview. Their background: ${candidate.ai_summary}. Keep it under 150 words. Return ONLY the email body, no subject line.`,
    rejection: `Write a professional, empathetic rejection email to ${candidate.name}. Keep it under 100 words, be kind and encouraging. Return ONLY the email body, no subject line.`,
    offer: `Write a professional job offer email to ${candidate.name}. Their background: ${candidate.ai_summary}. Keep it under 200 words. Return ONLY the email body, no subject line.`,
  };

  const subjects = {
    interview: `Interview Invitation — ${candidate.name}`,
    rejection: `Application Update — ${candidate.name}`,
    offer: `Job Offer — ${candidate.name}`,
  };

  const response = await client.chat.completions.create({
    model: process.env.GROQ_MODEL,
    messages: [{ role: 'user', content: prompts[type] }],
    max_tokens: 300,
  });

  return {
    subject: subjects[type],
    body: response.choices[0].message.content.trim(),
  };
}

module.exports = { sendEmail, draftEmail };