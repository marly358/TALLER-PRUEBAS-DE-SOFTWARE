const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { createDatabase, checkPassword } = require('./database');
const paymentStub = require('./paymentStub');

const SEATS = ['A', 'B', 'C', 'D'].flatMap(row => [1, 2, 3, 4, 5, 6].map(n => `${row}${n}`));
function createApp({ dbPath = ':memory:', secret = randomUUID() + randomUUID(), lockMs = 60000,
  tokenTTL = '1h', log = true, pay = paymentStub.pay } = {}) {
  const db = createDatabase(dbPath);
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': null } },
    strictTransportSecurity: false })); // HTTP local; habilitar HSTS tras configurar HTTPS real.
  if (log) app.use(morgan(':method :url :status :response-time ms'));
  app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '10kb' }));
  const fail = (res, status, code, message) => res.status(status).json({ code, message });
  function protect(req, res, next) {
    try {
      const token = /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1];
      const payload = jwt.verify(token || '', secret, { algorithms: ['HS256'], issuer: 'cineflex', audience: 'cineflex-web' });
      const session = db.prepare('SELECT * FROM sessions WHERE id=? AND expires>?').get(payload.jti, Date.now());
      if (!session || session.user_id !== Number(payload.sub)) throw new Error('Invalid session');
      req.auth = payload;
      next();
    } catch { return fail(res, 401, 'UNAUTHORIZED', 'Inicia sesión para continuar.'); }
  }
  app.get('/api/health', (req, res) => res.json({ status: 'ok', mode: 'mock' }));
  app.post('/api/login', (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || email.length > 254 || password.length > 128) {
      return fail(res, 400, 'INVALID_INPUT', 'Correo y contraseña son obligatorios.');
    }
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(email.trim().toLowerCase());
    if (user?.locked_until > Date.now()) return fail(res, 423, 'ACCOUNT_LOCKED', 'Cuenta bloqueada durante 60 segundos.');
    if (!user || !checkPassword(password, user.password)) {
      if (user) {
        const failures = user.locked_until ? 1 : user.failures + 1;
        db.prepare('UPDATE users SET failures=?,locked_until=? WHERE id=?')
          .run(failures, failures >= 3 ? Date.now() + lockMs : 0, user.id);
        if (failures >= 3) return fail(res, 423, 'ACCOUNT_LOCKED', 'Cuenta bloqueada durante 60 segundos.');
      }
      return fail(res, 401, 'INVALID_CREDENTIALS', 'Credenciales incorrectas.');
    }
    db.prepare('UPDATE users SET failures=0,locked_until=0 WHERE id=?').run(user.id);
    const id = randomUUID();
    const token = jwt.sign({}, secret, { algorithm: 'HS256', subject: String(user.id), jwtid: id,
      issuer: 'cineflex', audience: 'cineflex-web', expiresIn: tokenTTL });
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(id, user.id, jwt.decode(token).exp * 1000);
    db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
    res.json({ token, user: { email: user.email } });
  });
  app.post('/api/logout', protect, (req, res) => {
    db.prepare('DELETE FROM sessions WHERE id=?').run(req.auth.jti);
    res.json({ message: 'Sesión cerrada.' });
  });
  app.get('/api/movies', protect, (req, res) => {
    const movies = typeof req.query.genre === 'string'
      ? db.prepare('SELECT * FROM movies WHERE genre=?').all(req.query.genre)
      : db.prepare('SELECT * FROM movies').all();
    res.json({ movies });
  });
  app.get('/api/movies/:id/seats', protect, (req, res) => {
    const movie = db.prepare('SELECT * FROM movies WHERE id=?').get(req.params.id);
    if (!movie) return fail(res, 404, 'MOVIE_NOT_FOUND', 'Película no encontrada.');
    const occupied = new Set(db.prepare('SELECT seat FROM reservations WHERE movie_id=?').all(movie.id).map(r => r.seat));
    res.json({ movieId: movie.id, seats: SEATS.map(id => ({ id, available: !occupied.has(id) })) });
  });
  app.post('/api/reservations', protect, (req, res) => {
    const { movieId, seat, cardNumber } = req.body || {};
    if (!Number.isInteger(movieId) || !SEATS.includes(seat) || typeof cardNumber !== 'string') {
      return fail(res, 400, 'INVALID_INPUT', 'Selecciona una película, un asiento y una tarjeta.');
    }
    const movie = db.prepare('SELECT * FROM movies WHERE id=?').get(movieId);
    if (!movie) return fail(res, 404, 'MOVIE_NOT_FOUND', 'Película no encontrada.');
    // El stub es síncrono; la transacción y UNIQUE evitan vender dos veces un asiento.
    db.exec('BEGIN IMMEDIATE');
    try {
      if (db.prepare('SELECT id FROM reservations WHERE movie_id=? AND seat=?').get(movieId, seat)) {
        db.exec('ROLLBACK');
        return fail(res, 409, 'SEAT_TAKEN', 'El asiento ya está ocupado. Elige otro.');
      }
      const payment = pay(cardNumber);
      if (!payment.approved) {
        db.exec('ROLLBACK');
        return fail(res, payment.status, payment.code, payment.message);
      }
      const ticket = { id: `CF-${randomUUID()}`, movieId, movie: movie.title, seat, total: movie.price, currency: 'COP' };
      db.prepare('INSERT INTO reservations VALUES(?,?,?,?,?,?,?)')
        .run(ticket.id, Number(req.auth.sub), movieId, seat, movie.price, payment.reference, new Date().toISOString());
      db.exec('COMMIT');
      return res.status(201).json({ ticket });
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  });
  app.use(express.static(path.join(__dirname, '../frontend')));
  app.use((req, res) => fail(res, 404, 'NOT_FOUND', 'Ruta no encontrada.'));
  app.use((error, req, res, next) => {
    const status = error.status >= 400 && error.status < 500 ? error.status : 500;
    fail(res, status, status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      status === 500 ? 'Error interno del servidor.' : 'Petición no válida.');
  });
  return { app, db };
}
module.exports = { createApp };
