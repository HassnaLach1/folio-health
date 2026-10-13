// Explicit live-provider check using fictional pages only. Never reads user documents.
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { bedrock } from './bedrock';
import { renderImages } from './render';
import { uuid, aiDisclaimer } from '../src/domain';

async function main() {
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = [
    ['FICTIONAL LABORATORY REPORT', 'Facility: Synthetic Lab', 'Ordering physician: Dr Example', 'Collection date: 2026-10-12', 'Print date: 2026-10-13', 'Kidney Function Panel', 'Analyte | Value | Unit | Reference range', 'Creatinine | 1.2 | mg/dL | 0.6 - 1.1', 'This panel continues on the next page.'],
    ['Kidney Function Panel - continued', 'Collection date: 2026-10-12', 'Analyte | Value | Unit | Reference range', 'Urea | 5.0 | mmol/L | 2.5 - 7.5', 'End of Kidney Function Panel.'],
    ['Liver Function Panel', 'Collection date: 2026-10-12', 'Analyte | Value | Unit | Reference range', 'ALT | 22 | U/L | 7 - 56', 'AST | 25 | U/L | 10 - 40', 'Conclusion: Results listed above.'],
  ];
  for (const lines of pages) {
    const page = pdf.addPage([595, 842]);
    lines.forEach((line, index) => page.drawText(line, { x: 35, y: 790 - index * 35, size: 14, font }));
  }
  const images = await renderImages(await pdf.save(), 'application/pdf', 1, 3);
  const result = await bedrock(images, uuid(), 3);
  assert.equal(result.category, 'Laboratory');
  assert.equal(result.reports.length, 2, 'Continuation pages must form one panel.');
  const kidney = result.reports.find(report => report.panelCode === 'kidney_function');
  const liver = result.reports.find(report => report.panelCode === 'liver_function');
  assert.ok(kidney); assert.ok(liver);
  assert.deepEqual(kidney.sourcePages, [1, 2]); assert.deepEqual(liver.sourcePages, [3]);
  assert.equal(kidney.date, '2026-10-12');
  assert.equal(kidney.observations.find(o => o.parameter === 'creatinine')?.value, '1.2');
  assert.equal(kidney.observations.find(o => o.parameter === 'urea')?.page, 2);
  assert.equal(liver.observations.find(o => o.parameter === 'alanine_aminotransferase')?.value, '22');
  assert.ok(liver.conclusion);
  for (const report of result.reports) {
    assert.ok(report.educationalNote);
    if (report.aiInterpretation) assert.ok(report.aiInterpretation.includes(aiDisclaimer));
    assert.equal(report.dateReviewed, false);
    assert.ok(report.observations.every(o => o.review.value === 'pending'));
  }
  console.info('Haiku fictional-document check passed: two panels, three pages, source values and pending review.');
}
void main().catch(error => { console.error('Haiku fictional-document check failed:', error instanceof Error ? `${error.name}: ${error.message.replace(/bedrock-api-key-[A-Za-z0-9+/=_-]+/g, '[REDACTED]')}` : 'UnknownError'); process.exitCode = 1; });
