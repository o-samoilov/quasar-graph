import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LoginRequiredError, InvalidGrantError } from '../src/auth/errors.js';

test('LoginRequiredError default message is the exact skill-facing contract text', () => {
  assert.equal(
    new LoginRequiredError().message,
    'Not authenticated with the quasar-graph backend. Run the "login" tool, then retry.',
  );
});

test('LoginRequiredError accepts a custom message', () => {
  assert.equal(new LoginRequiredError('custom').message, 'custom');
});

test('LoginRequiredError has the right name and is an Error', () => {
  const err = new LoginRequiredError();
  assert.equal(err.name, 'LoginRequiredError');
  assert.ok(err instanceof Error);
});

test('InvalidGrantError default message is the exact contract text', () => {
  assert.equal(new InvalidGrantError().message, 'OAuth grant was rejected by the backend.');
});

test('InvalidGrantError accepts a custom message', () => {
  assert.equal(new InvalidGrantError('custom').message, 'custom');
});

test('InvalidGrantError has the right name and is an Error', () => {
  const err = new InvalidGrantError();
  assert.equal(err.name, 'InvalidGrantError');
  assert.ok(err instanceof Error);
});
