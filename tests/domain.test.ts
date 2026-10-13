import test from 'node:test';
import assert from 'node:assert/strict';
import { comparison, groupedComparison, groupObservations, imagingRegionsOverlap, panelDisplayName, eventSchema, exportHtml, extractCandidates, normalize, rangeStatus, briefRangeSummary, reportSchema, validDate, uuid, type Observation } from '../src/domain';
import { demoSnapshot } from '../src/demo';
const observation=(patch:Partial<Observation>={}):Observation=>({id:uuid(),label:'Hemoglobin',parameter:'hemoglobin',value:'120',unit:'g/L',range:'120–160 g/L',page:1,source:'Hemoglobin 120 g/L 120-160',review:{value:'reviewed',unit:'reviewed',range:'reviewed'},...patch});
test('same-day comparison combines panel sources without duplicating dates or identical results',()=>{
 const base={...demoSnapshot().reports[0]!,panelCode:'liver_function',date:'2026-05-19',dateReviewed:true};
 const alt=observation({label:'ALT',parameter:'alanine_aminotransferase',value:'30',unit:'U/L',range:'9 - 36'});
 const first={...base,id:uuid(),documentId:uuid(),observations:[alt]};
 const second={...base,id:uuid(),documentId:uuid(),observations:[observation({label:'ALP',parameter:'alkaline_phosphatase',value:'62',unit:'U/L',range:'40 - 110'})]};
 const duplicate={...first,id:uuid(),observations:[{...alt,id:uuid()}]};
 const different={...first,id:uuid(),observations:[{...alt,id:uuid(),value:'38.9'}]};
 const reports=[first,second,duplicate,different];const before=JSON.stringify(reports);
 const table=groupedComparison(reports,false);
 assert.equal(table.columns.length,1);assert.equal(table.columns[0]!.sourceReports.length,4);
 const altRow=table.rows.find(row=>row.parameter==='alanine_aminotransferase')!;
 assert.deepEqual(altRow.cells[0]!.map(cell=>cell.value).sort(),['30','38.9']);
 assert.equal(table.rows.find(row=>row.parameter==='alkaline_phosphatase')!.cells[0]![0]!.sourceReport.id,second.id);
 assert.equal(JSON.stringify(reports),before,'Grouping must not change persisted source reports.');
 const html=exportHtml(reports,'Liver Function Panel',false);
 assert.equal((html.match(/<th>2026-05-19<small>/g)||[]).length,1);
 assert.equal(groupedComparison([first,{...second,date:'2026-05-20'}],false).columns.length,2);
 assert.equal(groupedComparison([first,{...second,panelCode:'kidney_function'}],false).columns.length,2);
 assert.equal(groupedComparison([{...first,date:''},{...second,date:''}],true).columns.length,2);
 const pending={...duplicate,dateReviewed:false};
 assert.equal(groupedComparison([first,pending],false).rows[0]!.cells[0]!.length,1);
 assert.equal(groupedComparison([first,pending],false).omitted,1);
 assert.equal(groupedComparison([pending,first],true).rows[0]!.cells[0]![0]!.unreviewed,false);
});
test('dual-unit analytes stay together with exact per-unit values and ranges',()=>{
 const report=demoSnapshot().reports[0]!;
 report.observations=[observation({parameter:'urea',label:'Urée',value:'0,64',unit:'g/L',range:'0,1 - 0,5'}),observation({parameter:'urea',label:'Urée',value:'10,67',unit:'mmol/L',range:'2,5 - 7,5'}),observation({parameter:'creatinine',label:'Créatinine',value:'11,56',unit:'mg/L',range:'5 - 9'}),observation({parameter:'creatinine',label:'Créatinine',value:'102,2',unit:'µmol/L',range:'44 - 80'})];
 const grouped=groupedComparison([report],true);
 assert.equal(grouped.rows.length,2);
 assert.deepEqual(grouped.rows[0]!.cells[0]!.map(c=>[c.value,c.unit,c.range]),[['0,64','g/L','0,1 - 0,5'],['10,67','mmol/L','2,5 - 7,5']]);
 assert.equal(groupObservations(report.observations).length,2);
 report.observations.push({...report.observations[0]!,id:uuid(),value:'0,65'});
 assert.equal(groupedComparison([report],true).rows[0]!.cells[0]!.length,3,'Repeated measurements are retained inside the analyte block.');
 assert.equal(panelDisplayName({panel:'Biochemistry - Continued',panelCode:'kidney_function'}),'Kidney Function Panel');
});
test('imaging accepts shared coverage and excludes unrelated regions',()=>{
 assert.equal(imagingRegionsOverlap('Thorax, Abdomen, Pelvis','Abdomen and Pelvis'),true);
 assert.equal(imagingRegionsOverlap('Brain','Knee'),false);
 const report=demoSnapshot().reports.find(r=>r.kind==='imaging')!;
 const html=exportHtml([{...report,conclusion:'Source conclusion',findings:'DETAILS MUST BE EXCLUDED',conclusionReviewed:true}], 'Report timeline',false);
 assert.ok(html.includes('Source conclusion'));assert.ok(!html.includes('DETAILS MUST BE EXCLUDED'));
});
test('range classification handles one-sided limits and preserves uncertainty',()=>{
 assert.equal(rangeStatus('5','3 - 7'),'normal');
 assert.equal(rangeStatus('99','inférieur à 100'),'normal');
 assert.equal(rangeStatus('100','inférieur à 100'),'high');
 assert.equal(rangeStatus('101','inférieur à 100'),'high');
 assert.equal(rangeStatus('100','inférieur ou égal à 100'),'normal');
 assert.equal(rangeStatus('3,4','supérieur à 3,5'),'low');
 assert.equal(rangeStatus('99','Inférieure à 100 mg/dL'),'normal');
 assert.equal(rangeStatus('38.9','(10 - 35)'),'high');
 assert.equal(rangeStatus('30','(9 - 36)'),'normal');
 assert.equal(rangeStatus('8','3 - 7'),'high');
 assert.equal(rangeStatus('2','3 - 7'),'low');
 assert.equal(rangeStatus('5','< 5'),'high');
 assert.equal(rangeStatus('5','≤ 5'),'normal');
 assert.equal(rangeStatus('3,4','>= 3,5'),'low');
 assert.equal(rangeStatus('< 0.5','< 1'),'normal');
 assert.equal(rangeStatus('< 8','3 - 7'),'unknown');
 assert.equal(rangeStatus('Positive','Negative'),'high');
 assert.equal(rangeStatus('Negative','Negative'),'normal');
 assert.equal(rangeStatus('5',''),'unknown');
 assert.equal(rangeStatus('','3 - 7'),'unknown');
 assert.equal(rangeStatus('5','3 - 7 children; 4 - 8 adults'),'unknown');
});
test('brief range summary corrects old model commentary using the source numbers',()=>{
 const report=demoSnapshot().reports[0]!;
 report.observations=[observation({label:'ALT',value:'38.9',range:'(10 - 35)',unit:'U/L'})];
 report.aiInterpretation='ALT is within range.';
 assert.match(briefRangeSummary(report),/38.9 U\/L — above range/);
});
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
test('parser extracts dated lab rows without inventing reference ranges',()=>{
 const reports=extractCandidates('CBC\nHemoglobin 12.4 g/dL\nWBC 5.2 10^9/L 4-10\nReport date: 2026-01-01',uuid());
 assert.equal(reports[0]!.date,'2026-01-01');assert.equal(reports[0]!.observations.length,2);
 assert.equal(reports[0]!.observations[0]!.range,'');assert.equal(reports[0]!.observations[0]!.review.value,'pending');
});
test('parser separates important labels and unfamiliar laboratory results',()=>{
 const report=extractCandidates('Laboratoire: Centre Atlas\nMédecin: Dr Sample\nDate de prélèvement: 09/10/2026\nAnalyses\nGlucose 95 mg/dL 70-100\nDossier 1234\nAddress: 12 Main Street',uuid())[0]!;
 assert.equal(report.date,'2026-10-09');assert.equal(report.facility,'Centre Atlas');assert.equal(report.doctor,'Dr Sample');
 assert.equal(report.kind,'lab');assert.equal(report.observations.length,1);assert.equal(report.observations[0]!.label,'Glucose');
 assert.equal(report.observations[0]!.range,'70-100 mg/dL');
});
test('imaging conclusion is copied, missing conclusions are not generated',()=>{
 assert.equal(extractCandidates('MRI\nFindings: fictional description',uuid())[0]!.conclusion,'');
 assert.equal(extractCandidates('MRI\nConclusion: Exact source words.\nSignature: X',uuid())[0]!.conclusion,'Exact source words.');
});
test('imaging type becomes the title and description stays outside the conclusion',()=>{
 const report=extractCandidates('Centre d’imagerie Atlas\nSCANNER THORACIQUE\nDate d’examen: 08/10/2026\nDr. Example\nDESCRIPTION\nLong technical description.\nCONCLUSION\nNo acute finding.\nSignature: Dr. Example',uuid())[0]!;
 assert.equal(report.panel,'SCANNER THORACIQUE');assert.equal(report.date,'2026-10-08');
 assert.equal(report.doctor,'Dr. Example');assert.equal(report.facility,"Centre d'imagerie Atlas");
 assert.equal(report.conclusion,'No acute finding.');assert.equal(report.observations.length,0);
});
test('lab rows become editable parameter, value, unit and range candidates',()=>{
 const report=extractCandidates('BIOCHIMIE\nLaboratoire: Atlas\nDate: 2026-10-09\nGlucose | 95 | mg/dL | 70-100\nTSH 2.4 mIU/L 0.4-4.0',uuid())[0]!;
 assert.equal(report.panel,'BIOCHIMIE');assert.equal(report.kind,'lab');assert.equal(report.conclusion,'');
 assert.deepEqual(report.observations.map(o=>[o.label,o.value,o.unit,o.range]),[['Glucose','95','mg/dL','70-100 mg/dL'],['TSH','2.4','mIU/L','0.4-4.0 mIU/L']]);
});
test('mixed report keeps both laboratory values and the written conclusion',()=>{
 const report=extractCandidates('BIOCHIMIE\nGlucose 95 mg/dL 70-100\nCONCLUSION\nResults discussed with patient.',uuid())[0]!;
 assert.equal(report.kind,'lab');assert.equal(report.observations.length,1);
 assert.equal(report.conclusion,'Results discussed with patient.');
});
test('reference-first lab columns populate the editable values table',()=>{
 const report=extractCandidates('BILAN LIPIDIQUE\nNom du laboratoire: Clinique Atlas\nMédecin prescripteur Dr Haddad\nDate de naissance: 01/02/1980\nDate d’examen 9-10-2026\nCholestérol total | 1.8 | 1.2-2.0 | g/L',uuid())[0]!;
 assert.equal(report.panel,'BILAN LIPIDIQUE');assert.equal(report.facility,'Clinique Atlas');assert.equal(report.doctor,'Dr Haddad');assert.equal(report.date,'2026-10-09');
 assert.deepEqual(report.observations.map(o=>[o.label,o.value,o.unit,o.range]),[['Cholestérol total','1.8','g/L','1.2-2.0']]);
});
test('multi-section laboratory report links continuation values and later reference ranges',()=>{
 const text='Laboratoire Horizon\nDOCTEUR EXAMPLE\nCATECHOLAMINES (LC-MSMS)\nPrélèvement : 08.09.2026 Urine de 24 H\nAdrénaline   <0,02 μmol/l\nNoradrénaline   0,06 μmol/l\n0,12 μmol/24h\n20 μg/24h\nValeurs de référence   Adrénaline   <0,10 μmol/24h\nNoradrénaline <0,50 μmol/24h (< 83 μg/24h)\nValidé par : Dr Reviewer\nCREATININE (Enzymologie) #\nPrélèvement : 08.09.2026\nRésultat : 5,32 mmol/l\n10,64 mmol/24h\nFemmes : 6,00 à 13 mmol/24h\nHommes : 9,00 à 19,00 mmol/24h';
 const report=extractCandidates(text,uuid())[0]!;
 assert.equal(report.kind,'lab');assert.equal(report.panel,'CATECHOLAMINES (LC-MSMS)');assert.equal(report.date,'2026-09-08');
 assert.deepEqual(report.observations.map(o=>[o.label,o.value,o.unit,o.range]),[
  ['Adrénaline','<0,02','μmol/l',''],['Noradrénaline','0,06','μmol/l',''],['Noradrénaline','0,12','μmol/24h','<0,50 μmol/24h'],['Noradrénaline','20','μg/24h','< 83 μg/24h'],
  ['CREATININE (Enzymologie)','5,32','mmol/l',''],['CREATININE (Enzymologie)','10,64','mmol/24h','Femmes: 6,00 à 13 mmol/24h; Hommes: 9,00 à 19,00 mmol/24h']]);
});
test('an imaging report with a bilan phrase stays an imaging report',()=>{
 const report=extractCandidates('SCANNER THORACIQUE\nDate: 2026-09-08\nDescription: Bilan d’extension.\nCONCLUSION\nNo acute finding.',uuid())[0]!;
 assert.equal(report.kind,'imaging');assert.equal(report.observations.length,0);assert.equal(report.conclusion,'No acute finding.');
});
test('exports use the same values, escape input, and repeat bounded column groups',()=>{
 const reports=demoSnapshot().reports.filter(r=>r.kind==='lab');
 const html=exportHtml(reports,'<script>bad</script>',true);assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('13.2'));assert.ok(html.includes('12–16 g/dL'));assert.ok(html.includes('Unreviewed'));
 const big=exportHtml(Array.from({length:10},(_,index)=>({...reports[0]!,id:uuid(),date:`2026-01-${String(index+1).padStart(2,'0')}`})),'CBC',true);assert.equal((big.match(/class="page"/g)||[]).length,3);
});
test('calendar rejects invalid dates, reversed stays, and reminders without time',()=>{
 assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('2024-02-29'),true);
 const e=demoSnapshot().events[0]!;assert.throws(()=>eventSchema.parse({...e,time:'',reminderMinutes:15}));assert.throws(()=>eventSchema.parse({...e,endDate:'2020-01-01'}));
});
test('date cannot be marked reviewed without an actual date',()=>{
 const r=demoSnapshot().reports[0]!;assert.throws(()=>reportSchema.parse({...r,date:'',dateReviewed:true}));
});
test('different named laboratory panels on separate pages stay distinct',()=>{
 const source='HEMATOLOGY\nDate: 2026-10-08\nHemoglobin 13.2 g/dL 12-16\fRENAL FUNCTION\nDate: 2026-10-08\nCreatinine 0.9 mg/dL 0.6-1.2';
 const reports=extractCandidates(source,uuid());
 assert.equal(reports.length,2);
 assert.deepEqual(reports.map(r=>[r.panel,r.observations[0]?.page]),[['HEMATOLOGY',1],['RENAL FUNCTION',2]]);
});
test('numeric source ranges determine color when the reported interval is unambiguous',()=>{
 assert.equal(rangeStatus('13.2','12-16 g/dL'),'normal');
 assert.equal(rangeStatus('17','12-16 g/dL'),'high');
 assert.equal(rangeStatus('9','12-16 g/dL'),'low');
 assert.equal(rangeStatus('<10','12-16 g/dL'),'low');
 assert.equal(rangeStatus('13','not provided'),'unknown');
});
