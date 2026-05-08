const noteModel = require('../models/noteModel');

async function addNote(req, res) {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'content is required' });

    const id = await noteModel.addNote({
      candidate_id: req.params.candidateId,
      user_id: req.user.id,
      content,
    });

    res.status(201).json({ id, content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getNotes(req, res) {
  try {
    const notes = await noteModel.getNotes(req.params.candidateId);
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { addNote, getNotes };