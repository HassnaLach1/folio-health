import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBedrockExtraction, buildBedrockRequest, defaultModelId, bedrockClient } from '../worker/bedrock';
import { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { comparison, panelKey, uuid } from '../src/domain';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { renderImages } from '../worker/render';

test('structured extraction preserves distinct panels, source pages, and pending review', () => {
  const documentId = uuid();
  const input = { title: 'Blood work', category: 'Laboratory', examinationDate: '2026-10-08', doctor: '', facility: 'Atlas Lab', reports: [
    { panel: 'NFS', panelCode: 'complete_blood_count', sourcePages: [1, 2], educationalNote: 'A blood count measures blood cells.', aiInterpretation: null, kind: 'lab', examinationDate: '', doctor: '', facility: '', bodyRegion: '', conclusion: '', findings: '', observations: [{ label: 'Hgb', parameter: 'hemoglobin', value: '< 0.5', unit: 'g/dL', range: '13.5 - 17.5', page: 1, source: 'Hgb < 0.5 g/dL' }] },
    { panel: 'Kidney Function', panelCode: 'kidney_function', sourcePages: [2], educationalNote: 'This panel measures substances filtered by the kidneys.', aiInterpretation: 'Creatinine 1.0 mg/dL is within 0.6 - 1.2 mg/dL.', kind: 'lab', examinationDate: '', doctor: '', facility: '', bodyRegion: '', conclusion: 'Reported impression.', findings: 'Reported detail.', observations: [{ label: 'Creatinine', parameter: 'creatinine', value: '1.0', unit: 'mg/dL', range: '0.6 - 1.2', page: 2, source: 'Creatinine 1.0 mg/dL' }] },
  ] };
  const result = parseBedrockExtraction(input, documentId, 2);
  assert.equal(result.reports.length, 2);
  assert.deepEqual(result.reports[0]!.sourcePages, [1, 2]);
  assert.equal(result.reports[0]!.aiInterpretation, null);
  assert.match(result.reports[1]!.aiInterpretation!, /not a medical diagnosis/);
  const missing = parseBedrockExtraction({ ...input, examinationDate: null, doctor: null, facility: null, reports: [{ ...input.reports[0], examinationDate: null, doctor: null, facility: null, conclusion: null, observations: [{ ...input.reports[0]!.observations[0], value: null, unit: null, range: null }] }] }, documentId, 2);
  assert.equal(missing.reports[0]!.date, '');
  assert.equal(missing.reports[0]!.observations[0]!.value, '');
  assert.equal(result.reports[1]!.sourcePage, 2);
  assert.equal(result.reports[1]!.facility, 'Atlas Lab');
  assert.equal(result.reports[1]!.conclusion, 'Reported impression.');
  assert.equal(result.reports[0]!.observations[0]!.value, '< 0.5');
  assert.equal(result.reports[0]!.observations[0]!.review.value, 'pending');
  assert.equal(panelKey(result.reports[0]!), 'complete_blood_count');
  const later = structuredClone(result.reports[1]!);
  later.id = uuid(); later.date = '2026-10-09'; later.dateReviewed = true;
  later.observations[0]!.review = { value: 'reviewed', unit: 'reviewed', range: 'reviewed' };
  assert.equal(comparison([result.reports[1]!, later], false).rows.length, 1);
  assert.equal(comparison([result.reports[1]!, later], false).omitted, 1);
  assert.throws(() => parseBedrockExtraction({ ...input, reports: [{ ...input.reports[1], sourcePages: [3] }] }, documentId, 2), /outside/);
});

test('PDF rendering keeps absolute page numbers and Bedrock-sized image bytes', async () => {
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const text of ['SYNTHETIC CBC', 'SYNTHETIC KIDNEY']) pdf.addPage().drawText(text, { x: 40, y: 700, font, size: 22 });
  const images = await renderImages(await pdf.save(), 'application/pdf', 2, 1);
  assert.deepEqual(images.map(image => image.page), [2]);
  const jpeg = Buffer.from(images[0]!.bytes, 'base64');
  assert.equal(jpeg[0], 0xff); assert.equal(jpeg[1], 0xd8);
  assert.ok(jpeg.length < 3_500_000);
});

test('Haiku request includes the entire document and rejects partial page sets', () => {
  const images = Array.from({ length: 30 }, (_, index) => ({ page: index + 1, bytes: '/9j/' }));
  const request = JSON.parse(buildBedrockRequest(images, 30));
  assert.match(defaultModelId, /haiku-4-5/);
  assert.equal(request.messages.length, 1);
  assert.equal(request.messages[0].content.filter((c: any) => c.type === 'image').length, 30);
  assert.match(request.system, /Read ALL pages together/);
  assert.equal(request.output_config.format.type, 'json_schema');
  assert.throws(() => buildBedrockRequest(images.slice(0, 5), 30), /All document pages/);
});

test('temporary Bedrock token signs requests without requiring an AWS access-key profile', async () => {
  const previous = process.env.AWS_BEARER_TOKEN_BEDROCK;
  process.env.AWS_BEARER_TOKEN_BEDROCK = 'fictional-test-token';
  const client = bedrockClient('eu-west-1');
  client.config.credentials = async () => { throw new Error('Access-key authentication must not run for bearer tokens.'); };
  client.config.requestHandler = { handle: async (request: any) => {
    assert.equal(Object.entries(request.headers).find(([name]) => name.toLowerCase() === 'authorization')?.[1], 'Bearer fictional-test-token');
    return { response: { statusCode: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from('{}') } };
  } } as any;
  try {
    await client.send(new InvokeModelCommand({ modelId: defaultModelId, body: '{}', contentType: 'application/json' }));
  } finally {
    client.destroy();
    if (previous === undefined) delete process.env.AWS_BEARER_TOKEN_BEDROCK;
    else process.env.AWS_BEARER_TOKEN_BEDROCK = previous;
  }
});
