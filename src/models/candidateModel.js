const db = require('../config/db');

async function createCandidate({
  job_id,
  name,
  email,
  phone,
  resume_path,
  resume_url,
  resume_text,
  ai_summary,
  skills_json,
  github_url = null,
  linkedin_url = null,
  portfolio_url = null,
  current_role = null,
  total_experience_years = null,
  match_score = 0,
}) {
  const [result] = await db.query(
    `INSERT INTO candidates 
     (job_id, name, email, phone, resume_path, resume_url, resume_text, ai_summary, skills_json, github_url, linkedin_url, portfolio_url, current_role, total_experience_years, match_score) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      job_id,
      name,
      email,
      phone,
      resume_path,
      resume_url,
      resume_text,
      ai_summary,
      JSON.stringify(skills_json),
      github_url,
      linkedin_url,
      portfolio_url,
      current_role,
      total_experience_years,
      match_score,
    ]
  );
  return result.insertId;
}

async function getCandidateById(id) {
  const [rows] = await db.query(
    'SELECT candidates.*, candidates.id AS candidate_id FROM candidates WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}

async function getCandidateDeleteData(id) {
  const [rows] = await db.query(
    'SELECT id, id AS candidate_id, resume_path, resume_url FROM candidates WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}

async function getCandidatesByJob(job_id) {
  const [rows] = await db.query(
    `SELECT candidates.*, candidates.id AS candidate_id FROM candidates
     WHERE job_id = ?
     ORDER BY COALESCE(match_score, 0) DESC, created_at DESC`,
    [job_id]
  );
  return rows;
}

async function getLatestCandidateByJobId(job_id) {
  const [rows] = await db.query(
    `SELECT candidates.*, candidates.id AS candidate_id FROM candidates
     WHERE job_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [job_id]
  );
  return rows[0] || null;
}

async function updateCandidateStatus(id, status) {
  await db.query('UPDATE candidates SET status = ? WHERE id = ?', [status, id]);
}

async function updateCandidateGithub(id, github_url) {
  await db.query('UPDATE candidates SET github_url = ? WHERE id = ?', [github_url, id]);
}

async function deleteCandidate(id) {
  await db.query('DELETE FROM candidates WHERE id = ?', [id]);
}

async function saveGithubData(candidateId, { repos_json, languages_json }) {
  await db.query(
    `INSERT INTO github_data (candidate_id, repos_json, languages_json)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE repos_json = VALUES(repos_json), languages_json = VALUES(languages_json), fetched_at = NOW()`,
    [candidateId, JSON.stringify(repos_json), JSON.stringify(languages_json)]
  );
}

async function getGithubData(candidateId) {
  const [rows] = await db.query(
    'SELECT * FROM github_data WHERE candidate_id = ?',
    [candidateId]
  );
  return rows[0] || null;
}

async function updateMatchScore(id, match_score) {
  await db.query(
    'UPDATE candidates SET match_score = ? WHERE id = ?',
    [match_score, id]
  );
}

async function updateTrustScore(id, trust_score, red_flags) {
  await db.query(
    'UPDATE candidates SET trust_score = ?, red_flags = ? WHERE id = ?',
    [trust_score, JSON.stringify(red_flags), id]
  );
}
module.exports = {
  createCandidate,
  getCandidateById,
  getCandidateDeleteData,
  getCandidatesByJob,
  getLatestCandidateByJobId,
  updateCandidateStatus,
  updateCandidateGithub,
  deleteCandidate,
  saveGithubData,
  getGithubData,
  updateMatchScore,
  updateTrustScore,
};
