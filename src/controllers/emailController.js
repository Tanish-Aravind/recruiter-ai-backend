const { sendEmail, draftEmail } = require('../services/gmailService');
const candidateModel = require('../models/candidateModel');

async function getDraft(req, res) {
  try {
    const { candidateId } = req.params;
    const { type = 'interview' } = req.query;

    const validTypes = ['interview', 'rejection', 'offer'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Use: interview, rejection, offer' });
    }

    const candidate = await candidateModel.getCandidateById(candidateId);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
    if (!candidate.email) return res.status(400).json({ error: 'Candidate has no email on file' });

    const draft = await draftEmail(candidate, type);

    res.json({
      to: candidate.email,
      subject: draft.subject,
      body: draft.body,
    });
  } catch (err) {
    console.error('Draft error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

async function sendCandidateEmail(req, res) {
  try {
    const { to, subject, body } = req.body;
    const accessToken = req.user.accessToken;

    if (!accessToken) {
      return res.status(401).json({
        error: 'No Gmail access. Please log out and log in again.',
      });
    }

    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'to, subject and body are required' });
    }

    await sendEmail({ accessToken, to, subject, body });
    res.json({ message: 'Email sent successfully' });
  } catch (err) {
    console.error('Email send error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getDraft, sendCandidateEmail };