const jwt = require('jsonwebtoken');
const db = require('../config/db');

async function getOrCreateDevUser() {
  const email = process.env.DEV_USER_EMAIL || 'dev@local.test';
  const name = process.env.DEV_USER_NAME || 'Local Dev User';

  const [existingRows] = await db.query(
    'SELECT id, email, name, avatar FROM users WHERE email = ? LIMIT 1',
    [email]
  );

  if (existingRows.length > 0) {
    return existingRows[0];
  }

  const [result] = await db.query(
    'INSERT INTO users (google_id, email, name, avatar) VALUES (?, ?, ?, ?)',
    [`dev-${email}`, email, name, null]
  );

  return {
    id: result.insertId,
    email,
    name,
    avatar: null,
  };
}

async function getUserById(id) {
  const [rows] = await db.query(
    'SELECT id, email, name, avatar FROM users WHERE id = ? LIMIT 1',
    [id]
  );

  return rows[0] || null;
}

module.exports = async (req, res, next) => {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

  if (!token) {
    if (process.env.DEV_AUTH_BYPASS === 'true') {
      try {
        req.user = await getOrCreateDevUser();
        return next();
      } catch (err) {
        return res.status(500).json({ error: `Dev auth setup failed: ${err.message}` });
      }
    }

    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded?.id) {
      const dbUser = await getUserById(decoded.id);

      if (dbUser) {
        req.user = {
          ...decoded,
          id: dbUser.id,
          email: dbUser.email,
          name: dbUser.name,
          avatar: dbUser.avatar,
        };
        return next();
      }
    }

    if (process.env.DEV_AUTH_BYPASS === 'true') {
      req.user = await getOrCreateDevUser();
      return next();
    }

    req.user = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
