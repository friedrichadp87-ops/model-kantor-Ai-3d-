import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignAgentTask,
  completeAgentTask,
  createInitialSimulationState,
  dispatchOfficeCommand,
  failAgentTask,
  findWaypointPath,
  stepOfficeSimulation,
  validateTaskPrompt,
} from './simulation';
import { AGENT_ORDER, WAYPOINTS } from './layout';

test('findWaypointPath routes cleanly across rooms via valid neighbor edges', () => {
  const path = findWaypointPath('desk_bible', 'meet_1');
  assert.ok(path.length >= 4, 'path should traverse corridor and meeting door');
  assert.equal(path[path.length - 1], 'meet_1');
  assert.ok(path.includes('meeting_door'), 'path must pass through meeting room doorway');

  // Verify every consecutive step is an allowed graph edge
  let prev = 'desk_bible';
  for (const nodeId of path) {
    assert.ok(
      WAYPOINTS[prev].neighbors.includes(nodeId),
      `expected edge from ${prev} to ${nodeId}`
    );
    prev = nodeId;
  }
});

test('findWaypointPath routes video-composer desk to server bay through server door', () => {
  const path = findWaypointPath('desk_composer', 'server_bay_2');
  assert.ok(path.includes('server_door'), 'must enter server room through glass doorway');
  assert.equal(path[path.length - 1], 'server_bay_2');
});

test('dispatchOfficeCommand standup routes all idle agents to unique meeting seats', () => {
  let state = createInitialSimulationState();
  state = dispatchOfficeCommand(state, 'standup');
  assert.equal(state.officeMode, 'rapat');

  const targets = new Set<string>();
  for (const id of AGENT_ORDER) {
    assert.equal(state.agents[id].activity, 'walking');
    assert.equal(state.agents[id].targetActivity, 'meeting');
    targets.add(state.agents[id].targetWaypointId);
  }
  assert.equal(targets.size, AGENT_ORDER.length, 'each agent gets a unique meeting spot');

  // Advance simulation until all agents arrive at meeting room
  for (let i = 0; i < 160; i++) {
    state = stepOfficeSimulation(state, 0.15);
  }

  for (const id of AGENT_ORDER) {
    assert.equal(state.agents[id].activity, 'meeting');
    assert.equal(state.agents[id].currentZone, 'rapat');
    assert.equal(state.agents[id].pathQueue.length, 0);
  }
});

test('validateTaskPrompt rejects blank or too-short prompts and trims valid prompts', () => {
  assert.equal(validateTaskPrompt('   ').valid, false);
  assert.equal(validateTaskPrompt('hi').valid, false);
  const ok = validateTaskPrompt('  Rancang API katalog produk  ');
  assert.equal(ok.valid, true);
  assert.equal(ok.trimmed, 'Rancang API katalog produk');
});

test('assignAgentTask locks agent focus, completes and increments completedTaskCount', () => {
  let state = createInitialSimulationState();
  assert.equal(AGENT_ORDER.length, 13);
  state = dispatchOfficeCommand(state, 'coffee_break');
  // Assign a server data task to Theological Guardian (Dharma Wijaya)
  state = assignAgentTask(
    state,
    'theological-guardian',
    'task-1',
    'Audit teks Alkitab lokal pada rak server'
  );
  assert.equal(state.agents['theological-guardian'].activeTaskId, 'task-1');
  assert.equal(state.agents['theological-guardian'].targetWaypointId, 'server_bay_1');

  // Standup command should not pull Dharma off an active user task
  state = dispatchOfficeCommand(state, 'standup');
  assert.equal(state.agents['theological-guardian'].activeTaskId, 'task-1');
  assert.equal(state.agents['theological-guardian'].targetWaypointId, 'server_bay_1');

  // Complete task
  state = completeAgentTask(state, 'theological-guardian', 'task-1');
  assert.equal(state.agents['theological-guardian'].activeTaskId, null);
  assert.equal(state.completedTaskCount, 1);

  // Assign & fail task does not increment completed count
  state = assignAgentTask(state, 'video-composer', 'task-2', 'Render komposisi 9:16');
  state = failAgentTask(state, 'video-composer', 'task-2');
  assert.equal(state.agents['video-composer'].activeTaskId, null);
  assert.equal(state.completedTaskCount, 1);
});

test('autonomous routines advance over time without NaN coordinates', () => {
  let state = createInitialSimulationState();
  for (let i = 0; i < 200; i++) {
    state = stepOfficeSimulation(state, 0.2);
  }

  let movedCount = 0;
  for (const id of AGENT_ORDER) {
    const a = state.agents[id];
    assert.ok(Number.isFinite(a.x) && Number.isFinite(a.z) && Number.isFinite(a.yaw));
    if (a.activity !== 'working' || a.pathQueue.length > 0) {
      movedCount += 1;
    }
  }
  assert.ok(movedCount >= 1, 'at least one agent should have entered an autonomous routine');
});
