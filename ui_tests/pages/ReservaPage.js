const { By, until } = require('selenium-webdriver');
class ReservaPage {
  constructor(driver) {
    this.driver = driver; this.title = By.id('movie-title'); this.payButton = By.id('pay-button');
    this.card = By.id('card-number'); this.error = By.id('payment-error');
    this.ticket = By.id('ticket-title'); this.selected = By.id('selected-seat');
  }
  async esperarVisible() { await this.driver.wait(until.elementIsVisible(await this.driver.findElement(this.title)), 10000); }
  async obtenerTitulo() { return this.driver.findElement(this.title).getText(); }
  async contarAsientos() { return (await this.driver.findElements(By.css('.seat'))).length; }
  async asientoHabilitado(seat) { return this.driver.findElement(By.id(`seat-${seat}`)).isEnabled(); }
  async seleccionarAsiento(seat) { await this.driver.findElement(By.id(`seat-${seat}`)).click(); }
  async seleccionarLibre() {
    const seat = await this.driver.findElement(By.css('.seat:not(:disabled)'));
    const id = await seat.getText(); await seat.click(); return id;
  }
  async obtenerAsientoSeleccionado() { return this.driver.findElement(this.selected).getText(); }
  async contarSeleccionados() { return (await this.driver.findElements(By.css('.seat.selected'))).length; }
  async pagoHabilitado() { return this.driver.findElement(this.payButton).isEnabled(); }
  async pagar(cardNumber) {
    const card = await this.driver.findElement(this.card); await card.clear(); await card.sendKeys(cardNumber);
    await this.driver.findElement(this.payButton).click();
  }
  async obtenerError() {
    await this.driver.wait(async () => (await this.driver.findElement(this.error).getText()).length > 0, 10000);
    await this.driver.wait(until.elementIsEnabled(await this.driver.findElement(this.payButton)), 10000);
    return this.driver.findElement(this.error).getText();
  }
  async obtenerTicket() {
    await this.driver.wait(until.elementIsVisible(await this.driver.findElement(this.ticket)), 10000);
    const result = {};
    for (const name of ['title', 'movie', 'seat', 'total', 'id']) result[name] = await this.driver.findElement(By.id(`ticket-${name}`)).getText();
    return result;
  }
  async volver() { await this.driver.findElement(By.id('back-cartelera')).click(); }
  async nuevaReserva() { await this.driver.findElement(By.id('new-booking')).click(); }
}
module.exports = ReservaPage;
