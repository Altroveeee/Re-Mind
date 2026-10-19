import React, { useEffect, useRef, useState } from 'react';
import { Mic, Play, Pause, Square, Trash2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { saveRecording, loadRecording, deleteRecording } from './recordingStorage';
import { docChars, htmlToDoc, unwrittenRanges } from './replayDiff';

// Canale tra l'editor e il registratore:
// - onContent: l'editor lo chiama a ogni modifica del testo (serve a registrare le istantanee)
// - grey: durante il replay, gli intervalli del testo non ancora scritti (l'editor li disegna in grigio)
export const recordingBus = { onContent: null, grey: null };

const SPEEDS = [1, 1.5, 2, 0.5];
const WAVE_BARS = 48; // barre della forma d'onda verticale
const SNAPSHOT_MIN_GAP_MS = 400;
// Stessa misura dei pulsanti dei controlli della mappa (zoom): 26px + bordo da 2px
const BTN = 'w-[30px] h-[30px] flex items-center justify-center shrink-0 border-2 border-gray-900 bg-white text-gray-900 transition-colors';
const DIVIDER = <div className="w-full h-px bg-gray-400 shrink-0" />;

const fmt = (s) => {
  const t = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

// Picchi di un audio: circa 4 valori al secondo (tra 0 e 1)
async function computePeaks(blob, duration) {
  const n = Math.max(32, Math.min(2000, Math.round((duration || 1) * 4)));
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const buf = await blob.arrayBuffer();
    const audio = await new Promise((res, rej) => ctx.decodeAudioData(buf, res, rej));
    const data = audio.getChannelData(0);
    const block = Math.max(1, Math.floor(data.length / n));
    const peaks = [];
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < block; j++) sum += Math.abs(data[i * block + j] || 0);
      peaks.push(sum / block);
    }
    ctx.close();
    const max = Math.max(...peaks) || 1;
    return peaks.map((p) => Math.max(0.1, p / max));
  } catch (e) { return Array(n).fill(0.15); }
}

// Barre da mostrare (WAVE_BARS) per l'intera durata, mettendo in fila i picchi dei segmenti
function buildBars(segments) {
  const total = segments.reduce((a, s) => a + (s.duration || 0), 0);
  if (!total) return Array(WAVE_BARS).fill(0.15);
  const starts = [];
  segments.reduce((a, s) => { starts.push(a); return a + (s.duration || 0); }, 0);
  return Array.from({ length: WAVE_BARS }, (_, i) => {
    const t0 = (i / WAVE_BARS) * total;
    const t1 = ((i + 1) / WAVE_BARS) * total;
    let si = starts.length - 1;
    while (si > 0 && starts[si] > t0) si--;
    const seg = segments[si];
    const peaks = seg.peaks || [];
    if (!peaks.length || !seg.duration) return 0.15;
    const a = Math.max(0, Math.floor(((t0 - starts[si]) / seg.duration) * peaks.length));
    const b = Math.min(peaks.length, Math.max(a + 1, Math.ceil(((Math.min(t1, starts[si] + seg.duration) - starts[si]) / seg.duration) * peaks.length)));
    let m = 0;
    for (let k = a; k < b; k++) m = Math.max(m, peaks[k]);
    return m || 0.15;
  });
}

