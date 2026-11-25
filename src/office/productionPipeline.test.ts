import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHANNEL_KEY_ROUTING,
  CHANNEL_WORKFLOW_BLUEPRINTS,
  buildPipelineSrt,
  computePipelineProgress,
  createInitialStageStatuses,
  evaluateFinalQcGate,
  normalizeTimestampedScenes,
  resolveChannelKeySlot,
  validateOneCommandInput,
} from './productionPipeline';
import { AGENT_ORDER } from './layout';

test('CHANNEL_KEY_ROUTING defines unique server-side env var slots for all 3 YouTube channels', () => {
  const slots = [
    resolveChannelKeySlot('bible-stories-3d'),
    resolveChannelKeySlot('daily-faith-inspiration'),
    resolveChannelKeySlot('bible-facts-mysteries'),
  ];
  const geminiVars = new Set(slots.map((s) => s.geminiEnvVar));
  const elevenVars = new Set(slots.map((s) => s.elevenLabsEnvVar));

  assert.equal(geminiVars.size, 3);
  assert.equal(elevenVars.size, 3);
  assert.equal(CHANNEL_KEY_ROUTING['bible-stories-3d'].geminiEnvVar, 'GEMINI_API_KEY_STORIES_3D');
  assert.equal(
    CHANNEL_KEY_ROUTING['daily-faith-inspiration'].geminiEnvVar,
    'GEMINI_API_KEY_DAILY_FAITH'
  );
  assert.equal(
    CHANNEL_KEY_ROUTING['bible-facts-mysteries'].geminiEnvVar,
    'GEMINI_API_KEY_FACTS_MYSTERIES'
  );
});

test('CHANNEL_WORKFLOW_BLUEPRINTS defines 9 ordered stages (including QC Tahap 1 A/V Sync) mapped to real 3D agents per channel', () => {
  const channelIds = [
    'bible-stories-3d',
    'daily-faith-inspiration',
    'bible-facts-mysteries',
  ] as const;

  for (const channelId of channelIds) {
    const bp = CHANNEL_WORKFLOW_BLUEPRINTS[channelId];
    assert.equal(bp.stages.length, 9);
    assert.equal(bp.stages[0].id, 'story_plan');
    assert.equal(bp.stages[6].id, 'av_sync_check');
    assert.equal(bp.stages[7].id, 'assemble_video');
    assert.equal(bp.stages[8].id, 'final_qc');
    assert.ok(bp.sampleCommands.length >= 2);
    for (const stage of bp.stages) {
      assert.ok(AGENT_ORDER.includes(stage.leadAgentId));
      for (const support of stage.supportAgentIds) {
        assert.ok(AGENT_ORDER.includes(support));
      }
    }
  }
});

test('validateOneCommandInput validates channel, command length, duration, and scene count', () => {
  assert.equal(
    validateOneCommandInput({
      channelId: 'bible-stories-3d',
      command: 'Pendek',
    }).ok,
    false
  );

  const valid = validateOneCommandInput({
    channelId: 'bible-stories-3d',
    command: 'Buatkan episode 1 penciptaan dunia Kejadian 1 untuk channel Bible Stories 3D',
    bookScope: 'Kejadian 1',
    durationSeconds: 45,
    sceneCount: 4,
    animationMode: 'keyframe_to_video',
    generateAudio: true,
  });

  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.value.durationSeconds, 45);
    assert.equal(valid.value.sceneCount, 4);
    assert.equal(valid.value.animationMode, 'keyframe_to_video');
  }
});

test('normalizeTimestampedScenes creates contiguous non-overlapping timestamps and valid SRT', () => {
  const scenes = normalizeTimestampedScenes(
    [
      { narrationText: 'Pada mulanya Allah menciptakan langit dan bumi.' },
      { narrationText: 'Berfirmanlah Allah: Jadilah terang.' },
      { narrationText: 'Lalu Allah melihat segala yang dijadikan-Nya sungguh amat baik.' },
      { narrationText: 'Mari bersyukur atas karya penciptaan Tuhan hari ini.' },
    ],
    45,
    4
  );

  assert.equal(scenes.length, 4);
  assert.equal(scenes[0].startSec, 0);
  assert.equal(scenes[scenes.length - 1].endSec, 45);
  for (let i = 1; i < scenes.length; i++) {
    assert.equal(scenes[i].startSec, scenes[i - 1].endSec);
    assert.ok(scenes[i].durationSec >= 3 && scenes[i].durationSec <= 15);
  }

  const srt = buildPipelineSrt(scenes);
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:12,000/);
  assert.match(srt, /4\n00:00:34,000 --> 00:00:45,000/);

  // Daily Faith 2m 50d (170s) across 6 atmospheric background scenes
  const devotionalScenes = normalizeTimestampedScenes([], 170, 6);
  assert.equal(devotionalScenes.length, 6);
  assert.equal(devotionalScenes[0].startSec, 0);
  assert.equal(devotionalScenes[5].endSec, 170);
  assert.equal(devotionalScenes[5].timecodeLabel.endsWith('02:50'), true);

  // Bible Stories 3D & Bible Facts 2m 50d (170s) across 17 exact 10-second scenes
  const tenSecScenes = normalizeTimestampedScenes([], 170, 17);
  assert.equal(tenSecScenes.length, 17);
  assert.equal(tenSecScenes[0].timecodeLabel, '00:00 – 00:10');
  assert.equal(tenSecScenes[16].timecodeLabel, '02:40 – 02:50');
  assert.ok(tenSecScenes.every((s) => s.durationSec === 10));
});

test('evaluateFinalQcGate and computePipelineProgress enforce strict final QC readiness', () => {
  assert.equal(
    evaluateFinalQcGate({
      verdict: 'LULUS',
      planAlignmentScore: 92,
      scriptMatch: true,
      theologicalPassed: true,
      pastoralPassed: true,
    }),
    true
  );

  assert.equal(
    evaluateFinalQcGate({
      verdict: 'LULUS',
      planAlignmentScore: 70,
      scriptMatch: true,
      theologicalPassed: true,
      pastoralPassed: true,
    }),
    false
  );

  assert.equal(
    evaluateFinalQcGate({
      verdict: 'PERLU REVISI',
      planAlignmentScore: 95,
      scriptMatch: true,
      theologicalPassed: true,
      pastoralPassed: true,
    }),
    false
  );

  const statuses = createInitialStageStatuses();
  statuses.story_plan = 'completed';
  statuses.script_arc = 'completed';
  statuses.timestamps = 'completed';
  statuses.narration_audio = 'warning';
  const progress = computePipelineProgress(statuses);
  assert.equal(progress.completedCount, 4);
  assert.equal(progress.totalStages, 9);
  assert.equal(progress.percent, 44);
});
