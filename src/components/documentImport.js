// Importazione di testi: PDF (estratto in testo) e TXT. Il risultato è HTML pronto per l'editor.
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const median = (arr) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

async function pdfToParagraphs(file) {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const paragraphs = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    // 1) raggruppa i frammenti in righe (stessa coordinata verticale)
    const lines = [];
    let cur = null;
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = item.transform[5];
      const h = item.height || Math.abs(item.transform[3]) || 10;
      if (cur && Math.abs(cur.y - y) < Math.max(2, cur.h * 0.5)) cur.text += item.str;
      else { cur = { y, h, text: item.str }; lines.push(cur); }
    }
    const clean = lines.map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() })).filter((l) => l.text);
    if (!clean.length) continue;

    // 2) una riga con spazio verticale ampio inizia un nuovo paragrafo
    const gaps = [];
    for (let i = 1; i < clean.length; i++) { const g = clean[i - 1].y - clean[i].y; if (g > 0) gaps.push(g); }
    const typical = median(gaps) || 12;

    let para = clean[0].text;
    for (let i = 1; i < clean.length; i++) {
      const gap = clean[i - 1].y - clean[i].y;
      if (gap > typical * 1.5 || gap < 0) { paragraphs.push(para); para = clean[i].text; }
      else if (/[a-zà-ÿ]-$/.test(para) && /^[a-zà-ÿ]/.test(clean[i].text)) para = para.slice(0, -1) + clean[i].text;
      else para += ' ' + clean[i].text;
    }
    paragraphs.push(para);
  }
  return paragraphs;
}

const baseName = (name) => name.replace(/\.[^.]+$/, '');

// Restituisce { name, content } oppure lancia un errore con un messaggio leggibile.
export async function fileToDocument(file) {
  const lower = file.name.toLowerCase();
  let paragraphs;
  if (lower.endsWith('.pdf')) {
    paragraphs = await pdfToParagraphs(file);
    if (!paragraphs.length) throw new Error(`«${file.name}» non contiene testo selezionabile (forse è una scansione).`);
  } else if (lower.endsWith('.txt')) {
    paragraphs = (await file.text()).split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  } else {
    throw new Error(`Formato non supportato: «${file.name}». Usa PDF o TXT.`);
  }
  return { name: baseName(file.name), content: paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('') };
}
