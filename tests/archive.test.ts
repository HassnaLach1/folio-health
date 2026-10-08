import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { archive, crc32 } from '../src/archive';

test('selected originals retain their exact bytes, safe names, and UTF-8 ZIP metadata', async () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const data = archive([{ name: '../résultat.pdf', bytes: new Uint8Array([0, 255, 1, 2]) }, { name: 'résultat.pdf', bytes: new TextEncoder().encode('Fictional source') }]);
  assert.equal(new DataView(data.buffer).getUint32(0, true), 0x04034b50);
  assert.throws(() => archive([]), /Select/);
  assert.throws(() => archive(Array.from({length:21}, () => ({name:'x',bytes:new Uint8Array()}))), /Select/);
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/selected-originals.zip', data);
});
