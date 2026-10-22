require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'migrations');
const baseline = process.argv.includes('--baseline');

async function main() {
  const { DB_HOST = 'localhost', DB_PORT = '3306', DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (!DB_USER || !DB_NAME) {
    console.error('Missing DB_USER or DB_NAME. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    multipleStatements: true,
  });

  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await conn.query(`USE \`${DB_NAME}\``);
    await conn.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name VARCHAR(255) NOT NULL PRIMARY KEY,
         applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    );

    const [rows] = await conn.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip      ${file}`);
        continue;
      }
      if (baseline) {
        await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
        console.log(`baseline  ${file}`);
        count++;
        continue;
      }
      // The files start with "USE baas_db;". Remove it so the DB_NAME from .env is used.
      const sql = fs
        .readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
        .replace(/^\s*USE\s+[^;]+;\s*$/gim, '');
      await conn.query(sql);
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
      console.log(`applied   ${file}`);
      count++;
    }

    console.log(
      count === 0
        ? 'Database is up to date.'
        : `Done. ${count} migration(s) ${baseline ? 'marked as applied' : 'applied'}.`,
    );
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});