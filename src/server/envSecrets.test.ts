import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidEnvSecret, sanitizeEnvDefault } from './envSecrets';

test('isValidEnvSecret rejects empty values, runtime sentinel "0", and placeholders', () => {
  assert.equal(isValidEnvSecret(undefined, 'MY_GEMINI_API_KEY'), false);
  assert.equal(isValidEnvSecret('', 'MY_GEMINI_API_KEY'), false);
  assert.equal(isValidEnvSecret('0', 'MY_GEMINI_API_KEY'), false);
  assert.equal(isValidEnvSecret('null', 'MY_GEMINI_API_KEY'), false);
  assert.equal(isValidEnvSecret('undefined', 'MY_GEMINI_API_KEY'), false);
  assert.equal(isValidEnvSecret('MY_GEMINI_API_KEY', 'MY_GEMINI_API_KEY'), false);
  assert.equal(isValidEnvSecret('short', 'MY_GEMINI_API_KEY'), false);
  assert.equal(
    isValidEnvSecret('AIzaSyD-ExampleValidGeminiKey123456789', 'MY_GEMINI_API_KEY'),
    true
  );
});

test('sanitizeEnvDefault falls back when runtime injects "0" or empty sentinels', () => {
  assert.equal(sanitizeEnvDefault(undefined, 'llama3.2'), 'llama3.2');
  assert.equal(sanitizeEnvDefault('0', 'llama3.2'), 'llama3.2');
  assert.equal(sanitizeEnvDefault('   ', 'http://127.0.0.1:11434'), 'http://127.0.0.1:11434');
  assert.equal(sanitizeEnvDefault('null', '21m00Tcm4TlvDq8ikWAM'), '21m00Tcm4TlvDq8ikWAM');
  assert.equal(sanitizeEnvDefault('qwen2.5:7b', 'llama3.2'), 'qwen2.5:7b');
});
