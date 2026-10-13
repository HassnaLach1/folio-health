// Explicit provider test with fictional values; no user records or database writes.
import assert from 'node:assert/strict';
import {summarizeHistory} from './imaging';
import {aiDisclaimer,uuid} from '../src/domain';
async function main(){
 const reports=[11,13,14].map((value,index)=>({date:`2026-10-0${index+1}`,panel:'Complete Blood Count',bodyRegion:'',conclusion:null,
 observations:[{id:uuid(),label:'Hemoglobin',parameter:'hemoglobin',value:String(value),unit:'g/dL',range:'12-16',page:1,source:'Fictional row',review:{value:'reviewed',unit:'reviewed',range:'reviewed'}}]}));
 const summary=await summarizeHistory('lab',reports);
 assert.match(summary,/hemoglobin/i);assert.match(summary,/14/);assert.ok(summary.includes(aiDisclaimer));
 console.info('Fictional three-report history conclusion passed.');console.info(summary);
}
void main().catch(error=>{console.error('Fictional history test failed:',error instanceof Error?`${error.name}: ${error.message.replace(/bedrock-api-key-[A-Za-z0-9+/=_-]+/g,'[REDACTED]')}`:'UnknownError');process.exitCode=1;});
