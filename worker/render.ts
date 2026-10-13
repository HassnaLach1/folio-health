// Rasterize untrusted PDF pages in a credentialless child process. No files are written.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export type SourceImage = { page: number; bytes: string };
const imageLimit = 3_500_000; // Bedrock's image limit is 3.75 MB.

async function encodeImage(source: Uint8Array): Promise<Buffer> {
  const image = await loadImage(Buffer.from(source));
  let scale = Math.min(1, 2000 / Math.max(image.width, image.height));
  for (let attempt = 0; attempt < 6; attempt++) {
    const canvas = createCanvas(Math.max(1, Math.ceil(image.width * scale)), Math.max(1, Math.ceil(image.height * scale)));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const jpeg = canvas.toBuffer('image/jpeg', 85);
    if (jpeg.length <= imageLimit) return jpeg;
    scale *= 0.8;
  }
  throw new Error('Image is too large for Bedrock.');
}

export async function renderImages(bytes: Uint8Array, mime: string, startPage = 1, count = 5): Promise<SourceImage[]> {
  if (!Number.isInteger(count) || count < 1 || count > 50 || !Number.isInteger(startPage) || startPage < 1) throw new Error('Invalid page request.');
  if (mime !== 'application/pdf') return [{ page: 1, bytes: (await encodeImage(bytes)).toString('base64') }];
  const standardFontsPath = './node_modules/pdfjs-dist/standard_fonts/';
  const pdf = await getDocument({ data: bytes, useSystemFonts: false, standardFontDataUrl: standardFontsPath, verbosity: 0 }).promise;
  if (pdf.numPages > 50) { await pdf.destroy(); throw new Error('Page limit exceeded.'); }
  const pageByteLimit = Math.min(imageLimit, Math.floor(17_000_000 / count));
  const images: SourceImage[] = [];
  try {
    for (let index = startPage; index <= Math.min(pdf.numPages, startPage + count - 1); index++) {
      const page = await pdf.getPage(index);
      let scale = 2.2;
      const bounds = page.getViewport({ scale: 1 });
      scale = Math.min(scale, 2000 / Math.max(bounds.width, bounds.height));
      let encoded: Buffer | null = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx as any, viewport, canvas: canvas as any }).promise;
        const jpeg = canvas.toBuffer('image/jpeg', 85);
        if (jpeg.length <= pageByteLimit) { encoded = jpeg; break; }
        scale *= 0.8;
      }
      page.cleanup();
      if (!encoded) throw new Error('PDF page is too large for Bedrock.');
      images.push({ page: index, bytes: encoded.toString('base64') });
    }
  } finally { await pdf.destroy(); }
  return images;
}

if (process.argv[1]?.endsWith('render.ts')) {
  const chunks: Buffer[] = []; let size = 0;
  process.stdin.on('data', chunk => { size += chunk.length; if (size > 36_000_000) process.exit(2); chunks.push(chunk); });
  process.stdin.on('end', () => { void (async () => {
    try {
      const request = JSON.parse(Buffer.concat(chunks).toString()) as { bytes: string; mime: string; startPage: number; count: number };
      const images = await renderImages(new Uint8Array(Buffer.from(request.bytes, 'base64')), request.mime, request.startPage, request.count);
      process.stdout.write(JSON.stringify({ images }));
    } catch { process.stdout.write(JSON.stringify({ error: 'Could not prepare pages for Bedrock.' })); process.exitCode = 1; }
  })(); });
}
