// Runs in a bounded child process; no credentials and no document files on disk.
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createWorker } from 'tesseract.js';
import { mkdir } from 'node:fs/promises';

export async function extractLocal(bytes: Uint8Array, mime: string): Promise<string> {
 let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
 async function ocr(image: Uint8Array) {
  if (!worker) { await mkdir('.cache/ocr-language', { recursive: true }); worker = await createWorker(['eng','fra'], 1, { cachePath: '.cache/ocr-language', logger: () => {} }); }
  return (await worker.recognize(Buffer.from(image))).data.text;
 }
 try {
  if (mime !== 'application/pdf') return await ocr(bytes);
  const pdf = await getDocument({ data: bytes, useSystemFonts: false, verbosity: 0 }).promise;
  if (pdf.numPages > 50) throw new Error('PAGE_LIMIT');
  const output: string[] = [];
  for (let n=1;n<=pdf.numPages;n++) {
   const page=await pdf.getPage(n);const content=await page.getTextContent();
   const text=content.items.map(item=>'str' in item?item.str+('hasEOL' in item&&item.hasEOL?'\n':' '):'').join('');
   if(text.replace(/\s/g,'').length>40){output.push(text);continue;}
   const initial=page.getViewport({scale:1.8});const scale=initial.width*initial.height>8000000?1.8*Math.sqrt(8000000/(initial.width*initial.height)):1.8;
   const viewport=page.getViewport({scale});const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
   await page.render({canvasContext:canvas.getContext('2d') as any,viewport,canvas:canvas as any}).promise;
   output.push(await ocr(canvas.toBuffer('image/png')));page.cleanup();
  }
  await pdf.destroy();return output.join('\f');
 } finally { if(worker) await (worker as Awaited<ReturnType<typeof createWorker>>).terminate(); }
}
if (process.argv[1]?.endsWith('process.ts')) {
 const chunks:Buffer[]=[];let size=0;
 process.stdin.on('data',chunk=>{size+=chunk.length;if(size>36000000)process.exit(2);chunks.push(chunk);});
 process.stdin.on('end',()=>{void(async()=>{try{const request=JSON.parse(Buffer.concat(chunks).toString());const text=await extractLocal(new Uint8Array(Buffer.from(request.bytes,'base64')),request.mime);process.stdout.write(JSON.stringify({text}));}catch{process.stdout.write(JSON.stringify({error:'Local extraction failed. The original remains available; retry or enter the fields manually.'}));process.exitCode=1;}})();});
}

