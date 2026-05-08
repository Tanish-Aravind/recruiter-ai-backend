const db = require('../config/db');

async function createJob({ user_id, title, description }) {
  const [result] = await db.query(
    'INSERT INTO job_postings (user_id, title, description) VALUES (?, ?, ?)',
    [user_id, title, description]
  );
  return result.insertId;
}

async function getJobsByUser(user_id) {
  const [rows] = await db.query(
    'SELECT * FROM job_postings WHERE user_id = ? ORDER BY created_at DESC',
    [user_id]
  );
  return rows;
}

async function getJobById(id) {
  const [rows] = await db.query('SELECT * FROM job_postings WHERE id = ?', [id]);
  return rows[0] || null;
}

async function deleteJob(id) {
  await db.query('DELETE FROM job_postings WHERE id = ?', [id]);
}

module.exports = { createJob, getJobsByUser, getJobById, deleteJob };
