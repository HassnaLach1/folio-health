import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { extractLocal } from '../worker/process';
import { createCanvas } from '@napi-rs/canvas';
import { extractCandidates, uuid } from '../src/domain';
test('worker reads a real synthetic PDF text layer without an external OCR service',async()=>{
 const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.Helvetica);const page=doc.addPage();
 page.drawText('SYNTHETIC CBC REPORT\nExamination date: 2026-10-08\nHemoglobin 12.8 g/dL 12-16',{x:40,y:740,font,size:14,lineHeight:24});
 const bytes=await doc.save();const text=await extractLocal(bytes,'application/pdf');
 assert.match(text,/Hemoglobin 12.8 g\/dL/);assert.match(text,/2026-10-08/);
 const report=extractCandidates(text,uuid())[0]!;
 assert.equal(report.panel,'SYNTHETIC CBC REPORT');assert.equal(report.date,'2026-10-08');
 assert.equal(report.observations[0]?.value,'12.8');assert.equal(report.observations[0]?.range,'12-16 g/dL');
});
test('local OCR reads a synthetic scan image', {timeout:120000}, async()=>{
 const canvas=createCanvas(1400,500);const ctx=canvas.getContext('2d');
 ctx.fillStyle='#fff';ctx.fillRect(0,0,1400,500);ctx.fillStyle='#000';ctx.font='36px Arial';
 ctx.fillText('SYNTHETIC CBC REPORT',50,70);ctx.fillText('Hemoglobin 12.8 g/dL 12-16',50,150);
 const text=await extractLocal(new Uint8Array(canvas.toBuffer('image/png')),'image/png');
 assert.match(text,/Hemoglobin/i);assert.match(text,/12[.,]8/);
});
