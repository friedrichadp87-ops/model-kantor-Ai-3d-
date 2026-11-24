import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendActivityLog,
  createInitialActivityLog,
  diffAgentActivityEvents,
  formatLogTimestamp,
} from './activityLog';
import {
  assignAgentTask,
  completeAgentTask,
  createInitialSimulationState,
  dispatchOfficeCommand,
  stepOfficeSimulation,
} from './simulation';

test('formatLogTimestamp produces zero-padded 24-hour HH:MM:SS', () => {
  const d = new Date(2026, 10, 20, 8, 5, 9);
  assert.equal(formatLogTimestamp(d), '08:05:09');
});

test('createInitialActivityLog seeds timestamped startup entries for all 13 agents', () => {
  const state = createInitialSimulationState();
  const entries = createInitialActivityLog(state, new Date(2026, 10, 20, 9, 30, 0));
  assert.equal(entries.length, 13);
  assert.ok(entries.every((e) => e.timestamp === '09:30:00'));
  assert.ok(
    entries.some((e) => e.message === 'Bima Saputra mulai merakit video vertikal 9:16')
  );
  assert.ok(
    entries.some((e) => e.message === 'Elena Pratama mulai mengoordinasi pembagian tugas')
  );
});

test('diffAgentActivityEvents emits walking, meeting join, and meeting completion messages', () => {
  const initial = createInitialSimulationState();
  const standup = dispatchOfficeCommand(initial, 'standup');

  const startWalking = diffAgentActivityEvents(initial, standup, new Date(2026, 10, 20, 10, 0, 1));
  assert.equal(startWalking.length, 13);
  assert.ok(
    startWalking.some((e) => e.agentId === 'bible-researcher' && e.message.includes('Ruang Rapat'))
  );

  // Advance until all 13 arrive in meeting room
  let inMeeting = standup;
  for (let i = 0; i < 180; i++) {
    inMeeting = stepOfficeSimulation(inMeeting, 0.15);
  }
  const arrivedMeeting = diffAgentActivityEvents(standup, inMeeting, new Date(2026, 10, 20, 10, 1, 0));
  assert.ok(arrivedMeeting.some((e) => e.message === 'Bima Saputra bergabung di rapat tim'));

  // Leave meeting back to desks -> emits meeting completion + walking back
  const leavingMeeting = dispatchOfficeCommand(inMeeting, 'back_to_work');
  const leaveEvents = diffAgentActivityEvents(inMeeting, leavingMeeting, new Date(2026, 10, 20, 10, 5, 0));
  assert.ok(leaveEvents.some((e) => e.message === 'Bima Saputra menyelesaikan rapat tim'));
  assert.ok(leaveEvents.some((e) => e.message.includes('Bima Saputra kembali ke meja kerja')));
});

test('diffAgentActivityEvents logs user task assignment and completion', () => {
  const s0 = createInitialSimulationState();
  const s1 = assignAgentTask(s0, 'bible-researcher', 't1', 'Verifikasi konteks Mazmur 23');
  const assignedEvents = diffAgentActivityEvents(s0, s1);
  assert.ok(assignedEvents.some((e) => e.message === 'Aria Santoso menerima tugas AI baru'));

  const s2 = completeAgentTask(s1, 'bible-researcher', 't1');
  const doneEvents = diffAgentActivityEvents(s1, s2);
  assert.ok(doneEvents.some((e) => e.message === 'Aria Santoso menyelesaikan tugas AI'));
});

test('appendActivityLog prepends newest events and respects maxEntries cap', () => {
  const s0 = createInitialSimulationState();
  let log = createInitialActivityLog(s0);
  const s1 = dispatchOfficeCommand(s0, 'coffee_break');
  const incoming = diffAgentActivityEvents(s0, s1);

  log = appendActivityLog(log, incoming, 6);
  assert.equal(log.length, 6);
  assert.equal(log[0].category, 'transit');
});
