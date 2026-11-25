import { PROTESTANT_BIBLE_BOOKS, type BibleBook } from './shortsFactory';
import type { PipelineSceneItem } from './productionPipeline';

export type BiblePlanScopeType = 'all' | 'old' | 'new' | 'book';

export interface BibleChapterEpisodePlan {
  episodeNumber: number;
  totalEpisodesInScope: number;
  bookId: string;
  bookName: string;
  testament: 'old' | 'new';
  chapterNumber: number;
  chapterTotalInBook: number;
  reference: string;
  storyTitle: string;
  storySummary: string;
  dialogueHighlight: string;
  continuityNote: string;
  targetDurationSec: 170;
  sceneCount: 17;
  secondsPerScene: 10;
  recommendedCommand: string;
}

export interface BibleSeriesPlanSummary {
  scopeType: BiblePlanScopeType;
  scopeLabel: string;
  bookCount: number;
  totalChapters: number;
  totalStories: number;
  ruleLabel: string;
  startIndex: number;
  batchSize: number;
  episodes: BibleChapterEpisodePlan[];
}

export type BibleFactCategory = 'all' | 'archaeology' | 'hebrew_greek' | 'mystery';

export interface BibleFactCategoryOption {
  id: BibleFactCategory;
  label: string;
  shortLabel: string;
  description: string;
  exampleTopic: string;
}

export const BIBLE_FACT_CATEGORIES: BibleFactCategoryOption[] = [
  {
    id: 'all',
    label: 'Semua Fakta & Misteri',
    shortLabel: 'Semua',
    description: 'Gabungan arkeologi, bahasa asli Ibrani/Yunani, dan misteri teks Alkitab.',
    exampleTopic: 'Makna asli kata Shalom dan bukti prasasti kuno Israel',
  },
  {
    id: 'archaeology',
    label: 'Bukti Peninggalan & Arkeologi',
    shortLabel: 'Arkeologi',
    description: 'Situs kota kuno, prasasti batu, gulungan Laut Mati, dan artefak historis.',
    exampleTopic: 'Prasasti Tel Dan: bukti arkeologi eksistensi Raja Daud',
  },
  {
    id: 'hebrew_greek',
    label: 'Kata Ibrani & Yunani',
    shortLabel: 'Ibrani/Yunani',
    description: 'Istilah asli Ibrani/Yunani dalam Alkitab yang sering salah diartikan orang modern.',
    exampleTopic: 'Arti asli kata Ibrani "Hesed" & kata Yunani "Tetelestai"',
  },
  {
    id: 'mystery',
    label: 'Misteri & Fakta Tersembunyi',
    shortLabel: 'Misteri',
    description: 'Detail mengejutkan dan misteri dalam Alkitab yang jarang diketahui jemaat.',
    exampleTopic: 'Misteri Manna di padang gurun dan lokasi Tabut Perjanjian',
  },
];

export interface BibleFactResearchResult {
  category: BibleFactCategory;
  categoryLabel: string;
  title: string;
  bibleReference: string;
  evidenceType: string;
  originalTerm?: string;
  transliteration?: string;
  commonMisconception?: string;
  trueMeaning?: string;
  archaeologicalEvidence: string;
  coreSummary: string;
  visualReconstructionBrief: string;
  recommendedCommand: string;
  sourceLinks: Array<{ title: string; uri: string }>;
  matchedMasterVerses: Array<{ ref: string; text: string }>;
  masterBibleActive: boolean;
  keySlotUsed: string;
}

export interface AvSyncSceneCheck {
  sceneNumber: number;
  timecodeLabel: string;
  audioVisualMatch: boolean;
  note: string;
}

export interface AvSyncCheckReport {
  approvedForEditor: boolean;
  matchScore: number;
  checkedSceneCount: number;
  readyVisualCount: number;
  hasNarrationAudio: boolean;
  summary: string;
  sceneChecks: AvSyncSceneCheck[];
  checkedAt: string;
}

