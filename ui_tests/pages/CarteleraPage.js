const { By, until, Select } = require('selenium-webdriver');
class CarteleraPage {
  constructor(driver) {
    this.driver = driver; this.title = By.id('cartelera-title');
    this.cards = By.css('.movie-card'); this.genre = By.id('genre');
    this.logout = By.id('logout'); this.view = By.id('cartelera-view');
  }
  async esperarVisible() { await this.driver.wait(until.elementIsVisible(await this.driver.findElement(this.title)), 10000); }
  async obtenerTitulo() { return this.driver.findElement(this.title).getText(); }
  async contarPeliculas() { return (await this.driver.findElements(this.cards)).length; }
  async filtrarGenero(genre) {
    await new Select(await this.driver.findElement(this.genre)).selectByValue(genre);
    await this.driver.wait(async () => {
      const cards = await this.driver.findElements(this.cards);
      if (!genre) return cards.length === 3;
      return cards.length === 1 && await cards[0].getAttribute('data-genre') === genre;
    }, 10000);
  }
  async obtenerGeneros() {
    return Promise.all((await this.driver.findElements(this.cards)).map(card => card.getAttribute('data-genre')));
  }
  async hacerClicComprar(id = 1) { await this.driver.findElement(By.id(`buy-${id}`)).click(); }
  async cerrarSesion() { await this.driver.findElement(this.logout).click(); }
  async visible() { return this.driver.findElement(this.view).isDisplayed(); }
}
module.exports = CarteleraPage;
