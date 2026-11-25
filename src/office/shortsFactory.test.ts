import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROTESTANT_BIBLE_BOOKS,
  PROTESTANT_BIBLE_GROUPS,
  YOUTUBE_CHANNELS,
  buildSrtFromScenes,
  canMarkReadyToPublish,
  computeScriptWordBudget,
  createDefaultChannelTemplates,
  createInitialShortsQueue,
  enforceThreeSentenceCap,
  estimateSeriesEpisodes,
  extractIndonesianBibleReferences,
  formatTemplatePromptDirectives,
  getJakartaOperationStatus,
  lookupLocalBibleReference,
  mergeChannelTemplates,
  parseLocalBibleJson,
  validateChannelTemplate,
  validateShortsBrief,
} from './shortsFactory.ts';

describe('3-Channel YouTube Shorts Factory Domain', () => {
  it('defines exactly 3 YouTube channels matching the AI Content Factory spec', () => {
    assert.equal(YOUTUBE_CHANNELS.length, 3);
    assert.deepEqual(
      YOUTUBE_CHANNELS.map((c) => c.id),
      ['bible-stories-3d', 'daily-faith-inspiration', 'bible-facts-mysteries']
    );
    assert.equal(YOUTUBE_CHANNELS[0].madeForKids, true);
    assert.equal(YOUTUBE_CHANNELS[1].madeForKids, false);
    assert.equal(YOUTUBE_CHANNELS[2].madeForKids, false);
  });

  it('contains the complete 66-book Protestant canon totaling 1,189 chapters across 10 groups', () => {
    assert.equal(PROTESTANT_BIBLE_GROUPS.length, 10);
    assert.equal(PROTESTANT_BIBLE_BOOKS.length, 66);

    const otBooks = PROTESTANT_BIBLE_BOOKS.filter((b) => b.testament === 'old');
    const ntBooks = PROTESTANT_BIBLE_BOOKS.filter((b) => b.testament === 'new');
    assert.equal(otBooks.length, 39);
    assert.equal(ntBooks.length, 27);

    const estimate = estimateSeriesEpisodes(PROTESTANT_BIBLE_BOOKS);
    assert.equal(estimate.totalBooks, 66);
    assert.equal(estimate.totalChapters, 1189);
    assert.ok(estimate.estimatedEpisodes > 150 && estimate.estimatedEpisodes < 450);
  });

  it('detects Sunday 06:00–15:00 WIB rest window accurately in Asia/Jakarta timezone', () => {
    // Sunday 2026-11-22 10:00 WIB = 2026-11-22T03:00:00Z
    const sundayRest = getJakartaOperationStatus(new Date('2026-11-22T03:00:00Z'));
    assert.equal(sundayRest.isSundayRest, true);
    assert.equal(sundayRest.weekday, 'Minggu');
    assert.equal(sundayRest.hour, 10);

    // Sunday 2026-11-22 15:00 WIB = 2026-11-22T08:00:00Z (active again)
    const sundayAfterRest = getJakartaOperationStatus(new Date('2026-11-22T08:00:00Z'));
    assert.equal(sundayAfterRest.isSundayRest, false);

    // Saturday 2026-11-21 10:00 WIB = 2026-11-21T03:00:00Z (active)
    const saturday = getJakartaOperationStatus(new Date('2026-11-21T03:00:00Z'));
    assert.equal(saturday.isSundayRest, false);
  });

  it('extracts Indonesian Bible references and parses/looks up local indo_tb.json verses', () => {
    const refs = extractIndonesianBibleReferences(
      'Kita belajar dari Keluaran 14:21-22 dan juga Mazmur 23 serta 1 Samuel 17:45.'
    );
    assert.deepEqual(refs, ['Keluaran 14:21-22', 'Mazmur 23', '1 Samuel 17:45']);

    const sampleJson = JSON.stringify({
      metadata: {
        name: 'Alkitab Terjemahan Baru (TB)',
        publisher: 'LAI',
        year: 1974,
        copyright_statement: 'Hak cipta LAI',
      },
      verses: [
        { book_name: 'Keluaran', chapter: 14, verse: 21, text: 'Lalu Musa mengulurkan tangannya ke atas laut.' },
        { book_name: 'Keluaran', chapter: 14, verse: 22, text: 'Demikianlah orang Israel berjalan dari tengah-tengah laut.' },
      ],
    });
    const db = parseLocalBibleJson(sampleJson);
    assert.equal(db.report.indexedVerseCount, 2);
    assert.equal(db.report.bookCount, 1);
    assert.equal(db.report.missingBookCount, 65);

    const hit = lookupLocalBibleReference(db.versesMap, 'Keluaran 14:21-22');
    assert.equal(hit.found, true);
    assert.equal(hit.verses.length, 2);

    const miss = lookupLocalBibleReference(db.versesMap, 'Keluaran 14:21-23');
    assert.equal(miss.found, false);
    assert.deepEqual(miss.missingRefs, ['Keluaran 14:23']);
  });

  it('builds non-overlapping SRT subtitles matching total duration and caps community replies to 3 sentences', () => {
    const srt = buildSrtFromScenes(
      [
        {
          sceneNumber: 1,
          visualTitle: 'Pembuka',
          narrationSegment: 'Tuhan selalu setia menyertai langkah kita setiap hari.',
          veoPrompt: 'Vertical 9:16 sunlit path',
          cameraMovement: 'Slow push in',
          mood: 'Hopeful',
          characters: [],
        },
        {
          sceneNumber: 2,
          visualTitle: 'Penutup',
          narrationSegment: 'Tetaplah berharap dan berdoa hari ini.',
          veoPrompt: 'Vertical 9:16 warm sunrise',
          cameraMovement: 'Gentle pan',
          mood: 'Peaceful',
          characters: [],
        },
      ],
      30
    );

    assert.ok(srt.includes('00:00:00,000 -->'));
    assert.ok(srt.includes('--> 00:00:30,000'));
    assert.ok(srt.includes('Tuhan selalu setia'));

    const capped = enforceThreeSentenceCap(
      'Kalimat satu. Kalimat dua! Kalimat tiga? Kalimat empat tidak boleh masuk.'
    );
    assert.equal(capped, 'Kalimat satu. Kalimat dua! Kalimat tiga?');
  });

  it('enforces Guardian gate before Siap Publikasi and validates brief inputs', () => {
    assert.equal(
      canMarkReadyToPublish({
        theologicalGuardian: {
          status: 'LULUS',
          summary: 'OK',
          referencesChecked: [],
          fatalErrors: [],
          warnings: [],
          manualVerification: [],
          suggestedReplacements: [],
        },
        pastoralSensitivity: {
          status: 'PERLU REVISI',
          summary: 'Perlu pelunakan nada',
          findings: ['Nada terlalu keras'],
          saferSuggestions: ['Gunakan kalimat penuh empati'],
        },
      }),
      false
    );

    assert.equal(
      canMarkReadyToPublish({
        theologicalGuardian: {
          status: 'LULUS',
          summary: 'OK',
          referencesChecked: [],
          fatalErrors: [],
          warnings: [],
          manualVerification: [],
          suggestedReplacements: [],
        },
        pastoralSensitivity: {
          status: 'LULUS',
          summary: 'Aman',
          findings: [],
          saferSuggestions: [],
        },
      }),
      true
    );

    const budget = computeScriptWordBudget(45);
    assert.equal(budget.minWords, 65);
    assert.equal(budget.maxWords, 94);

    assert.equal(
      validateShortsBrief({ channelId: 'bible-stories-3d', title: 'Daud dan Goliat', durationSeconds: 45 }).ok,
      true
    );
    assert.equal(
      validateShortsBrief({ channelId: 'unknown', title: 'X', durationSeconds: 45 }).ok,
      false
    );
    assert.equal(createInitialShortsQueue().length, 3);
  });

  it('manages per-channel templates (script, visual style, duration) with validation and safe merge', () => {
    const defaults = createDefaultChannelTemplates();
    assert.equal(defaults['bible-stories-3d'].defaultDuration, 170);
    assert.equal(defaults['daily-faith-inspiration'].defaultDuration, 170);
    assert.equal(defaults['bible-facts-mysteries'].defaultDuration, 170);
    const devotionalBudget = computeScriptWordBudget(170);
    assert.equal(devotionalBudget.minWords, 340);
    assert.equal(devotionalBudget.maxWords, 420);

    const invalid = validateChannelTemplate({
      channelId: 'bible-stories-3d',
      scriptTemplate: 'pendek',
      visualStyle: 'pendek',
      defaultDuration: 45,
    });
    assert.equal(invalid.ok, false);

    const valid = validateChannelTemplate({
      channelId: 'daily-faith-inspiration',
      scriptTemplate: 'Hook lembut -> Refleksi iman -> Doa singkat untuk keluarga.',
      visualStyle: 'Soft golden hour watercolor vertical 9:16 cinema without text.',
      defaultDuration: 30,
      closingCta: 'Bagikan ke orang terkasih hari ini.',
    });
    assert.equal(valid.ok, true);

    const merged = mergeChannelTemplates({
      'daily-faith-inspiration': valid.ok ? valid.value : null,
      'bible-stories-3d': { scriptTemplate: 'bad', visualStyle: 'bad', defaultDuration: 999 },
    });
    assert.equal(merged['daily-faith-inspiration'].defaultDuration, 30);
    assert.equal(merged['bible-stories-3d'].defaultDuration, 170);

    const directives = formatTemplatePromptDirectives(merged['daily-faith-inspiration']);
    assert.ok(directives.includes('Hook lembut'));
    assert.ok(directives.includes('Soft golden hour watercolor'));
    assert.ok(directives.includes('Bagikan ke orang terkasih'));
  });
});
