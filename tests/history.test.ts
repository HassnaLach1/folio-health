import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHistoryRequest } from '../worker/imaging';
import { uuid } from '../src/domain';

test('history requests compare conclusions only and give lab summaries checked ranges',()=>{
 const reports=[1,2,3].map(index=>({date:`2026-10-0${index}`,panel:'Chest CT',bodyRegion:'Chest',conclusion:`Source conclusion ${index}`,findings:'Must never be sent',observations:[]}));
 const imaging=JSON.parse(buildHistoryRequest('imaging',reports));
 assert.ok(!imaging.messages[0].content[0].text.includes('Must never be sent'));
 assert.equal(JSON.parse(imaging.messages[0].content[0].text).length,3);
 const observation={id:uuid(),label:'Glucose',parameter:'glucose',value:'99',unit:'mg/dL',range:'inférieur à 100',source:'Source row',page:1,review:{value:'reviewed',unit:'reviewed',range:'reviewed'}};
 const lab=JSON.parse(buildHistoryRequest('lab',reports.slice(0,2).map(r=>({...r,panel:'Glucose',observations:[observation]}))));
 assert.equal(JSON.parse(lab.messages[0].content[0].text)[0].observations[0].rangeStatus,'normal');
 assert.match(lab.system,/Never infer a diagnosis/);
});
