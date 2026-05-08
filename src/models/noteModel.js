const db = require('../config/db');

async function addNote({ candidate_id, user_id, content }) {
  const [result] = await db.query(
    'INSERT INTO notes (candidate_id, user_id, content) VALUES (?, ?, ?)',
    [candidate_id, user_id, content]
  );
  return result.insertId;
}

async function getNotes(candidate_id) {
  const [rows] = await db.query(
    'SELECT * FROM notes WHERE candidate_id = ? ORDER BY created_at DESC',
    [candidate_id]
  );
  return rows;
}

module.exports = { addNote, getNotes };