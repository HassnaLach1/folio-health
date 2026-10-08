import test from 'node:test';
import assert from 'node:assert/strict';
import { comparison, eventSchema, exportHtml, extractCandidates, normalize, reportSchema, validDate, uuid, type Observation } from '../src/domain';
import { demoSnapshot } from '../src/demo';
const observation=(patch:Partial<Observation>={}):Observation=>({id:uuid(),label:'Hemoglobin',parameter:'hemoglobin',value:'120',unit:'g/L',range:'120–160 g/L',page:1,source:'Hemoglobin 120 g/L 120-160',review:{value:'reviewed',unit:'reviewed',range:'reviewed'},...patch});
test('hemoglobin conversion preserves bounds, source, and inequalities',()=>{
 const o=observation({value:'<120'});const result=normalize(o);
 assert.equal(result.value,'<12');assert.equal(result.range,'12–16 g/dL');assert.equal(result.unit,'g/dL');assert.equal(o.value,'<120');
 assert.equal(normalize(observation({value:'120,5'})).value,'12.05');
});
test('ambiguous ranges and unrelated parameters never use hemoglobin conversion',()=>{
 assert.equal(normalize(observation({range:'Adults 120–160; children 100–140'})).converted,false);
 assert.equal(normalize(observation({parameter:'unknown'})).unit,'g/L');
});
test('same-day panels remain separate; unknown parameters never silently merge',()=>{
 const reports=demoSnapshot().reports.filter(r=>r.kind==='lab').slice(0,2);
 reports[1]!.date=reports[0]!.date;reports.forEach(r=>r.observations=[observation({parameter:'',label:'Unknown analyte'})]);
 const table=comparison(reports,true);assert.equal(table.columns.length,2);assert.equal(table.rows.length,2);assert.equal(table.rows[0]!.cells.filter(Boolean).length,1);
});
test('unreviewed fields and dates are omitted by default; missing is not zero',()=>{
 const reports=demoSnapshot().reports.filter(r=>r.kind==='lab');const table=comparison(reports,false);
 assert.equal(table.omitted,3);assert.equal(table.rows[0]!.cells[2],null);
 assert.equal(comparison(reports,true).rows[0]!.cells[2]!.value,'13.2');
 reports[0]!.dateReviewed=false;assert.equal(comparison(reports,false).omitted,6);
});
test('parser extracts only source lines and does not invent dates or reference ranges',()=>{
 const reports=extractCandidates('CBC\nHemoglobin 12.4 g/dL\nWBC 5.2 10^9/L 4-10\nReport date: 2026-01-01',uuid());
 assert.equal(reports[0]!.date,'');assert.equal(reports[0]!.observations.length,2);
 assert.equal(reports[0]!.observations[0]!.range,'');assert.equal(reports[0]!.observations[0]!.review.value,'pending');
});
test('imaging conclusion is copied, missing conclusions are not generated',()=>{
 assert.equal(extractCandidates('MRI\nFindings: fictional description',uuid())[0]!.conclusion,'');
 assert.equal(extractCandidates('MRI\nConclusion: Exact source words.\nSignature: X',uuid())[0]!.conclusion,'Exact source words.');
});
test('exports use the same values, escape input, and repeat bounded column groups',()=>{
 const reports=demoSnapshot().reports.filter(r=>r.kind==='lab');
 const html=exportHtml(reports,'<script>bad</script>',true);assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('13.2'));assert.ok(html.includes('12–16 g/dL'));assert.ok(html.includes('Unreviewed'));
 const big=exportHtml([...reports,...reports,...reports],'CBC',true);assert.equal((big.match(/class="page"/g)||[]).length,3);
});
test('calendar rejects invalid dates, reversed stays, and reminders without time',()=>{
 assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('2024-02-29'),true);
 const e=demoSnapshot().events[0]!;assert.throws(()=>eventSchema.parse({...e,time:'',reminderMinutes:15}));assert.throws(()=>eventSchema.parse({...e,endDate:'2020-01-01'}));
});
test('date cannot be marked reviewed without an actual date',()=>{
 const r=demoSnapshot().reports[0]!;assert.throws(()=>reportSchema.parse({...r,date:'',dateReviewed:true}));
});
