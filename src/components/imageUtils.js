// Elaborazione delle immagini allegate (nodi e glossario).
// Restituisce { image, imageOriginal }:
//  - imageOriginal: versione a colori ridimensionata (modalità "colorata" e "bianco e nero")
//  - image: versione con dithering a 1 bit (modalità "attuale")
export function processImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error('Nessun file')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Immagine non valida'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const scale = Math.min(300 / img.width, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const imageOriginal = canvas.toDataURL('image/jpeg', 0.85);

        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const dataArr = pixels.data;
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const idx = (y * canvas.width + x) * 4;
            const oldPixel = 0.2126 * dataArr[idx] + 0.7152 * dataArr[idx + 1] + 0.0722 * dataArr[idx + 2];
            const newPixel = oldPixel < 128 ? 0 : 255;
            dataArr[idx] = dataArr[idx + 1] = dataArr[idx + 2] = newPixel;
            dataArr[idx + 3] = 255;
            const err = Math.floor((oldPixel - newPixel) / 8);
            const addError = (ox, oy) => {
              if (x + ox >= 0 && x + ox < canvas.width && y + oy >= 0 && y + oy < canvas.height) {
                const errIdx = ((y + oy) * canvas.width + (x + ox)) * 4;
                dataArr[errIdx] += err; dataArr[errIdx + 1] += err; dataArr[errIdx + 2] += err;
              }
            };
            addError(1, 0); addError(2, 0); addError(-1, 1); addError(0, 1); addError(1, 1); addError(0, 2);
          }
        }
        ctx.putImageData(pixels, 0, 0);
        resolve({ image: canvas.toDataURL('image/png'), imageOriginal });
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Sorgente e filtro da mostrare in base alla modalità immagini: 'attuale' | 'bn' | 'colore'
export function pickImage(item, imageMode) {
  const src = imageMode === 'attuale'
    ? (item.image || item.imageOriginal)
    : (item.imageOriginal || item.image);
  const filter = imageMode === 'bn' ? 'grayscale(1) contrast(1.05)' : 'none';
  return { src, filter };
}
