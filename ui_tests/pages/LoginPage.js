const { By, until } = require('selenium-webdriver');
class LoginPage {
  constructor(driver) {
    this.driver = driver;
    this.email = By.id('email'); this.password = By.id('password');
    this.button = By.id('login-button'); this.error = By.id('login-error');
    this.view = By.id('login-view');
  }
  async abrir(baseUrl) {
    await this.driver.get(baseUrl);
    await this.driver.executeScript('sessionStorage.clear(); location.hash="login";');
    await this.driver.navigate().refresh();
    await this.driver.wait(until.elementIsVisible(await this.driver.findElement(this.view)), 10000);
  }
  async ingresarCredenciales(email, password) {
    const emailInput = await this.driver.findElement(this.email);
    const passwordInput = await this.driver.findElement(this.password);
    await emailInput.clear(); await emailInput.sendKeys(email);
    await passwordInput.clear(); await passwordInput.sendKeys(password);
    const button = await this.driver.findElement(this.button);
    await this.driver.wait(until.elementIsEnabled(button), 10000);
    await button.click();
  }
  async obtenerError() {
    await this.driver.wait(async () => (await this.driver.findElement(this.error).getText()).length > 0, 10000);
    await this.driver.wait(until.elementIsEnabled(await this.driver.findElement(this.button)), 10000);
    return this.driver.findElement(this.error).getText();
  }
  async esperarVisible() { await this.driver.wait(until.elementIsVisible(await this.driver.findElement(this.view)), 10000); }
  async visible() { return this.driver.findElement(this.view).isDisplayed(); }
}
module.exports = LoginPage;
