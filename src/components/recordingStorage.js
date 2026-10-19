// Registrazioni audio: l'audio, le istantanee del testo e la forma d'onda stanno in IndexedDB
// (stesso database dello store, chiavi "rec-..."), così non appesantiscono il salvataggio principale.
//
// Formato di un record:
//   { segments: [{ blob, duration (s), peaks: number[] }], events: [{ t (ms, sull'intera durata), html }], duration (s, totale) }
// "Continua" aggiunge un segmento: i segmenti si riproducono uno dopo l'altro.
// (I record vecchi, con un solo blob al livello principale, vengono letti come un segmento unico.)
const DB_NAME = 'remind-db';
const STORE_NAME = 'kv';

const openDB = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const key = (id) => `rec-data-${id}`;

const normalizeRecord = (r) => {
  if (!r) return null;
  if (Array.isArray(r.segments)) return r;
  return {
    segments: [{ blob: r.blob, duration: r.duration, peaks: r.peaks || [] }],
    events: r.events || [],
    duration: r.duration,
  };
};

export async function saveRecording(id, record) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record, key(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadRecording(id) {
  try {
    const db = await openDB();
    const raw = await new Promise((resolve, reject) => {
      const q = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(key(id));
      q.onsuccess = () => resolve(q.result || null);
      q.onerror = () => reject(q.error);
    });
    return normalizeRecord(raw);
  } catch (e) { return null; }
}

// ---------- PACCHETTO .remind ----------
// Nel pacchetto l'audio viaggia in base64 dentro il documento a cui appartiene:
// document.recording = { id, duration, events, segments: [{ audio, mimeType, duration, peaks }] }

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

const base64ToBlob = (b64, type) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: type || 'audio/webm' });
};

// Aggiunge a ogni testo con registrazione i dati completi (audio compreso). `projects` = quaderni già pronti per l'export.
export async function embedRecordings(projects) {
  return Promise.all(projects.map(async (p) => ({
    ...p,
    documents: await Promise.all((p.documents || []).map(async (d) => {
      if (!d.recording) return d;
      const data = await loadRecording(d.recording.id);
      if (!data) { const { recording, ...rest } = d; return rest; } // audio assente su questo dispositivo: non si esporta un tasto rotto
      return {
        ...d,
        recording: {
          id: d.recording.id,
          duration: data.duration ?? d.recording.duration,
          events: data.events,
          segments: await Promise.all(data.segments.map(async (s) => ({
            audio: await blobToBase64(s.blob),
            mimeType: s.blob.type,
            duration: s.duration,
            peaks: s.peaks,
          }))),
        },
      };
    })),
  })));
}

// Legge da un pacchetto le registrazioni incorporate, le salva in IndexedDB e restituisce il pacchetto "leggero" (solo metadati).
export async function extractRecordings(raw) {
  const handleDocs = async (docs) => Promise.all((docs || []).map(async (d) => {
    const rec = d?.recording;
    if (!rec) return d;
    // Pacchetti con una sola traccia (formato precedente): audio al livello principale
    const segsIn = Array.isArray(rec.segments)
      ? rec.segments
      : (rec.audio ? [{ audio: rec.audio, mimeType: rec.mimeType, duration: rec.duration, peaks: rec.peaks }] : null);
    if (!segsIn) {
      // Solo metadati: si tiene il tasto solo se l'audio esiste già qui
      return (await loadRecording(rec.id)) ? d : { ...d, recording: null };
    }
    try {
      await saveRecording(rec.id, {
        segments: segsIn.map((s) => ({ blob: base64ToBlob(s.audio, s.mimeType), duration: s.duration, peaks: s.peaks || [] })),
        events: rec.events || [],
        duration: rec.duration,
      });
      return { ...d, recording: { id: rec.id, duration: rec.duration } };
    } catch (e) { return { ...d, recording: null }; }
  }));
  if (Array.isArray(raw.projects)) {
    return { ...raw, projects: await Promise.all(raw.projects.map(async (p) => ({ ...p, documents: await handleDocs(p.documents) }))) };
  }
  if (Array.isArray(raw.documents)) return { ...raw, documents: await handleDocs(raw.documents) };
  return raw;
}

export async function deleteRecording(id) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key(id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) { /* niente */ }
}
