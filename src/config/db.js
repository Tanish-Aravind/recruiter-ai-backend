const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

async function ensureDatabaseSchema() {
  const [rows] = await pool.query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = 'candidates'
        AND COLUMN_NAME IN (
          'linkedin_url',
          'portfolio_url',
          'current_role',
          'total_experience_years'
        )
    `,
    [process.env.DB_NAME]
  );

  const existingColumns = new Set(rows.map((row) => row.COLUMN_NAME));
  const missingColumns = [
    ['linkedin_url', 'TEXT NULL'],
    ['portfolio_url', 'TEXT NULL'],
    ['current_role', 'VARCHAR(255) NULL'],
    ['total_experience_years', 'DECIMAL(4,1) NULL'],
  ].filter(([columnName]) => !existingColumns.has(columnName));

  for (const [columnName, definition] of missingColumns) {
    await pool.query(
      `ALTER TABLE candidates ADD COLUMN ${columnName} ${definition}`
    );
  }
}

module.exports = pool;
module.exports.ensureDatabaseSchema = ensureDatabaseSchema;