export default function RecordingControl({ editor, docId }) {
  const recording = useStore((s) => s.documents.find((d) => d.id === docId)?.recording) || null;
  const [phase, setPhase] = useState('idle'); // 'idle' | 'recording' | 'playing'
  const [elapsed, setElapsed] = useState(0);
  const [current, setCurrent] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [bars, setBars] = useState(null);

  const phaseRef = useRef('idle');
  const recRef = useRef(null);
  // audios: un elemento audio per segmento; seg: segmento corrente; offsets: inizio di ogni segmento (s)
  const playRef = useRef({ audios: [], urls: [], offsets: [], seg: 0, data: null, raf: 0, lastIdx: -1, final: null, greyCache: new Map() });
  const speedRef = useRef(0);
  phaseRef.current = phase;
  speedRef.current = speedIdx;

  // ---------- REGISTRAZIONE (nuova o per continuare quella esistente) ----------
  const finalize = async (r) => {
    clearInterval(r.timer);
    recordingBus.onContent = null;
    r.stream.getTracks().forEach((t) => t.stop());
    const duration = (performance.now() - r.t0) / 1000;
    const blob = new Blob(r.chunks, { type: r.mr.mimeType || 'audio/webm' });
    recRef.current = null;
    setPhase('idle');
    if (!blob.size) return;
    const peaks = await computePeaks(blob, duration);
    const segments = [...r.base.segments, { blob, duration, peaks }];
    const total = r.base.duration + duration;
    const id = r.base.id || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    try {
      await saveRecording(id, { segments, events: r.events, duration: total });
    } catch (e) { alert('Non è stato possibile salvare la registrazione.'); return; }
    useStore.getState().setDocumentRecording(docId, { id, duration: total });
    releaseAudio();
    setBars(buildBars(segments));
    setCurrent(0);
  };

  const startRecording = async () => {
    if (phase !== 'idle') return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      alert('Questo browser non supporta la registrazione audio.');
      return;
    }
    // Se c'è già una registrazione, questa ne è la continuazione
    let base = { id: null, segments: [], events: [], duration: 0 };
    if (recording) {
      const existing = await loadRecording(recording.id);
      if (!existing) { alert("L'audio di questa registrazione non è stato trovato su questo dispositivo."); return; }
      base = { id: recording.id, segments: existing.segments, events: existing.events, duration: existing.duration ?? recording.duration };
    }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { alert('Microfono non disponibile: controlla i permessi del browser.'); return; }

    const mr = new MediaRecorder(stream);
    const baseMs = base.duration * 1000;
    const r = { mr, stream, chunks: [], events: [...base.events], base, t0: 0, timer: 0 };
    const firstIdx = r.events.length; // le istantanee di questa sessione iniziano qui
    mr.ondataavailable = (e) => { if (e.data && e.data.size) r.chunks.push(e.data); };
    mr.onstart = () => {
      r.t0 = performance.now();
      r.events.push({ t: Math.round(baseMs), html: editor.getHTML() });
      // Ogni modifica del testo diventa un'istantanea con il suo istante (ravvicinate: si tiene l'ultima)
      recordingBus.onContent = (html) => {
        const t = Math.round(baseMs + performance.now() - r.t0);
        const last = r.events[r.events.length - 1];
        if (last && last.html === html) return;
        if (r.events.length > firstIdx + 1 && t - last.t < SNAPSHOT_MIN_GAP_MS) r.events[r.events.length - 1] = { t, html };
        else r.events.push({ t, html });
      };
      r.timer = setInterval(() => setElapsed(base.duration + (performance.now() - r.t0) / 1000), 200);
    };
    mr.onstop = () => finalize(r);
    recRef.current = r;
    setElapsed(base.duration);
    setPhase('recording');
    mr.start();
  };

  const stopRecording = () => { try { recRef.current?.mr.stop(); } catch (e) { /* già fermo */ } };

  // ---------- RIPRODUZIONE ----------
  const releaseAudio = () => {
    const p = playRef.current;
    cancelAnimationFrame(p.raf);
    p.audios.forEach((a) => { try { a.pause(); } catch (e) { /* niente */ } });
    p.urls.forEach((u) => URL.revokeObjectURL(u));
    p.audios = []; p.urls = []; p.offsets = []; p.seg = 0; p.data = null; p.lastIdx = -1; p.final = null; p.greyCache = new Map();
  };

  const globalTime = () => {
    const p = playRef.current;
    const a = p.audios[p.seg];
    return (p.offsets[p.seg] || 0) + (a ? a.currentTime : 0);
  };

  const ensureLoaded = async () => {
    const p = playRef.current;
    if (p.audios.length) return true;
    const data = await loadRecording(recording.id);
    if (!data) { alert("L'audio di questa registrazione non è stato trovato su questo dispositivo."); return false; }
    p.data = data;
    setBars(buildBars(data.segments));
    let acc = 0;
    p.offsets = data.segments.map((s) => { const o = acc; acc += s.duration || 0; return o; });
    data.segments.forEach((s, i) => {
      const url = URL.createObjectURL(s.blob);
      const a = new Audio(url);
      a.preload = 'auto';
      // I file registrati dal browser spesso non dichiarano la durata: la si fa calcolare forzando una lettura fino alla fine
      a.addEventListener('loadedmetadata', () => {
        if (a.duration === Infinity) {
          a.currentTime = 1e101;
          const reset = () => { a.removeEventListener('timeupdate', reset); a.currentTime = 0; };
          a.addEventListener('timeupdate', reset);
        }
      });
      // Finito un segmento si passa al successivo; finito l'ultimo la riproduzione si chiude
      a.addEventListener('ended', () => {
        const pp = playRef.current;
        if (phaseRef.current !== 'playing' || pp.seg !== i) return;
        if (i + 1 < pp.audios.length) {
          pp.seg = i + 1;
          const next = pp.audios[i + 1];
          next.currentTime = 0;
          next.playbackRate = SPEEDS[speedRef.current];
          next.play().catch(() => {});
        } else stopPlayback(true);
      });
      p.urls.push(url); p.audios.push(a);
    });
    return true;
  };

  // Il testo dell'editor non cambia durante il replay: si cambia solo quali parti sono grigie
  const setGrey = (ranges) => {
    recordingBus.grey = ranges;
    try { editor.view.dispatch(editor.state.tr.setMeta('replayGrey', true)); } catch (e) { /* editor già chiuso */ }
  };

  // Grigio = parti del testo finale che a quell'istante della registrazione non c'erano ancora
  const applyAt = (ms) => {
    const p = playRef.current;
    const ev = p.data?.events || [];
    let idx = -1;
    for (let i = 0; i < ev.length; i++) { if (ev[i].t <= ms) idx = i; else break; }
    if (idx < 0 || idx === p.lastIdx || !p.final) return;
    p.lastIdx = idx;
    let ranges = p.greyCache.get(idx);
    if (!ranges) {
      try { ranges = unwrittenRanges(p.final, docChars(htmlToDoc(editor, ev[idx].html)).text); }
      catch (e) { ranges = []; }
      p.greyCache.set(idx, ranges);
    }
    setGrey(ranges);
  };

  const endReplay = () => {
    recordingBus.grey = null;
    try {
      editor.view.dispatch(editor.state.tr.setMeta('replayGrey', true));
      editor.setEditable(true, false);
    } catch (e) { /* editor già chiuso */ }
  };

  const stopPlayback = (ended) => {
    const p = playRef.current;
    cancelAnimationFrame(p.raf);
    const a = p.audios[p.seg];
    if (a) a.pause();
    if (ended) {
      p.seg = 0;
      if (p.audios[0]) p.audios[0].currentTime = 0;
      setCurrent(0);
    } else setCurrent(globalTime());
    p.lastIdx = -1;
    endReplay();
    setPhase('idle');
  };

  const startPlayback = async () => {
    if (phase !== 'idle' || !recording) return;
    if (!(await ensureLoaded())) return;
    const p = playRef.current;
    p.final = docChars(editor.state.doc);
    editor.setEditable(false, false);
    p.audios.forEach((a) => { a.playbackRate = SPEEDS[speedRef.current]; });
    p.lastIdx = -1;
    try { await p.audios[p.seg].play(); }
    catch (e) { endReplay(); return; }
    setPhase('playing');
    const tick = () => {
      const t = globalTime();
      setCurrent(t);
      applyAt(t * 1000);
      p.raf = requestAnimationFrame(tick);
    };
    tick();
  };

  const cycleSpeed = () => {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    playRef.current.audios.forEach((a) => { a.playbackRate = SPEEDS[next]; });
  };

  // Clic sulla forma d'onda (verticale: dall'alto verso il basso scorre il tempo)
  const seek = (e) => {
    const p = playRef.current;
    if (!p.audios.length || !p.data) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min((e.clientY - rect.top) / rect.height, 1));
    const total = p.data.segments.reduce((a, s) => a + (s.duration || 0), 0);
    const t = ratio * total;
    let s = p.offsets.length - 1;
    while (s > 0 && p.offsets[s] > t) s--;
    if (s !== p.seg) {
      p.audios[p.seg].pause();
      p.seg = s;
      p.audios[s].playbackRate = SPEEDS[speedRef.current];
      if (phaseRef.current === 'playing') p.audios[s].play().catch(() => {});
    }
    p.audios[s].currentTime = Math.max(0, t - p.offsets[s]);
  };

  // Elimina la registrazione audio di questo testo (il testo non cambia)
  const deleteAudio = async () => {
    if (!recording) return;
    if (phaseRef.current === 'playing') stopPlayback(false);
    if (!window.confirm('Eliminare la registrazione audio di questo testo? Il testo resta com’è.')) return;
    const id = recording.id;
    releaseAudio();
    useStore.getState().setDocumentRecording(docId, null);
    setCurrent(0);
    setBars(null);
    await deleteRecording(id);
  };

  // Alla chiusura (cambio di testo/quaderno) si ferma tutto: una registrazione in corso viene comunque salvata
  useEffect(() => () => {
    if (phaseRef.current === 'recording') { try { recRef.current?.mr.stop(); } catch (e) { /* niente */ } }
    if (phaseRef.current === 'playing') endReplay();
    releaseAudio();
  }, []);

  // ---------- INTERFACCIA ----------
  const duration = recording?.duration || 0;
  const ratio = duration ? Math.min(current / duration, 1) : 0;
  const expanded = phase === 'playing';
  const shownBars = bars || Array(WAVE_BARS).fill(0.3);

  return (
    <div className="absolute bottom-4 right-4 z-30 flex flex-col items-center select-none" onMouseDown={(e) => e.preventDefault()}>
      {phase === 'recording' && (
        <div className="flex flex-col items-center gap-0.5 w-[30px] py-1 mb-2 border-2 border-gray-900 bg-white text-gray-900">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[9px] font-bold tabular-nums">{fmt(elapsed)}</span>
        </div>
      )}

      {phase !== 'recording' && recording && (
        // Colonna sopra il microfono: a riposo c'è solo il play, mentre si riproduce si apre verso l'alto
        <div className="flex flex-col w-[30px] mb-2 border-2 border-gray-900 bg-white text-gray-900">
          <div
            className="overflow-hidden transition-[max-height] duration-300 ease-out"
            style={{ maxHeight: expanded ? 240 : 0 }}
            aria-hidden={!expanded}
          >
            <div className="flex flex-col items-center">
              <button onClick={deleteAudio} className="w-[26px] h-[26px] flex items-center justify-center shrink-0 hover:bg-gray-100" title="Elimina la registrazione audio">
                <Trash2 size={12} />
              </button>
              {DIVIDER}
              <button onClick={cycleSpeed} className="w-full h-[22px] text-[10px] font-bold hover:bg-gray-100 shrink-0" title="Velocità di riproduzione">
                x{SPEEDS[speedIdx]}
              </button>
              {DIVIDER}
              <div className="relative w-full h-[150px] py-1 flex flex-col justify-between cursor-pointer shrink-0" onClick={seek} title="Clicca per spostarti">
                {shownBars.map((v, i) => (
                  <div
                    key={i}
                    className={`mx-auto rounded-full ${i / shownBars.length <= ratio ? 'bg-gray-900' : 'bg-gray-400'}`}
                    style={{ height: 2, width: Math.round(4 + v * 16) }}
                  />
                ))}
                <div
                  className="absolute left-0 right-0 h-[2px] bg-gray-900 pointer-events-none"
                  style={{ top: `calc(4px + ${ratio} * (100% - 8px))` }}
                />
              </div>
              {DIVIDER}
              <span className="h-[18px] flex items-center text-[9px] font-bold tabular-nums shrink-0">{fmt(current)}</span>
              {DIVIDER}
            </div>
          </div>
          <button
            onClick={() => (expanded ? stopPlayback(false) : startPlayback())}
            className="w-[26px] h-[26px] flex items-center justify-center shrink-0 self-center hover:bg-gray-100"
            title={expanded ? 'Pausa' : 'Riproduci la registrazione (il testo non ancora scritto è grigio)'}
          >
            {expanded ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
          </button>
        </div>
      )}

      {/* Senza registrazione si vede solo il microfono; con una registrazione esistente prosegue quella */}
      <button
        onClick={() => (phase === 'recording' ? stopRecording() : startRecording())}
        disabled={phase === 'playing'}
        className={`${BTN} ${phase === 'playing' ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-100'}`}
        title={phase === 'recording' ? 'Ferma la registrazione' : (recording ? 'Continua la registrazione (si aggiunge in coda)' : 'Registra audio mentre scrivi')}
      >
        {phase === 'recording' ? <Square size={11} fill="currentColor" /> : <Mic size={14} />}
      </button>
    </div>
  );
}
