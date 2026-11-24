import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SPECIALIST_AGENTS,
  filterSpecialists,
  getSpecialistById,
  getSpecialistLiveStatus,
} from './agentRoster';
import { AGENT_PROFILES, CAMERA_PRESETS } from './layout';
import { createInitialSimulationState } from './simulation';
import { WORKSPACE_DIVISIONS } from './workspaceDivisions';

test('SPECIALIST_AGENTS defines all 13 named roles matching reference roster', () => {
  assert.equal(SPECIALIST_AGENTS.length, 13);

  const uniqueIds = new Set(SPECIALIST_AGENTS.map((a) => a.id));
  const uniqueNames = new Set(SPECIALIST_AGENTS.map((a) => a.personName));
  assert.equal(uniqueIds.size, 13);
  assert.equal(uniqueNames.size, 13);

  const expectedTitles = [
    'CEO Agent',
    'Trend Researcher',
    'Bible Researcher',
    'Scriptwriter',
    'Theological Guardian',
    'Pastoral Sensitivity Checker',
    'Storyboard Artist',
    'Visual Curator',
    'Video Composer',
    'Voice Artist',
    'Video Editor',
    'SEO & Publisher',
    'Community / Prayer Manager',
  ];
  assert.deepEqual(
    SPECIALIST_AGENTS.map((a) => a.roleTitle),
    expectedTitles
  );

  const divisionIds = new Set(WORKSPACE_DIVISIONS.map((d) => d.id));
  for (const agent of SPECIALIST_AGENTS) {
    assert.ok(AGENT_PROFILES[agent.id], `Missing dedicated 3D character profile for ${agent.id}`);
    assert.equal(AGENT_PROFILES[agent.id].name, agent.personName);
    assert.ok(CAMERA_PRESETS[agent.officeZone], `Invalid office zone for ${agent.id}`);
    assert.ok(divisionIds.has(agent.divisionId), `Invalid divisionId for ${agent.id}`);
    assert.ok(agent.responsibilities.length >= 2);
  }
});

test('filterSpecialists filters accurately by group and search query', () => {
  const guardians = filterSpecialists(SPECIALIST_AGENTS, 'penjaga-pastoral', '');
  assert.equal(guardians.length, 2);
  assert.deepEqual(
    guardians.map((a) => a.id),
    ['theological-guardian', 'pastoral-checker']
  );

  const byName = filterSpecialists(SPECIALIST_AGENTS, 'all', 'Hanna');
  assert.equal(byName.length, 1);
  assert.equal(byName[0]?.roleTitle, 'Community / Prayer Manager');

  const byTask = filterSpecialists(SPECIALIST_AGENTS, 'all', 'Openverse');
  assert.equal(byTask.length, 1);
  assert.equal(byTask[0]?.personName, 'Kevin Suryadi');
});

test('getSpecialistLiveStatus reports Siap by default and Bekerja when that 3D agent has an active task', () => {
  const simState = createInitialSimulationState();
  const ceo = getSpecialistById('ceo')!;
  const editor = getSpecialistById('video-editor')!;

  assert.deepEqual(getSpecialistLiveStatus(ceo, simState), {
    code: 'ready',
    label: 'Siap',
  });

  simState.agents['video-editor'].activeTaskId = 'task_123';
  assert.deepEqual(getSpecialistLiveStatus(editor, simState), {
    code: 'working',
    label: 'Bekerja',
  });
});
