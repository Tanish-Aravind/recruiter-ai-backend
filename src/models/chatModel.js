const db = require('../config/db');

async function getOrCreateSession(candidateId, userId) {
  const [rows] = await db.query(
    'SELECT * FROM qa_sessions WHERE candidate_id = ? AND user_id = ?',
    [candidateId, userId]
  );

  if (rows.length > 0) return rows[0].id;

  const [result] = await db.query(
    'INSERT INTO qa_sessions (candidate_id, user_id) VALUES (?, ?)',
    [candidateId, userId]
  );
  return result.insertId;
}

async function saveMessage(sessionId, role, content) {
  await db.query(
    'INSERT INTO qa_messages (session_id, role, content) VALUES (?, ?, ?)',
    [sessionId, role, content]
  );
}

async function getMessages(sessionId) {
  const [rows] = await db.query(
    'SELECT * FROM qa_messages WHERE session_id = ? ORDER BY created_at ASC',
    [sessionId]
  );
  return rows;
}

module.exports = { getOrCreateSession, saveMessage, getMessages };