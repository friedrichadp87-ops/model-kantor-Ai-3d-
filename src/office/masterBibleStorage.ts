import type { LocalBibleDatabase } from './shortsFactory';

const DB_NAME = 'kantor-ai-3d-master-bible';
const STORE_NAME = 'bible_store';
const RECORD_KEY = 'terjemahan_baru_master_v1';

function openMasterBibleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB tidak tersedia pada browser ini.'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Gagal membuka IndexedDB Alkitab.'));
  });
}

export async function saveMasterBibleToIndexedDb(database: LocalBibleDatabase): Promise<void> {
  const db = await openMasterBibleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(database, RECORD_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('Gagal menyimpan Master Alkitab ke penyimpanan lokal.'));
    };
  });
}

export async function loadMasterBibleFromIndexedDb(): Promise<LocalBibleDatabase | null> {
  try {
    const db = await openMasterBibleDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(RECORD_KEY);
      req.onsuccess = () => {
        db.close();
        const result = req.result as LocalBibleDatabase | undefined;
        if (result && result.versesMap && result.report?.indexedVerseCount > 0) {
          resolve(result);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => {
        db.close();
        reject(req.error ?? new Error('Gagal membaca Master Alkitab lokal.'));
      };
    });
  } catch {
    return null;
  }
}

export async function clearMasterBibleFromIndexedDb(): Promise<void> {
  try {
    const db = await openMasterBibleDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(RECORD_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error('Gagal menghapus Master Alkitab lokal.'));
      };
    });
  } catch {
    // Ignore cleanup errors cleanly
  }
}
