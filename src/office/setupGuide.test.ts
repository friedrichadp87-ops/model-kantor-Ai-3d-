import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GEMINI_SECRET_VARIABLES,
  SETUP_GUIDE_STEPS,
  computeChecklistProgress,
  shouldAutoOpenSetupGuide,
} from './setupGuide';

test('shouldAutoOpenSetupGuide opens on first launch, respects dismissal and ?autostart=1', () => {
  assert.equal(shouldAutoOpenSetupGuide({ dismissedFlag: null, searchQuery: '' }), true);
  assert.equal(shouldAutoOpenSetupGuide({ dismissedFlag: 'false', searchQuery: '' }), true);
  assert.equal(shouldAutoOpenSetupGuide({ dismissedFlag: 'true', searchQuery: '' }), false);
  assert.equal(
    shouldAutoOpenSetupGuide({ dismissedFlag: null, searchQuery: '?autostart=1' }),
    false
  );
  assert.equal(
    shouldAutoOpenSetupGuide({ dismissedFlag: null, searchQuery: '?floor=1&autostart=1' }),
    false
  );
});

test('computeChecklistProgress tracks unique valid step IDs accurately', () => {
  assert.deepEqual(computeChecklistProgress([]), { completed: 0, total: 3, percent: 0 });
  assert.deepEqual(computeChecklistProgress(['get-gemini-key']), {
    completed: 1,
    total: 3,
    percent: 33,
  });
  assert.deepEqual(
    computeChecklistProgress(['get-gemini-key', 'set-secrets', 'get-gemini-key', 'unknown']),
    { completed: 2, total: 3, percent: 67 }
  );
  assert.deepEqual(
    computeChecklistProgress(['get-gemini-key', 'set-secrets', 'sync-firebase']),
    { completed: 3, total: 3, percent: 100 }
  );
});

test('SETUP_GUIDE_STEPS and GEMINI_SECRET_VARIABLES cover all 3 steps and global + 3 floor secret keys', () => {
  assert.equal(SETUP_GUIDE_STEPS.length, 3);
  assert.equal(GEMINI_SECRET_VARIABLES.length, 4);
  assert.equal(GEMINI_SECRET_VARIABLES[0].key, 'GEMINI_API_KEY');
  assert.equal(GEMINI_SECRET_VARIABLES[0].required, true);
  assert.ok(GEMINI_SECRET_VARIABLES.some((v) => v.key === 'GEMINI_API_KEY_DAILY_FAITH'));
  assert.ok(GEMINI_SECRET_VARIABLES.some((v) => v.key === 'GEMINI_API_KEY_STORIES_3D'));
  assert.ok(GEMINI_SECRET_VARIABLES.some((v) => v.key === 'GEMINI_API_KEY_FACTS_MYSTERIES'));
});
