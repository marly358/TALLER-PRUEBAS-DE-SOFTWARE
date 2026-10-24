const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pay } = require('../paymentStub');
test('Stub devuelve aprobación y referencia distinta por transacción', () => {
  const first = pay('4111111111111111'), second = pay('4111111111111111');
  assert.equal(first.approved, true); assert.match(first.reference, /^stub-/); assert.notEqual(first.reference, second.reference);
});
test('Stub distingue tarjeta falsa, rechazo bancario e indisponibilidad', () => {
  assert.equal(pay('0000000000000000').status, 400);
  assert.equal(pay('4000000000000002').status, 402);
  assert.equal(pay('4000000000009995').status, 503);
});
