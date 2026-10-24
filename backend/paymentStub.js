const { randomUUID } = require('node:crypto');

// Contrato simulado: nunca envía datos al banco ni realiza cobros reales.
function pay(cardNumber) {
  if (cardNumber === '4111111111111111') {
    return { approved: true, reference: `stub-${randomUUID()}` };
  }
  if (cardNumber === '4000000000000002') {
    return { approved: false, status: 402, code: 'PAYMENT_DECLINED', message: 'Tarjeta rechazada por el banco simulado.' };
  }
  if (cardNumber === '4000000000009995') {
    return { approved: false, status: 503, code: 'BANK_UNAVAILABLE', message: 'Banco simulado temporalmente no disponible.' };
  }
  return { approved: false, status: 400, code: 'INVALID_CARD', message: 'Tarjeta de prueba no válida.' };
}
module.exports = { pay };
