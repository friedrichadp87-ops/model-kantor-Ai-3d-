import {
  extractIndonesianBibleReferences,
  lookupLocalBibleReference,
  parseLocalBibleJson,
  resolveIndonesianBook,
  type LocalBibleDatabase,
} from './shortsFactory';

export interface MasterBiblePolicyResult {
  policyBlock: string;
  extractedReferences: string[];
  matchedVerses: Array<{ ref: string; text: string }>;
  masterActive: boolean;
}

export type MasterBibleSyncMode = 'firebase-synced' | 'server-synced' | 'local-only';

export interface MasterBibleSyncOutcome {
  mode: MasterBibleSyncMode;
  notice: string | null;
}

export interface MasterBibleSyncResponseInput {
  ok: boolean;
  status: number;
  contentType: string | null;
  jsonBody?: { ok?: boolean; loaded?: boolean; error?: string } | null;
  networkError?: boolean;
}

/**
 * Classifies the response from POST /api/bible/master so static hosts (such as Netlify
 * returning 404/405 or 200 text/html SPA fallback) or offline sessions gracefully keep
 * the parsed Master Alkitab active in browser IndexedDB without showing a blocking error.
 */
export function classifyMasterBibleSyncResponse(
  input: MasterBibleSyncResponseInput
): MasterBibleSyncOutcome {
  const ct = (input.contentType ?? '').toLowerCase();
  const isJson = ct.includes('application/json');

  if (!input.networkError && input.ok && isJson && input.jsonBody?.ok === true) {
    return {
      mode: 'server-synced',
      notice: null,
    };
  }

  if (input.status === 413) {
    return {
      mode: 'local-only',
      notice:
        'Alkitab aktif & tersimpan di browser (IndexedDB). Ukuran file melebihi batas pengiriman server saat ini.',
    };
  }

  if (
    input.networkError ||
    !isJson ||
    input.status === 404 ||
    input.status === 405 ||
    input.status === 502 ||
    input.status === 503 ||
    input.status === 504
  ) {
    return {
      mode: 'local-only',
      notice:
        'Alkitab aktif & tersimpan di browser untuk L1–L3 (Mode Lokal/Netlify). Sinkronisasi server aktif otomatis saat terhubung ke backend.',
    };
  }

  const detail =
    typeof input.jsonBody?.error === 'string' && input.jsonBody.error.trim()
      ? input.jsonBody.error.trim()
      : `HTTP ${input.status}`;

  return {
    mode: 'local-only',
    notice: `Alkitab tetap aktif di browser (IndexedDB). Sinkronisasi server tertunda (${detail}).`,
  };
}

export async function syncMasterBibleToBackend(
  database: LocalBibleDatabase
): Promise<MasterBibleSyncOutcome> {
  try {
    const res = await fetch('/api/bible/master', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ database }),
    });
    const contentType = res.headers.get('content-type');
    let jsonBody: { ok?: boolean; loaded?: boolean; error?: string } | null = null;
    if (contentType && contentType.toLowerCase().includes('application/json')) {
      jsonBody = (await res.json().catch(() => null)) as {
        ok?: boolean;
        loaded?: boolean;
        error?: string;
      } | null;
    }
    return classifyMasterBibleSyncResponse({
      ok: res.ok,
      status: res.status,
      contentType,
      jsonBody,
    });
  } catch {
    return classifyMasterBibleSyncResponse({
      ok: false,
      status: 0,
      contentType: null,
      networkError: true,
    });
  }
}

export function formatDurationLabelId(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  if (safe < 60) {
    return `${safe} detik`;
  }
  const mins = Math.floor(safe / 60);
  const rem = safe % 60;
  if (rem === 0) {
    return `${mins} menit (${safe}d)`;
  }
  return `${mins}m ${rem}d (${safe} detik)`;
}

/**
 * Parses an Indonesian Terjemahan Baru (TB) Bible upload in multiple common formats:
 * 1. Standard indo_tb.json ({ metadata, verses: [{ book_name, chapter, verse, text }] })
 * 2. Flat JSON array ([{ kitab/book_name, pasal/chapter, ayat/verse, teks/text }])
 * 3. Nested JSON object ({ "Kejadian": { "1": { "1": "Pada mulanya..." } } })
 * 4. Nested JSON book array ([{ name/kitab, chapters: [["Pada mulanya...", ...]] }])
 * 5. Plain-text .txt lines ("Kejadian 1:1 Pada mulanya..." or "Kej 1:1\tPada mulanya...")
 */