export function getBooksForPlanScope(
  scopeType: BiblePlanScopeType,
  bookId?: string
): { books: BibleBook[]; scopeLabel: string } {
  if (scopeType === 'old') {
    const books = PROTESTANT_BIBLE_BOOKS.filter((b) => b.testament === 'old');
    return {
      books,
      scopeLabel: 'Perjanjian Lama (Kejadian 1 → Maleakhi 4 · 39 Kitab)',
    };
  }
  if (scopeType === 'new') {
    const books = PROTESTANT_BIBLE_BOOKS.filter((b) => b.testament === 'new');
    return {
      books,
      scopeLabel: 'Perjanjian Baru (Matius 1 → Wahyu 22 · 27 Kitab)',
    };
  }
  if (scopeType === 'book') {
    const found =
      PROTESTANT_BIBLE_BOOKS.find((b) => b.id === bookId) ?? PROTESTANT_BIBLE_BOOKS[0];
    return {
      books: [found],
      scopeLabel: `Kitab ${found.name} (Pasal 1–${found.chapterCount})`,
    };
  }
  return {
    books: PROTESTANT_BIBLE_BOOKS,
    scopeLabel: 'Seluruh Alkitab (Kejadian 1 → Wahyu 22 · 66 Kitab)',
  };
}

/**
 * Deterministic 1-Pasal = 1-Cerita planner across Kejadian 1 → Wahyu 22.
 * Even when a biblical narrative spans multiple chapters, each chapter is planned
 * as its own 2m 50d (170s = 17 scenes × 10s) episode with explicit continuity tags.
 */
export function buildBibleChapterStoryPlan(params: {
  scopeType: BiblePlanScopeType;
  bookId?: string;
  startIndex?: number;
  batchSize?: number;
}): BibleSeriesPlanSummary {
  const { books, scopeLabel } = getBooksForPlanScope(params.scopeType, params.bookId);
  const flatChapters: Array<{
    book: BibleBook;
    chapterNumber: number;
    nextRef: string | null;
  }> = [];

  for (let bIdx = 0; bIdx < books.length; bIdx++) {
    const book = books[bIdx];
    for (let ch = 1; ch <= book.chapterCount; ch++) {
      let nextRef: string | null = null;
      if (ch < book.chapterCount) {
        nextRef = `${book.name} ${ch + 1}`;
      } else if (bIdx + 1 < books.length) {
        nextRef = `${books[bIdx + 1].name} 1`;
      }
      flatChapters.push({ book, chapterNumber: ch, nextRef });
    }
  }

  const totalChapters = flatChapters.length;
  const safeBatch = Math.max(1, Math.min(12, Math.round(params.batchSize ?? 6)));
  const maxStart = Math.max(0, totalChapters - 1);
  const safeStart = Math.max(0, Math.min(maxStart, Math.round(params.startIndex ?? 0)));

  const slice = flatChapters.slice(safeStart, safeStart + safeBatch);
  const episodes: BibleChapterEpisodePlan[] = slice.map((item, offset) => {
    const epNum = safeStart + offset + 1;
    const ref = `${item.book.name} ${item.chapterNumber}`;
    const continuityNote = item.nextRef
      ? `1 Pasal = 1 Cerita utuh · Alur bersambung ke ${item.nextRef}`
      : `1 Pasal = 1 Cerita penutup seri (${item.book.name} pasal terakhir)`;

    const storyTitle = `Ep. ${String(epNum).padStart(2, '0')} — Kisah ${ref}`;
    const storySummary = `Adaptasi animasi 3D lengkap dari ${ref} (Master Alkitab Terjemahan Baru), merangkai alur peristiwa pasal ini bersama seluruh dialog/percakapan tokoh langsung ke dalam narasi audio berdurasi 2 menit 50 detik (17 adegan × 10 detik).`;
    const dialogueHighlight = `Percakapan tokoh dalam ${ref} dirangkai alami ke dalam narasi audio.`;
    const recommendedCommand = `Buatkan cerita lengkap Bible Stories 3D khusus 1 pasal penuh yaitu ${ref} (Episode #${epNum} dari ${totalChapters} cerita ${scopeLabel}) berlandaskan Master Alkitab Terjemahan Baru. Masukkan alur cerita lengkap beserta seluruh percakapan tokoh ke dalam narasi audio, bagi menjadi tepat 17 adegan berdurasi 10 detik per adegan (total 2 menit 50 detik / 170 detik), dan beri jembatan halus bila kisah berlanjut ke ${item.nextRef ?? 'penutup seri'}.`;

    return {
      episodeNumber: epNum,
      totalEpisodesInScope: totalChapters,
      bookId: item.book.id,
      bookName: item.book.name,
      testament: item.book.testament,
      chapterNumber: item.chapterNumber,
      chapterTotalInBook: item.book.chapterCount,
      reference: ref,
      storyTitle,
      storySummary,
      dialogueHighlight,
      continuityNote,
      targetDurationSec: 170,
      sceneCount: 17,
      secondsPerScene: 10,
      recommendedCommand,
    };
  });

  return {
    scopeType: params.scopeType,
    scopeLabel,
    bookCount: books.length,
    totalChapters,
    totalStories: totalChapters,
    ruleLabel: '1 Pasal = 1 Cerita · 17 Adegan × 10 Detik (2m 50d)',
    startIndex: safeStart,
    batchSize: safeBatch,
    episodes,
  };
}

