import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BUILDING_FLOORS,
  EMPLOYEES_PER_FLOOR,
  FLOOR_HEIGHT,
  FLOOR_ORDER,
  TOTAL_BUILDING_EMPLOYEES,
  assignFloorAgentTask,
  completeFloorAgentTask,
  computeBuildingUtilization,
  createInitialBuildingState,
  dispatchBuildingCommand,
  getAllBuildingEmployees,
  getChannelIdByFloor,
  getFloorByChannelId,
  getFloorCameraPreset,
  getFloorHumanAppearance,
  stepBuildingSimulation,
} from './buildingFloors';
import { AGENT_ORDER } from './layout';

test('BUILDING_FLOORS maps Lantai 1, 2, 3 to exact YouTube channels and 3 dedicated API key slots', () => {
  assert.deepEqual(FLOOR_ORDER, [1, 2, 3]);
  assert.equal(BUILDING_FLOORS[1].channelId, 'daily-faith-inspiration');
  assert.equal(BUILDING_FLOORS[2].channelId, 'bible-stories-3d');
  assert.equal(BUILDING_FLOORS[3].channelId, 'bible-facts-mysteries');

  assert.equal(BUILDING_FLOORS[1].elevationY, 0);
  assert.equal(BUILDING_FLOORS[2].elevationY, FLOOR_HEIGHT);
  assert.equal(BUILDING_FLOORS[3].elevationY, FLOOR_HEIGHT * 2);

  const geminiVars = new Set(FLOOR_ORDER.map((f) => BUILDING_FLOORS[f].geminiEnvVar));
  const elevenVars = new Set(FLOOR_ORDER.map((f) => BUILDING_FLOORS[f].elevenLabsEnvVar));
  assert.equal(geminiVars.size, 3);
  assert.equal(elevenVars.size, 3);

  assert.equal(getFloorByChannelId('daily-faith-inspiration').floorId, 1);
  assert.equal(getFloorByChannelId('bible-stories-3d').floorId, 2);
  assert.equal(getFloorByChannelId('bible-facts-mysteries').floorId, 3);
  assert.equal(getChannelIdByFloor(2), 'bible-stories-3d');
});

test('3-story office staffs exactly 39 unique human employees (3x 13 specialists)', () => {
  assert.equal(EMPLOYEES_PER_FLOOR, 13);
  assert.equal(TOTAL_BUILDING_EMPLOYEES, 39);

  const employees = getAllBuildingEmployees();
  assert.equal(employees.length, 39);

  const uniqueKeys = new Set(employees.map((e) => e.key));
  const uniqueNames = new Set(employees.map((e) => e.name));
  assert.equal(uniqueKeys.size, 39);
  assert.equal(uniqueNames.size, 39);

  // Visually distinct appearances across floors for the same role
  const ceoL1 = getFloorHumanAppearance(1, 'ceo');
  const ceoL2 = getFloorHumanAppearance(2, 'ceo');
  const ceoL3 = getFloorHumanAppearance(3, 'ceo');
  assert.notEqual(ceoL1.topHex, ceoL2.topHex);
  assert.notEqual(ceoL2.topHex, ceoL3.topHex);
});

test('BuildingSimulationState tracks 39 employees independently across all 3 floors', () => {
  let state = createInitialBuildingState();

  // Initial utilization across all 3 floors is 39/39 active (100%)
  const allSummary = computeBuildingUtilization(state, 'all');
  assert.equal(allSummary.total, 39);
  assert.equal(allSummary.activeCount, 39);
  assert.equal(allSummary.utilizationPercent, 100);
  assert.equal(allSummary.byFloor.length, 3);
  assert.equal(allSummary.byFloor[0].total, 13);

  // Sending coffee break only to Lantai 2 leaves Lantai 1 and Lantai 3 working
  state = dispatchBuildingCommand(state, 'coffee_break', 2);
  state = stepBuildingSimulation(state, 0.2);

  const l1 = computeBuildingUtilization(state, 1);
  const l2 = computeBuildingUtilization(state, 2);
  const l3 = computeBuildingUtilization(state, 3);
  assert.equal(l1.activeCount, 13);
  assert.equal(l2.idleCount, 13);
  assert.equal(l3.activeCount, 13);

  // Task assigned on Lantai 3 increments total building completedTaskCount
  state = assignFloorAgentTask(state, 3, 'bible-researcher', 't_l3_1', 'Riset sejarah Yerusalem');
  assert.equal(state.floors[3].agents['bible-researcher'].activeTaskId, 't_l3_1');
  assert.equal(state.floors[1].agents['bible-researcher'].activeTaskId, null);

  state = completeFloorAgentTask(state, 3, 'bible-researcher', 't_l3_1');
  assert.equal(state.completedTaskCount, 1);

  // Stepping simulation produces finite coordinates for all 39 employees
  for (let i = 0; i < 15; i++) {
    state = stepBuildingSimulation(state, 0.2);
  }
  for (const floorId of FLOOR_ORDER) {
    for (const agentId of AGENT_ORDER) {
      const a = state.floors[floorId].agents[agentId];
      assert.ok(Number.isFinite(a.x) && Number.isFinite(a.z));
    }
  }
});

test('getFloorCameraPreset elevates camera accurately for each floor and frames all 3 floors in tower view', () => {
  const towerOverview = getFloorCameraPreset('overview', 'all');
  const l1Overview = getFloorCameraPreset('overview', 1);
  const l2Overview = getFloorCameraPreset('overview', 2);
  const l3Overview = getFloorCameraPreset('overview', 3);

  assert.ok(towerOverview.position.x > l1Overview.position.x);
  assert.equal(l2Overview.target.y - l1Overview.target.y, FLOOR_HEIGHT);
  assert.equal(l3Overview.target.y - l1Overview.target.y, FLOOR_HEIGHT * 2);
});
