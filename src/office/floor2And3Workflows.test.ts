import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIBLE_FACT_CATEGORIES,
  buildBibleChapterStoryPlan,
  evaluateLocalAvSyncCheck,
} from './floor2And3Workflows';
import { normalizeTimestampedScenes } from './productionPipeline';

test('buildBibleChapterStoryPlan calculates exact 1-Pasal-1-Cerita counts for OT, NT, All, and single book', () => {
  const otPlan = buildBibleChapterStoryPlan({
    scopeType: 'old',
    startIndex: 0,
    batchSize: 6,
  });
  assert.equal(otPlan.bookCount, 39);
  assert.equal(otPlan.totalChapters, 929);
  assert.equal(otPlan.totalStories, 929);
  assert.equal(otPlan.episodes.length, 6);
  assert.equal(otPlan.episodes[0].reference, 'Kejadian 1');
  assert.equal(otPlan.episodes[0].episodeNumber, 1);
  assert.equal(otPlan.episodes[0].targetDurationSec, 170);
  assert.equal(otPlan.episodes[0].sceneCount, 17);
  assert.equal(otPlan.episodes[0].secondsPerScene, 10);
  assert.match(otPlan.episodes[0].continuityNote, /Kejadian 2/);

  const ntPlan = buildBibleChapterStoryPlan({ scopeType: 'new', startIndex: 0, batchSize: 4 });
  assert.equal(ntPlan.bookCount, 27);
  assert.equal(ntPlan.totalStories, 260);
  assert.equal(ntPlan.episodes[0].reference, 'Matius 1');

  const allPlan = buildBibleChapterStoryPlan({ scopeType: 'all', startIndex: 1188, batchSize: 4 });
  assert.equal(allPlan.bookCount, 66);
  assert.equal(allPlan.totalStories, 1189);
  assert.equal(allPlan.episodes.length, 1);
  assert.equal(allPlan.episodes[0].reference, 'Wahyu 22');
  assert.equal(allPlan.episodes[0].episodeNumber, 1189);

  const genesisPlan = buildBibleChapterStoryPlan({
    scopeType: 'book',
    bookId: 'kejadian',
    startIndex: 0,
    batchSize: 5,
  });
  assert.equal(genesisPlan.bookCount, 1);
  assert.equal(genesisPlan.totalStories, 50);
  assert.equal(genesisPlan.episodes[4].reference, 'Kejadian 5');
});

test('BIBLE_FACT_CATEGORIES covers archaeology, Hebrew/Greek original terms, and Bible mysteries', () => {
  const ids = BIBLE_FACT_CATEGORIES.map((c) => c.id);
  assert.deepEqual(ids, ['all', 'archaeology', 'hebrew_greek', 'mystery']);
});

test('evaluateLocalAvSyncCheck validates 17x10s scenes before Editor assembly', () => {
  const scenes = normalizeTimestampedScenes([], 170, 17).map((sc) => ({
    ...sc,
    keyframeStatus: 'completed' as const,
    keyframeDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    animationStatus: 'completed' as const,
  }));

  const passReport = evaluateLocalAvSyncCheck({
    scenes,
    hasNarrationAudio: true,
    expectedDurationSec: 170,
  });
  assert.equal(passReport.approvedForEditor, true);
  assert.equal(passReport.checkedSceneCount, 17);
  assert.equal(passReport.readyVisualCount, 17);
  assert.equal(passReport.matchScore, 100);

  // Missing visual on scene 3 blocks approval
  const incomplete = scenes.map((s, idx) =>
    idx === 2 ? { ...s, keyframeDataUrl: undefined, videoDataUrl: undefined } : s
  );
  const failReport = evaluateLocalAvSyncCheck({
    scenes: incomplete,
    hasNarrationAudio: true,
    expectedDurationSec: 170,
  });
  assert.equal(failReport.approvedForEditor, false);
  assert.equal(failReport.sceneChecks[2].audioVisualMatch, false);
});
