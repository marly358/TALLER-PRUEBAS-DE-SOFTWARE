const path = require('node:path');
const fs = require('node:fs');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
const { createApp } = require('./app');
const dbPath = path.resolve(__dirname, process.env.DB_PATH || './data/cineflex.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET requiere al menos 32 caracteres.');
const { app, db } = createApp({ dbPath, secret: process.env.JWT_SECRET,
  lockMs: Number(process.env.LOCK_MS || 60000), tokenTTL: process.env.JWT_EXPIRES_IN || '1h' });
const server = app.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => {
  console.log(`CineFlex mock: http://${process.env.HOST || '127.0.0.1'}:${server.address().port}`);
  if (!process.env.JWT_SECRET) console.log('Secreto efímero: al reiniciar se invalidan las sesiones. Configura backend/.env para conservarlas.');
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
