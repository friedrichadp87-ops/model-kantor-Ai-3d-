import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignAgentTask,
  createInitialSimulationState,
  dispatchOfficeCommand,
  stepOfficeSimulation,
} from './simulation';
import {
  classifyAgentUtilization,
  computeUtilizationSummary,
} from './utilization';

test('classifyAgentUtilization maps productive states to active and break/transit to idle', () => {
  assert.equal(classifyAgentUtilization('working', false), 'active');
  assert.equal(classifyAgentUtilization('meeting', false), 'active');
  assert.equal(classifyAgentUtilization('server_check', false), 'active');
  assert.equal(classifyAgentUtilization('executing_task', true), 'active');
  assert.equal(classifyAgentUtilization('walking', true), 'active');
  assert.equal(classifyAgentUtilization('walking', false), 'idle');
  assert.equal(classifyAgentUtilization('coffee_break', false), 'idle');
});

test('initial office state reports 100% active utilization across all 13 agents', () => {
  const state = createInitialSimulationState();
  const summary = computeUtilizationSummary(state);

  assert.equal(summary.total, 13);
  assert.equal(summary.activeCount, 13);
  assert.equal(summary.idleCount, 0);
  assert.equal(summary.utilizationPercent, 100);
  assert.equal(summary.slices[0].key, 'active');
  assert.equal(summary.slices[0].count, 13);
  assert.equal(summary.slices[1].key, 'idle');
  assert.equal(summary.slices[1].count, 0);
});

test('coffee break shifts idle counts dynamically while assigned agent stays active', () => {
  let state = createInitialSimulationState();
  state = assignAgentTask(state, 'video-composer', 'task-api', 'Rakit komposisi Shorts 9:16');
  state = dispatchOfficeCommand(state, 'coffee_break');

  // Advance until agents arrive at the lounge
  for (let i = 0; i < 160; i++) {
    state = stepOfficeSimulation(state, 0.15);
  }

  const summary = computeUtilizationSummary(state);
  assert.equal(summary.total, 13);
  assert.equal(summary.activeCount, 1);
  assert.equal(summary.idleCount, 12);
  assert.equal(summary.executingTaskCount, 1);
  assert.equal(summary.utilizationPercent, Math.round((1 / 13) * 100));
  assert.equal(summary.slices[0].percent + summary.slices[1].percent, 100);
});

test('standup command returns utilization to 100% once all 13 agents reach the meeting room', () => {
  let state = createInitialSimulationState();
  state = dispatchOfficeCommand(state, 'standup');

  // Immediately after command, idle agents are in transit (walking)
  const midSummary = computeUtilizationSummary(state);
  assert.equal(midSummary.idleCount, 13);
  assert.equal(midSummary.utilizationPercent, 0);

  // Advance until everyone sits in the meeting room
  for (let i = 0; i < 180; i++) {
    state = stepOfficeSimulation(state, 0.15);
  }

  const arrivedSummary = computeUtilizationSummary(state);
  assert.equal(arrivedSummary.activeCount, 13);
  assert.equal(arrivedSummary.idleCount, 0);
  assert.equal(arrivedSummary.utilizationPercent, 100);
});
