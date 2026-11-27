import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMasterBibleSystemPolicy,
  classifyMasterBibleSyncResponse,
  formatDurationLabelId,
  parseMasterBibleContent,
} from './masterBible';

describe('Master Alkitab Terjemahan Baru Parser & Building-Wide Policy', () => {
  it('parses nested JSON object format ({ Kitab: { Pasal: { Ayat: Teks } } })', () => {
    const nestedJson = JSON.stringify({
      Mazmur: {
        '27': {
          '14': 'Nantikanlah TUHAN! Kuatkanlah dan teguhkanlah hatimu! Ya, nantikanlah TUHAN!',
        },
      },
      Filipi: {
        '4': {
          '6': 'Janganlah hendaknya kamu kuatir tentang apa pun juga.',
          '7': 'Damai sejahtera Allah, yang melampaui segala akal, akan memelihara hati dan pikiranmu dalam Kristus Yesus.',
        },
      },
    });

    const db = parseMasterBibleContent(nestedJson, 'alkitab_tb_custom.json');
    assert.equal(db.report.indexedVerseCount, 3);
    assert.equal(db.report.bookCount, 2);
    assert.equal(db.report.chapterCount, 2);
    assert.equal(
      db.versesMap['mazmur:27:14'],
      'Nantikanlah TUHAN! Kuatkanlah dan teguhkanlah hatimu! Ya, nantikanlah TUHAN!'
    );
  });

  it('parses wrapped books JSON format ({ books: [{ name, chapters }] })', () => {
    const wrappedJson = JSON.stringify({
      books: [
        {
          name: 'Kejadian',
          chapters: [['Pada mulanya Allah menciptakan langit dan bumi.']],
        },
      ],
    });

    const db = parseMasterBibleContent(wrappedJson, 'wrapped_tb.json');
    assert.equal(db.report.indexedVerseCount, 1);
    assert.equal(db.report.bookCount, 1);
    assert.equal(db.versesMap['kejadian:1:1'], 'Pada mulanya Allah menciptakan langit dan bumi.');
  });

  it('parses plain-text .txt Terjemahan Baru lines accurately', () => {
    const txt = [
      '# Alkitab Terjemahan Baru',
      'Kejadian 1:1 Pada mulanya Allah menciptakan langit dan bumi.',
      'Mazmur 23:1 TUHAN adalah gembalaku, takkan kekurangan aku.',
      'Filipi 4:6\tJanganlah hendaknya kamu kuatir tentang apa pun juga.',
    ].join('\n');

    const db = parseMasterBibleContent(txt, 'tb_lai.txt');
    assert.equal(db.report.indexedVerseCount, 3);
    assert.equal(db.report.bookCount, 3);
    assert.equal(db.versesMap['kejadian:1:1'], 'Pada mulanya Allah menciptakan langit dan bumi.');
    assert.equal(db.versesMap['mazmur:23:1'], 'TUHAN adalah gembalaku, takkan kekurangan aku.');
  });

  it('builds mandatory building-wide Bible-first directive and injects exact verbatim verses', () => {
    const db = parseMasterBibleContent(
      'Mazmur 27:14 Nantikanlah TUHAN! Kuatkanlah dan teguhkanlah hatimu! Ya, nantikanlah TUHAN!',
      'tb.txt'
    );

    const result = buildMasterBibleSystemPolicy(
      db,
      'Buat renungan harian 2 menit 50 detik berdasarkan Mazmur 27:14 tentang pengharapan.'
    );

    assert.equal(result.masterActive, true);
    assert.deepEqual(result.extractedReferences, ['Mazmur 27:14']);
    assert.equal(result.matchedVerses.length, 1);
    assert.ok(result.policyBlock.includes('SELURUH LANTAI 1, 2 & 3'));
    assert.ok(result.policyBlock.includes('Nantikanlah TUHAN! Kuatkanlah dan teguhkanlah hatimu!'));
  });

  it('formats devotional 2m 50s (170s) and Shorts durations cleanly in Indonesian', () => {
    assert.equal(formatDurationLabelId(170), '2m 50d (170 detik)');
    assert.equal(formatDurationLabelId(45), '45 detik');
    assert.equal(formatDurationLabelId(60), '1 menit (60d)');
  });

  it('classifies backend sync responses cleanly across full-stack, Netlify static host, 413, and offline states', () => {
    const synced = classifyMasterBibleSyncResponse({
      ok: true,
      status: 200,
      contentType: 'application/json; charset=utf-8',
      jsonBody: { ok: true, loaded: true },
    });
    assert.equal(synced.mode, 'server-synced');
    assert.equal(synced.notice, null);

    // Netlify static SPA fallback returns 200 text/html instead of JSON
    const netlifyHtmlFallback = classifyMasterBibleSyncResponse({
      ok: true,
      status: 200,
      contentType: 'text/html; charset=utf-8',
      jsonBody: null,
    });
    assert.equal(netlifyHtmlFallback.mode, 'local-only');
    assert.ok(netlifyHtmlFallback.notice?.includes('Mode Lokal/Netlify'));

    // Netlify static 404/405 for POST /api/bible/master
    const netlify404 = classifyMasterBibleSyncResponse({
      ok: false,
      status: 404,
      contentType: 'text/html',
      jsonBody: null,
    });
    assert.equal(netlify404.mode, 'local-only');
    assert.ok(netlify404.notice?.includes('Mode Lokal/Netlify'));

    // Payload too large on server still keeps browser IndexedDB active
    const tooLarge = classifyMasterBibleSyncResponse({
      ok: false,
      status: 413,
      contentType: 'application/json',
      jsonBody: { error: 'Payload too large' },
    });
    assert.equal(tooLarge.mode, 'local-only');
    assert.ok(tooLarge.notice?.includes('batas pengiriman server'));

    // Offline / network failure
    const offline = classifyMasterBibleSyncResponse({
      ok: false,
      status: 0,
      contentType: null,
      networkError: true,
    });
    assert.equal(offline.mode, 'local-only');
    assert.ok(offline.notice?.includes('Mode Lokal/Netlify'));
  });
});