export function parseMasterBibleContent(rawText: string, fileName = ''): LocalBibleDatabase {
  const trimmed = rawText.replace(/^\uFEFF/, '').trim();
  if (!trimmed) {
    throw new Error('File Alkitab kosong. Unggah file Terjemahan Baru (.json atau .txt).');
  }

  const looksJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  if (looksJson) {
    try {
      return parseLocalBibleJson(trimmed);
    } catch {
      // Fall through to nested JSON parser variants below
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error('Format JSON Alkitab tidak valid. Pastikan file .json tidak terpotong.');
    }

    const versesMap: Record<string, string> = {};
    const booksFound = new Set<string>();
    const chaptersFound = new Set<string>();

    const addVerse = (
      bookNameRaw: unknown,
      chapterRaw: unknown,
      verseRaw: unknown,
      textRaw: unknown
    ) => {
      const book = resolveIndonesianBook(String(bookNameRaw ?? ''));
      const chapter = Number(chapterRaw);
      const verse = Number(verseRaw);
      const text = String(textRaw ?? '').trim();
      if (
        !book ||
        !Number.isFinite(chapter) ||
        !Number.isFinite(verse) ||
        chapter < 1 ||
        verse < 1 ||
        !text
      ) {
        return;
      }
      versesMap[`${book.id}:${chapter}:${verse}`] = text;
      booksFound.add(book.id);
      chaptersFound.add(`${book.id}:${chapter}`);
    };

    const parseBookArray = (items: unknown[]) => {
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const obj = item as Record<string, unknown>;
        const bookName = obj.name ?? obj.book_name ?? obj.book ?? obj.kitab ?? obj.abbrev;
        if (Array.isArray(obj.chapters)) {
          obj.chapters.forEach((chapterItem, chIdx) => {
            if (Array.isArray(chapterItem)) {
              chapterItem.forEach((verseText, vIdx) => {
                if (typeof verseText === 'string') {
                  addVerse(bookName, chIdx + 1, vIdx + 1, verseText);
                } else if (verseText && typeof verseText === 'object') {
                  const vo = verseText as Record<string, unknown>;
                  addVerse(
                    bookName,
                    vo.chapter ?? chIdx + 1,
                    vo.verse ?? vo.ayat ?? vIdx + 1,
                    vo.text ?? vo.teks
                  );
                }
              });
            } else if (chapterItem && typeof chapterItem === 'object') {
              const chObj = chapterItem as Record<string, unknown>;
              const chNum = Number(chObj.chapter ?? chObj.pasal ?? chIdx + 1);
              if (Array.isArray(chObj.verses)) {
                chObj.verses.forEach((vItem, vIdx) => {
                  if (typeof vItem === 'string') {
                    addVerse(bookName, chNum, vIdx + 1, vItem);
                  } else if (vItem && typeof vItem === 'object') {
                    const vo = vItem as Record<string, unknown>;
                    addVerse(
                      bookName,
                      chNum,
                      vo.verse ?? vo.ayat ?? vIdx + 1,
                      vo.text ?? vo.teks
                    );
                  }
                });
              }
            }
          });
        }
      }
    };

    if (Array.isArray(parsed)) {
      // Variant 4: [{ name/book/kitab, chapters: [[verse1, verse2, ...]] }]
      parseBookArray(parsed);
    } else if (parsed && typeof parsed === 'object') {
      // Variant 3: { "Kejadian": { "1": { "1": "Pada mulanya..." } } } or { "Kejadian": [["..."]] }
      // Also supports wrapper objects like { books: [...] } / { data: [...] } / { bible: [...] }
      const root = parsed as Record<string, unknown>;
      const wrappedArray = Array.isArray(root.books)
        ? root.books
        : Array.isArray(root.data)
        ? root.data
        : Array.isArray(root.bible)
        ? root.bible
        : null;
      if (wrappedArray) {
        parseBookArray(wrappedArray);
      }

      for (const [bookKey, bookVal] of Object.entries(root)) {
        if (bookKey === 'metadata' || bookKey === 'books' || bookKey === 'data' || bookKey === 'bible') {
          continue;
        }
        const book = resolveIndonesianBook(bookKey);
        if (!book || !bookVal || typeof bookVal !== 'object') continue;

        if (Array.isArray(bookVal)) {
          bookVal.forEach((chArr, chIdx) => {
            if (Array.isArray(chArr)) {
              chArr.forEach((vText, vIdx) => addVerse(book.name, chIdx + 1, vIdx + 1, vText));
            }
          });
        } else {
          for (const [chKey, chVal] of Object.entries(bookVal as Record<string, unknown>)) {
            const chNum = Number(chKey);
            if (!Number.isFinite(chNum) || !chVal || typeof chVal !== 'object') continue;
            if (Array.isArray(chVal)) {
              chVal.forEach((vText, vIdx) => addVerse(book.name, chNum, vIdx + 1, vText));
            } else {
              for (const [vKey, vText] of Object.entries(chVal as Record<string, unknown>)) {
                addVerse(book.name, chNum, Number(vKey), vText);
              }
            }
          }
        }
      }
    }

    const indexedVerseCount = Object.keys(versesMap).length;
    if (indexedVerseCount === 0) {
      throw new Error(
        'Tidak ditemukan ayat Alkitab pada file JSON. Gunakan format indo_tb.json, array { kitab, pasal, ayat, teks }, atau struktur kitab -> pasal -> ayat.'
      );
    }

    return {
      versesMap,
      report: {
        indexedVerseCount,
        bookCount: booksFound.size,
        chapterCount: chaptersFound.size,
        missingBookCount: Math.max(0, 66 - booksFound.size),
        sourceName: fileName
          ? `Alkitab Terjemahan Baru (${fileName})`
          : 'Alkitab Terjemahan Baru (Master Upload)',
        publisher: 'Lembaga Alkitab Indonesia (LAI) — Unggahan Pemilik Studio',
        year: 'TB',
        copyrightStatement:
          'Sumber utama internal Kantor AI 3D (Lantai 1, 2 & 3) untuk verifikasi teks Alkitab lokal.',
      },
    };
  }

  // Variant 5: Plain text (.txt) lines such as "Kejadian 1:1 Pada mulanya..."
  const versesMap: Record<string, string> = {};
  const booksFound = new Set<string>();
  const chaptersFound = new Set<string>();
  const lines = trimmed.split(/\r?\n/);

  const lineRegex = /^([1-3]?\s*[A-Za-zÀ-ÿ-]+(?:\s+[A-Za-zÀ-ÿ-]+){0,2})\s+(\d{1,3}):(\d{1,3})[\s\t\-:|]+(.+)$/;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    const match = lineRegex.exec(line);
    if (!match) continue;
    const book = resolveIndonesianBook(match[1]);
    if (!book) continue;
    const chapter = Number(match[2]);
    const verse = Number(match[3]);
    const text = match[4].trim();
    if (!Number.isFinite(chapter) || !Number.isFinite(verse) || chapter < 1 || verse < 1 || !text) {
      continue;
    }
    versesMap[`${book.id}:${chapter}:${verse}`] = text;
    booksFound.add(book.id);
    chaptersFound.add(`${book.id}:${chapter}`);
  }

  const indexedVerseCount = Object.keys(versesMap).length;
  if (indexedVerseCount === 0) {
    throw new Error(
      'Tidak ditemukan baris ayat pada file teks. Gunakan format seperti "Kejadian 1:1 Pada mulanya Allah menciptakan langit dan bumi." atau unggah file .json.'
    );
  }

  return {
    versesMap,
    report: {
      indexedVerseCount,
      bookCount: booksFound.size,
      chapterCount: chaptersFound.size,
      missingBookCount: Math.max(0, 66 - booksFound.size),
      sourceName: fileName
        ? `Alkitab Terjemahan Baru (${fileName})`
        : 'Alkitab Terjemahan Baru (Teks Lokal)',
      publisher: 'Lembaga Alkitab Indonesia (LAI) — Unggahan Pemilik Studio',
      year: 'TB',
      copyrightStatement:
        'Sumber utama internal Kantor AI 3D (Lantai 1, 2 & 3) untuk verifikasi teks Alkitab lokal.',
    },
  };
}

