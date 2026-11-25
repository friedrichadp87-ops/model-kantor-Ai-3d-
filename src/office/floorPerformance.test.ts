import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assignFloorAgentTask,
  createInitialBuildingState,
  dispatchBuildingCommand,
  makeFloorAgentKey,
  stepBuildingSimulation,
} from './buildingFloors';
import {
  FLOOR_QUICK_PROMPTS,
  computeFloorPerformanceMetrics,
  filterFloorEmployees,
  validateFloorAssignment,
} from './floorPerformance';
import { createInitialShortsQueue } from './shortsFactory';
import type { TaskEntry } from './types';

test('computeFloorPerformanceMetrics aggregates live activity, tasks, and Shorts counts per floor', () => {
  let state = createInitialBuildingState();
  // Send Lantai 1 to coffee break, keep Lantai 2 working, assign an active task on Lantai 3
  state = dispatchBuildingCommand(state, 'coffee_break', 1);
  for (let i = 0; i < 40; i++) {
    state = stepBuildingSimulation(state, 0.25);
  }
  state = assignFloorAgentTask(state, 3, 'bible-researcher', 't_f3_1', 'Riset fakta Yerusalem');

  const tasksByFloorAgent: Record<string, TaskEntry[]> = {
    [makeFloorAgentKey(1, 'scriptwriter')]: [
      {
        id: 't_f1_done',
        agentId: 'scriptwriter',
        prompt: 'Renungan Mazmur 23',
        status: 'completed',
        output: 'Selesai',
        createdAt: '2026-11-24T10:00:00.000Z',
        completedAt: '2026-11-24T10:00:05.000Z',
      },
    ],
    [makeFloorAgentKey(2, 'storyboard-artist')]: [
      {
        id: 't_f2_done',
        agentId: 'storyboard-artist',
        prompt: 'Storyboard Daud',
        status: 'completed',
        output: 'Selesai',
        createdAt: '2026-11-24T10:01:00.000Z',
      },
      {
        id: 't_f2_err',
        agentId: 'storyboard-artist',
        prompt: 'Render gagal',
        status: 'error',
        error: 'Timeout',
        createdAt: '2026-11-24T10:02:00.000Z',
      },
    ],
    [makeFloorAgentKey(3, 'bible-researcher')]: [
      {
        id: 't_f3_1',
        agentId: 'bible-researcher',
        prompt: 'Riset fakta Yerusalem',
        status: 'running',
        createdAt: '2026-11-24T10:03:00.000Z',
      },
    ],
  };

  const queue = createInitialShortsQueue();
  const metrics = computeFloorPerformanceMetrics(state, tasksByFloorAgent, queue);

  assert.equal(metrics[1].channelId, 'daily-faith-inspiration');
  assert.equal(metrics[2].channelId, 'bible-stories-3d');
  assert.equal(metrics[3].channelId, 'bible-facts-mysteries');

  assert.equal(metrics[1].totalAgents, 13);
  assert.equal(metrics[1].officeMode, 'istirahat');
  assert.equal(metrics[1].completedTasks, 1);
  assert.equal(metrics[1].completionRatePercent, 100);

  assert.equal(metrics[2].completedTasks, 1);
  assert.equal(metrics[2].failedTasks, 1);
  assert.equal(metrics[2].completionRatePercent, 50);

  assert.equal(metrics[3].runningTasks, 1);
  assert.equal(metrics[3].executingAgents, 1);
  assert.equal(metrics[3].recentTasks[0]?.employeeName, 'Samuel Hutagalung');
});

test('filterFloorEmployees filters by bucket, executing flag, and search query', () => {
  let state = createInitialBuildingState();
  state = assignFloorAgentTask(state, 2, 'ceo', 't_ceo', 'Koordinasi episode 3D');
  const metrics = computeFloorPerformanceMetrics(state, {}, []);
  const floor2Employees = metrics[2].employees;

  const executingOnly = filterFloorEmployees(floor2Employees, 'executing', '');
  assert.equal(executingOnly.length, 1);
  assert.equal(executingOnly[0].agentId, 'ceo');
  assert.equal(executingOnly[0].name, 'Maya Kartika');

  const searchByName = filterFloorEmployees(floor2Employees, 'all', 'lukas');
  assert.equal(searchByName.length, 1);
  assert.equal(searchByName[0].agentId, 'bible-researcher');
});

test('validateFloorAssignment enforces valid floor, agent, and prompt and presets cover all 3 floors', () => {
  assert.equal(FLOOR_QUICK_PROMPTS[1].length, 3);
  assert.equal(FLOOR_QUICK_PROMPTS[2].length, 3);
  assert.equal(FLOOR_QUICK_PROMPTS[3].length, 3);

  const badFloor = validateFloorAssignment({
    floorId: 4,
    agentId: 'ceo',
    prompt: 'Susun renungan pagi',
  });
  assert.equal(badFloor.valid, false);

  const badAgent = validateFloorAssignment({
    floorId: 2,
    agentId: 'unknown-role',
    prompt: 'Buat storyboard 3D',
  });
  assert.equal(badAgent.valid, false);

  const badPrompt = validateFloorAssignment({
    floorId: 3,
    agentId: 'bible-researcher',
    prompt: '   ',
  });
  assert.equal(badPrompt.valid, false);

  const ok = validateFloorAssignment({
    floorId: 2,
    agentId: 'storyboard-artist',
    prompt: '  Buat storyboard adegan Daud & Goliat  ',
  });
  assert.equal(ok.valid, true);
  assert.equal(ok.floorId, 2);
  assert.equal(ok.agentId, 'storyboard-artist');
  assert.equal(ok.trimmedPrompt, 'Buat storyboard adegan Daud & Goliat');
});
