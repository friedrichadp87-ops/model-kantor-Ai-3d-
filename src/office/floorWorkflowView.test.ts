import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialBuildingState,
  makeFloorAgentKey,
} from './buildingFloors';
import {
  buildFloorWorkflowSnapshot,
  getDivisionIdFromFloor,
  getFloorIdFromDivision,
} from './floorWorkflowView';
import {
  createDefaultChannelTemplates,
  createInitialShortsQueue,
} from './shortsFactory';
import type { TaskEntry } from './types';

describe('Floor Workflow View Model (Per-Floor YouTube Account Menu)', () => {
  it('maps floor division IDs bidirectionally for Lantai 1, 2, and 3', () => {
    assert.equal(getFloorIdFromDivision('lantai-1'), 1);
    assert.equal(getFloorIdFromDivision('lantai-2'), 2);
    assert.equal(getFloorIdFromDivision('lantai-3'), 3);
    assert.equal(getFloorIdFromDivision('dashboard'), null);

    assert.equal(getDivisionIdFromFloor(1), 'lantai-1');
    assert.equal(getDivisionIdFromFloor(2), 'lantai-2');
    assert.equal(getDivisionIdFromFloor(3), 'lantai-3');
  });

  it('builds distinct 8-stage workflows with floor-specific employees and API key slots per floor', () => {
    const building = createInitialBuildingState();
    const queue = createInitialShortsQueue();
    const templates = createDefaultChannelTemplates();
    const tasksByFloorAgent: Record<string, TaskEntry[]> = {
      [makeFloorAgentKey(2, 'bible-researcher')]: [
        {
          id: 't1',
          agentId: 'bible-researcher',
          prompt: 'Susun garis besar Kejadian 1',
          status: 'completed',
          createdAt: '2026-11-24T10:00:00Z',
        },
      ],
    };

    const l1 = buildFloorWorkflowSnapshot({
      floorId: 1,
      buildingState: building,
      shortsQueue: queue,
      channelTemplates: templates,
      tasksByFloorAgent,
    });
    const l2 = buildFloorWorkflowSnapshot({
      floorId: 2,
      buildingState: building,
      shortsQueue: queue,
      channelTemplates: templates,
      tasksByFloorAgent,
    });
    const l3 = buildFloorWorkflowSnapshot({
      floorId: 3,
      buildingState: building,
      shortsQueue: queue,
      channelTemplates: templates,
      tasksByFloorAgent,
    });

    assert.equal(l1.channelConfig.id, 'daily-faith-inspiration');
    assert.equal(l2.channelConfig.id, 'bible-stories-3d');
    assert.equal(l3.channelConfig.id, 'bible-facts-mysteries');

    assert.equal(l1.stages.length, 9);
    assert.equal(l2.stages.length, 9);
    assert.equal(l3.stages.length, 9);
    assert.equal(l2.stages[6].id, 'av_sync_check');
    assert.equal(l3.stages[6].id, 'av_sync_check');

    // Distinct floor-specific human employees lead stage 1 on each floor
    assert.equal(l1.stages[0].leadEmployee.name, 'Raka Mahendra');
    assert.equal(l2.stages[0].leadEmployee.name, 'Lukas Tanuwijaya');
    assert.equal(l3.stages[0].leadEmployee.name, 'Samuel Hutagalung');

    // Stage 6 (narration_audio) routes through each floor's ElevenLabs slot; others through Gemini slot
    assert.equal(l2.stages[0].apiSlotLabel, 'GEMINI_API_KEY_STORIES_3D');
    assert.equal(l2.stages[5].apiSlotLabel, 'ELEVENLABS_API_KEY_STORIES_3D');
    assert.equal(l3.stages[5].apiSlotLabel, 'ELEVENLABS_API_KEY_FACTS_MYSTERIES');

    // Filtered queue strictly belongs to that floor's YouTube channel
    assert.ok(l1.channelQueue.every((q) => q.channelId === 'daily-faith-inspiration'));
    assert.ok(l2.channelQueue.every((q) => q.channelId === 'bible-stories-3d'));
    assert.ok(l3.channelQueue.every((q) => q.channelId === 'bible-facts-mysteries'));

    // Task stats stay scoped strictly to L2
    assert.equal(l1.stats.completedTaskCount, 0);
    assert.equal(l2.stats.completedTaskCount, 1);
    assert.equal(l2.stages[0].leadEmployee.completedTaskCount, 1);
  });
});
