const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../app');
let db, server, base, token;
beforeEach(async () => {
  const instance = createApp({ log: false }); db = instance.db;
  server = instance.app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const login = await request('/login', { email: 'demo@cineflex.test', password: 'CineFlex123!' }, false);
  token = login.body.token;
});
afterEach(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
async function request(route, body, auth = true, method) {
  const response = await fetch(`${base}/api${route}`, { method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
const reserve = (cardNumber, seat = 'B1', extra = {}) => request('/reservations', { movieId: 1, seat, cardNumber, ...extra });
test('API protege cartelera sin JWT y configura Helmet/no-store', async () => {
  const result = await request('/movies', null, false); assert.equal(result.status, 401);
  assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(result.headers.get('cache-control'), 'no-store');
});
test('API valida JWT adulterado', async () => { token += 'alterado'; assert.equal((await request('/movies')).status, 401); });
test('API filtra género y devuelve 24 asientos', async () => {
  assert.equal((await request('/movies?genre=Comedia')).body.movies.length, 1);
  assert.equal((await request('/movies/1/seats')).body.seats.length, 24);
});
test('API bloqueo persiste aunque se envíe la contraseña correcta', async () => {
  for (let n = 1; n <= 3; n++) assert.equal((await request('/login', { email: 'bloqueo@cineflex.test', password: 'mal' }, false)).status, n === 3 ? 423 : 401);
  assert.equal((await request('/login', { email: 'bloqueo@cineflex.test', password: 'CineFlex123!' }, false)).status, 423);
});
test('API expirar bloqueo permite volver a iniciar sesión', async () => {
  db.prepare('UPDATE users SET locked_until=?,failures=3 WHERE id=1').run(Date.now() - 1);
  assert.equal((await request('/login', { email: 'demo@cineflex.test', password: 'CineFlex123!' }, false)).status, 200);
});
test('API logout revoca también un token guardado fuera del navegador', async () => {
  assert.equal((await request('/logout', {}, true)).status, 200);
  assert.equal((await request('/movies')).status, 401);
});
test('API no acepta JWT vencido', async () => {
  db.prepare('UPDATE sessions SET expires=0').run(); assert.equal((await request('/movies')).status, 401);
});
test('API tarjeta falsa no crea reservas', async () => {
  const result = await reserve('1234567890123456'); assert.equal(result.status, 400);
  assert.equal(result.body.code, 'INVALID_CARD');
  assert.equal(db.prepare("SELECT count(*) AS total FROM reservations WHERE seat='B1'").get().total, 0);
});
test('API banco rechazado o no disponible no ocupa asiento', async () => {
  assert.equal((await reserve('4000000000000002')).status, 402);
  assert.equal((await reserve('4000000000009995')).status, 503);
  assert.equal((await request('/movies/1/seats')).body.seats.find(s => s.id === 'B1').available, true);
});
test('API ticket guarda precio del servidor, nunca el enviado por el cliente', async () => {
  const result = await reserve('4111111111111111', 'B1', { total: 1 });
  assert.equal(result.status, 201); assert.equal(result.body.ticket.total, 18000);
  assert.equal(db.prepare('SELECT total FROM reservations WHERE id=?').get(result.body.ticket.id).total, 18000);
});
test('API concurrencia: solo una de 12 compras del mismo asiento se confirma', async () => {
  const results = await Promise.all(Array.from({ length: 12 }, () => reserve('4111111111111111', 'C1')));
  assert.equal(results.filter(r => r.status === 201).length, 1);
  assert.equal(results.filter(r => r.status === 409).length, 11);
});
test('API rechaza asiento inexistente y película desconocida', async () => {
  assert.equal((await reserve('4111111111111111', 'Z9')).status, 400);
  assert.equal((await request('/movies/999/seats')).status, 404);
  assert.equal((await reserve('4111111111111111', 'C2', { movieId: 999 })).status, 404);
});
test('API entrada incompleta y JSON malformado no revelan detalles internos', async () => {
  assert.equal((await request('/login', {}, false)).status, 400);
  const response = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(response.status, 400); assert.equal((await response.json()).code, 'INVALID_REQUEST');
});
