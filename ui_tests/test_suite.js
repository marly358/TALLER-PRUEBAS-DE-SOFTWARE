const assert = require('node:assert/strict');
const fs = require('node:fs');
const { Builder } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const LoginPage = require('./pages/LoginPage');
const CarteleraPage = require('./pages/CarteleraPage');
const ReservaPage = require('./pages/ReservaPage');
const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:3000';
async function main() {
  const options = new chrome.Options().addArguments('--window-size=1440,1100', '--disable-dev-shm-usage');
  if (process.env.HEADLESS !== 'false') options.addArguments('--headless=new');
  if (process.env.CHROME_NO_SANDBOX === 'true') options.addArguments('--no-sandbox');
  if (process.env.CHROME_BIN) options.setChromeBinaryPath(process.env.CHROME_BIN);
  const builder = new Builder().forBrowser('chrome').setChromeOptions(options);
  if (process.env.CHROMEDRIVER_BIN) builder.setChromeService(new chrome.ServiceBuilder(process.env.CHROMEDRIVER_BIN));
  const driver = await builder.build();
  const login = new LoginPage(driver), cartelera = new CarteleraPage(driver), reserva = new ReservaPage(driver);
  const results = [];
  async function entrar() {
    await login.ingresarCredenciales('demo@cineflex.test', 'CineFlex123!'); await cartelera.esperarVisible();
  }
  async function comprar() { await entrar(); await cartelera.hacerClicComprar(); await reserva.esperarVisible(); }
  const cases = [
    ['UI-01 Login visible al abrir', async () => assert.equal(await login.visible(), true)],
    ['UI-02 Credenciales incorrectas', async () => {
      await login.ingresarCredenciales('demo@cineflex.test', 'incorrecta'); assert.equal(await login.obtenerError(), 'Credenciales incorrectas.');
    }],
    ['UI-03 Bloqueo tras tres errores y rechazo de clave correcta', async () => {
      for (let i = 0; i < 3; i++) { await login.ingresarCredenciales('bloqueo@cineflex.test', 'incorrecta'); await login.obtenerError(); }
      assert.match(await login.obtenerError(), /Cuenta bloqueada/);
      await login.ingresarCredenciales('bloqueo@cineflex.test', 'CineFlex123!'); assert.match(await login.obtenerError(), /Cuenta bloqueada/);
    }],
    ['UI-04 Login exitoso y título Cartelera', async () => { await entrar(); assert.equal(await cartelera.obtenerTitulo(), 'Cartelera'); }],
    ['UI-05 Cartelera contiene tres películas', async () => { await entrar(); assert.equal(await cartelera.contarPeliculas(), 3); }],
    ['UI-06 Filtro por género', async () => { await entrar(); await cartelera.filtrarGenero('Suspenso'); assert.deepEqual(await cartelera.obtenerGeneros(), ['Suspenso']); }],
    ['UI-07 Restaurar todos los géneros', async () => { await entrar(); await cartelera.filtrarGenero('Comedia'); await cartelera.filtrarGenero(''); assert.equal(await cartelera.contarPeliculas(), 3); }],
    ['UI-08 Seleccionar película correcta', async () => { await comprar(); assert.equal(await reserva.obtenerTitulo(), 'Órbita: el último viaje'); }],
    ['UI-09 Mapa de 24 asientos', async () => { await comprar(); assert.equal(await reserva.contarAsientos(), 24); }],
    ['UI-10 Asiento ocupado no seleccionable', async () => { await comprar(); assert.equal(await reserva.asientoHabilitado('A1'), false); }],
    ['UI-11 Pago deshabilitado sin asiento', async () => { await comprar(); assert.equal(await reserva.pagoHabilitado(), false); }],
    ['UI-12 Seleccionar un asiento libre', async () => { await comprar(); await reserva.seleccionarAsiento('D1'); assert.equal(await reserva.obtenerAsientoSeleccionado(), 'D1'); assert.equal(await reserva.pagoHabilitado(), true); }],
    ['UI-13 Cambiar asiento conserva una sola selección', async () => { await comprar(); await reserva.seleccionarAsiento('D1'); await reserva.seleccionarAsiento('D2'); assert.equal(await reserva.obtenerAsientoSeleccionado(), 'D2'); assert.equal(await reserva.contarSeleccionados(), 1); }],
    ['UI-14 Tarjeta falsa devuelve mensaje correcto', async () => { await comprar(); await reserva.seleccionarAsiento('D3'); await reserva.pagar('1234567890123456'); assert.equal(await reserva.obtenerError(), 'Tarjeta de prueba no válida.'); }],
    ['UI-15 Rechazo bancario no ocupa asiento', async () => { await comprar(); await reserva.seleccionarAsiento('D4'); await reserva.pagar('4000000000000002'); assert.equal(await reserva.obtenerError(), 'Tarjeta rechazada por el banco simulado.'); await reserva.volver(); await cartelera.esperarVisible(); await cartelera.hacerClicComprar(); await reserva.esperarVisible(); assert.equal(await reserva.asientoHabilitado('D4'), true); }],
    ['UI-16 Compra completa y ticket virtual', async () => {
      await comprar(); const seat = await reserva.seleccionarLibre(); await reserva.pagar('4111111111111111'); const ticket = await reserva.obtenerTicket();
      assert.equal(ticket.title, 'Ticket virtual'); assert.equal(ticket.movie, 'Órbita: el último viaje'); assert.equal(ticket.seat, seat); assert.match(ticket.total, /18.000/); assert.match(ticket.id, /^CF-/);
      fs.writeFileSync('artifacts/ticket.png', await driver.takeScreenshot(), 'base64');
      await reserva.nuevaReserva(); await cartelera.esperarVisible(); await cartelera.hacerClicComprar(); await reserva.esperarVisible(); assert.equal(await reserva.asientoHabilitado(seat), false);
    }],
    ['UI-17 Regresar de reserva a cartelera', async () => { await comprar(); await reserva.volver(); await cartelera.esperarVisible(); assert.equal(await cartelera.obtenerTitulo(), 'Cartelera'); }],
    ['UI-18 Cerrar sesión y botón Atrás', async () => {
      await comprar(); await cartelera.cerrarSesion(); await login.esperarVisible(); await driver.navigate().back(); await login.esperarVisible();
      assert.equal(await login.visible(), true); assert.equal(await cartelera.visible(), false);
      assert.equal(await driver.executeScript('return sessionStorage.getItem("cineflex-token")'), null);
    }],
    ['UI-19 URL protegida sin sesión', async () => { await driver.get(`${baseUrl}/#cartelera`); await login.esperarVisible(); assert.equal(await cartelera.visible(), false); }],
    ['UI-20 Recarga conserva sesión válida', async () => { await entrar(); await driver.navigate().refresh(); await cartelera.esperarVisible(); assert.equal(await cartelera.obtenerTitulo(), 'Cartelera'); }]
  ];
  fs.mkdirSync('artifacts', { recursive: true });
  try {
    for (const [name, test] of cases) {
      const started = Date.now();
      try { await login.abrir(baseUrl); await test(); results.push({ name, passed: true, ms: Date.now() - started }); console.log(`✓ ${name}`); }
      catch (error) { results.push({ name, passed: false, error: error.message }); console.error(`✗ ${name}: ${error.message}`); fs.writeFileSync(`artifacts/${name.slice(0, 5)}-error.png`, await driver.takeScreenshot(), 'base64'); }
    }
  } finally { await driver.quit(); fs.writeFileSync('artifacts/selenium.json', JSON.stringify(results, null, 2)); }
  console.log(`${results.filter(r => r.passed).length}/${cases.length} casos UI aprobados.`);
  if (results.some(r => !r.passed)) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
