require('dotenv').config();
const app = require('./src/app');
const pool = require('./src/config/db');
const { ensureDatabaseSchema } = require('./src/config/db');

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    const connection = await pool.getConnection();
    connection.release();
    await ensureDatabaseSchema();

    console.log('MySQL connected');
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    const passwordConfigured =
      typeof process.env.DB_PASSWORD === 'string' &&
      process.env.DB_PASSWORD.length > 0;

    if (err.code === 'ER_ACCESS_DENIED_ERROR' && !passwordConfigured) {
      console.error(
        'DB connection failed: DB_PASSWORD is empty in .env, but MySQL rejected a passwordless login for this user.'
      );
      console.error(
        'Set DB_PASSWORD in your .env to the actual MySQL password for DB_USER.'
      );
    } else {
      console.error('DB connection failed:', err.message);
    }

    process.exit(1);
  }
}

start();