/**
 * Builds the mandatory building-wide Bible-First directive injected into EVERY AI agent
 * across Lantai 1, Lantai 2, and Lantai 3, including exact verbatim verses from the
 * uploaded Terjemahan Baru Master Bible whenever references appear in contextText.
 */
export function buildMasterBibleSystemPolicy(
  db: LocalBibleDatabase | null,
  contextText: string
): MasterBiblePolicyResult {
  const extractedReferences = extractIndonesianBibleReferences(contextText);
  const matchedVerses: Array<{ ref: string; text: string }> = [];

  if (db && extractedReferences.length > 0) {
    for (const ref of extractedReferences.slice(0, 6)) {
      const lookup = lookupLocalBibleReference(db.versesMap, ref);
      for (const verse of lookup.verses) {
        if (!matchedVerses.some((m) => m.ref === verse.ref)) {
          matchedVerses.push(verse);
        }
      }
    }
  }

  const baseRule = [
    'ATURAN MUTLAK SUMBER UTAMA ALKITAB (BERLAKU DI SELURUH LANTAI 1, 2 & 3 KANTOR AI 3D):',
    '1. Alkitab Terjemahan Baru (TB) adalah SATU-SATUNYA sumber utama dan otoritas tertinggi untuk setiap tindakan, naskah, riset, narasi, dan keputusan konten seluruh agen AI.',
    '2. DILARANG KERAS mengarang ayat, mengubah makna firman, mengambil ajaran di luar Alkitab, atau bertindak tanpa dasar teks Alkitab yang sah.',
    '3. Setiap kutipan ayat wajib setia pada Terjemahan Baru (TB) dan selalu cantumkan referensi kitab, pasal, serta ayat yang jelas.',
  ];

  if (db) {
    baseRule.push(
      `4. Master Alkitab Terjemahan Baru AKTIF di server: "${db.report.sourceName}" (${db.report.bookCount} kitab · ${db.report.indexedVerseCount.toLocaleString('id-ID')} ayat terindeks).`
    );
  }

  if (matchedVerses.length > 0) {
    baseRule.push(
      '',
      'KUTIPAN VERBATIM DARI MASTER ALKITAB TERJEMAHAN BARU (WAJIB DIGUNAKAN APA ADANYA):',
      ...matchedVerses.slice(0, 12).map((v) => `- ${v.ref}: "${v.text}"`)
    );
  }

  return {
    policyBlock: baseRule.join('\n'),
    extractedReferences,
    matchedVerses,
    masterActive: Boolean(db && db.report.indexedVerseCount > 0),
  };
}
