// Live check sends fictional source text only, without patient records or persistence.
import assert from 'node:assert/strict';
import { compareImaging } from './imaging';
import { aiDisclaimer } from '../src/domain';

async function main() {
  const summary = await compareImaging([
    { date: '2026-09-01', panel: 'Chest CT', bodyRegion: 'Chest', conclusion: 'A focus measures 5 mm.', findings: 'A 5 mm focus is described in the right lung. No pleural fluid is described.' },
    { date: '2026-10-01', panel: 'Chest CT', bodyRegion: 'Chest', conclusion: 'A focus measures 6 mm.', findings: 'A 6 mm focus is described in the right lung. No pleural fluid is described.' },
  ]);
  assert.match(summary, /5\s*mm/); assert.match(summary, /6\s*mm/);
  assert.ok(summary.includes(aiDisclaimer));
  console.info('Haiku imaging comparison passed: both source measurements and disclaimer preserved.');
  console.info(summary); // Fictional fixture only.
}
void main().catch(error => { console.error('Fictional imaging comparison failed:', error instanceof Error ? `${error.name}: ${error.message.replace(/bedrock-api-key-[A-Za-z0-9+/=_-]+/g, '[REDACTED]')}` : 'UnknownError'); process.exitCode = 1; });
