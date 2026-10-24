const { DatabaseSync } = require('node:sqlite');
const { scryptSync, randomBytes, timingSafeEqual } = require('node:crypto');

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
function checkPassword(password, stored) {
  const [salt, digest] = stored.split(':');
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(digest, 'hex'));
}
function createDatabase(path) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON;
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
      failures INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS movies (
      id INTEGER PRIMARY KEY, title TEXT NOT NULL, genre TEXT NOT NULL, duration INTEGER NOT NULL, price INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      movie_id INTEGER NOT NULL REFERENCES movies(id), seat TEXT NOT NULL,
      total INTEGER NOT NULL, bank_reference TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(movie_id, seat));`);
  for (const email of ['demo@cineflex.test', 'bloqueo@cineflex.test']) {
    if (!db.prepare('SELECT id FROM users WHERE email=?').get(email)) {
      db.prepare('INSERT INTO users(email,password) VALUES(?,?)').run(email, hashPassword('CineFlex123!'));
    }
  }
  const insert = db.prepare('INSERT OR IGNORE INTO movies VALUES(?,?,?,?,?)');
  insert.run(1, 'Órbita: el último viaje', 'Ciencia ficción', 128, 18000);
  insert.run(2, 'La ciudad de los secretos', 'Suspenso', 106, 16000);
  insert.run(3, 'Un verano para recordar', 'Comedia', 98, 15000);
  db.prepare('INSERT OR IGNORE INTO reservations VALUES(?,?,?,?,?,?,?)')
    .run('CF-DEMO', 1, 1, 'A1', 18000, 'stub-seed', '2026-01-01T00:00:00.000Z');
  return db;
}
module.exports = { createDatabase, checkPassword };