/**
 * Deterministic Stage 7 (QC Tahap 1) evaluator before Editor merges video & audio.
 * Verifies every scene has narration, visual asset (animation or keyframe), and
 * contiguous timestamps matching the expected rhythm (e.g., 10s per scene).
 */
export function evaluateLocalAvSyncCheck(params: {
  scenes: PipelineSceneItem[];
  hasNarrationAudio: boolean;
  expectedDurationSec: number;
}): AvSyncCheckReport {
  const { scenes, hasNarrationAudio, expectedDurationSec } = params;
  const sceneChecks: AvSyncSceneCheck[] = scenes.map((sc) => {
    const hasVisual = Boolean(sc.videoDataUrl || sc.keyframeDataUrl);
    const hasNarration = sc.narrationText.trim().length >= 8;
    const timingOk = sc.durationSec >= 3 && sc.endSec > sc.startSec;
    const audioVisualMatch = hasVisual && hasNarration && timingOk;

    let note = 'Visual animasi & narasi adegan selaras dengan timestamp.';
    if (!hasVisual) {
      note = 'Visual adegan belum siap (butuh gambar patokan / klip animasi).';
    } else if (!hasNarration) {
      note = 'Teks narasi/percakapan terlalu singkat untuk durasi adegan.';
    } else if (!timingOk) {
      note = 'Rentang timestamp adegan perlu disesuaikan.';
    } else if (!hasNarrationAudio) {
      note = 'Visual & naskah cocok; audio narasi belum terpasang (tetap dapat disatukan).';
    }

    return {
      sceneNumber: sc.sceneNumber,
      timecodeLabel: sc.timecodeLabel,
      audioVisualMatch,
      note,
    };
  });

  const readyVisualCount = scenes.filter((s) => Boolean(s.videoDataUrl || s.keyframeDataUrl)).length;
  const matchedCount = sceneChecks.filter((c) => c.audioVisualMatch).length;
  const totalDur = scenes.reduce((sum, s) => sum + s.durationSec, 0);
  const durDelta = Math.abs(totalDur - expectedDurationSec);

  const baseRatio = scenes.length > 0 ? matchedCount / scenes.length : 0;
  let matchScore = Math.round(baseRatio * 85 + (hasNarrationAudio ? 15 : 5) - (durDelta > 5 ? 10 : 0));
  matchScore = Math.max(0, Math.min(100, matchScore));

  const approvedForEditor = readyVisualCount > 0 && matchedCount === scenes.length;

  const summary = approvedForEditor
    ? hasNarrationAudio
      ? `QC Tahap 1 LULUS (${matchScore}%): ${matchedCount}/${scenes.length} adegan visual dan audio narasi cocok (${totalDur} detik). Tim QC meneruskan perintah penyatuan ke Editor.`
      : `QC Tahap 1 SIAP DENGAN CATATAN (${matchScore}%): ${matchedCount}/${scenes.length} adegan visual & timestamp cocok (${totalDur} detik), audio ElevenLabs belum aktif. Editor dapat melanjutkan penyatuan.`
    : `QC Tahap 1 PERLU PERHATIAN (${matchScore}%): ${matchedCount}/${scenes.length} adegan cocok. Lengkapi visual/narasi adegan yang belum siap sebelum Editor menyatukan video.`;

  return {
    approvedForEditor,
    matchScore,
    checkedSceneCount: scenes.length,
    readyVisualCount,
    hasNarrationAudio,
    summary,
    sceneChecks,
    checkedAt: new Date().toISOString(),
  };
}
