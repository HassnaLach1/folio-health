import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { extractCandidates } from '../src/domain';
import { bedrock, bedrockClient, defaultModelId } from './bedrock';
import type { SourceImage } from './render';
import { compareImaging, summarizeHistory } from './imaging';

const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the worker environment.');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const check=(e:{message:string}|null)=>{if(e)throw new Error('Database operation failed');};
async function local(bytes:Uint8Array,mime:string):Promise<string>{
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--max-old-space-size=384','--import','tsx','worker/process.ts'],{stdio:['pipe','pipe','ignore'],env:{NODE_ENV:'production',PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP}});
  let out='';const timer=setTimeout(()=>{child.kill();reject(new Error('Extraction timed out. Try fewer pages or manual entry.'));},480000);
  child.stdout.on('data',chunk=>{out+=chunk.toString();if(out.length>2000000){child.kill();reject(new Error('Extracted text limit exceeded.'));}});
  child.on('error',()=>{clearTimeout(timer);reject(new Error('Could not start OCR process.'));});
  child.on('close',()=>{clearTimeout(timer);try{const result=JSON.parse(out);if(result.error)reject(new Error(result.error));else resolve(result.text);}catch{reject(new Error('Local OCR failed. The original remains available.'));}});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({bytes:Buffer.from(bytes).toString('base64'),mime}));
 });
}
async function render(bytes:Uint8Array,mime:string,startPage:number,count:number):Promise<SourceImage[]>{
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--max-old-space-size=384','--import','tsx','worker/render.ts'],{stdio:['pipe','pipe','ignore'],env:{NODE_ENV:'production',PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP}});
  let out='';const timer=setTimeout(()=>{child.kill();reject(new Error('Page rendering timed out.'));},480000);
  child.stdout.on('data',chunk=>{out+=chunk.toString();if(out.length>45000000){child.kill();reject(new Error('Rendered pages exceeded the batch limit.'));}});
  child.on('error',()=>{clearTimeout(timer);reject(new Error('Could not start page renderer.'));});
  child.on('close',()=>{clearTimeout(timer);try{const result=JSON.parse(out);if(result.error)reject(new Error(result.error));else resolve(result.images);}catch{reject(new Error('Could not prepare document pages.'));}});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({bytes:Buffer.from(bytes).toString('base64'),mime,startPage,count}));
 });
}
async function azure(bytes:Uint8Array,mime:string):Promise<string>{
 const endpoint=process.env.AZURE_DOCUMENT_ENDPOINT!.replace(/\/$/,'');const key=process.env.AZURE_DOCUMENT_KEY!;
 const response=await fetch(endpoint+'/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=2024-11-30',{method:'POST',headers:{'Ocp-Apim-Subscription-Key':key,'Content-Type':mime},body:bytes as unknown as BodyInit,signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error('OCR provider rejected the request.');const operation=response.headers.get('operation-location');
 if(!operation||new URL(operation).origin!==new URL(endpoint).origin)throw new Error('Invalid OCR operation address.');
 try{for(let attempt=0;attempt<90;attempt++){await wait(2000);const result=await fetch(operation,{headers:{'Ocp-Apim-Subscription-Key':key},signal:AbortSignal.timeout(30000)});if(!result.ok)throw new Error('OCR provider unavailable.');const payload=await result.json();if(payload.status==='failed')throw new Error('OCR provider could not read this document.');if(payload.status==='succeeded'){const pages=payload.analyzeResult.pages??[];if(pages.length>50)throw new Error('Page limit exceeded.');return pages.map((p:any)=>(p.lines??[]).map((line:any)=>line.content).join('\n')).join('\f');}}throw new Error('OCR provider timed out.');}
 finally {await fetch(operation,{method:'DELETE',headers:{'Ocp-Apim-Subscription-Key':key},signal:AbortSignal.timeout(15000)}).catch(()=>{});}
}
function signature(bytes:Uint8Array,mime:string){const b=Buffer.from(bytes);return mime==='application/pdf'?b.subarray(0,5).toString()==='%PDF-':mime==='image/png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:false;}
async function tick(){
 const {data:historyJob,error:historyError}=await db.rpc('claim_history_conclusion');check(historyError);
 if(historyJob){
  let result:string|null=null;
  try{if(process.env.EXTRACTION_ENGINE!=='bedrock')throw new Error('Bedrock is unavailable');result=await summarizeHistory(historyJob.mode,historyJob.reports);}catch{console.warn('History conclusion unavailable; source records remain available.');}
  const {error}=await db.rpc('complete_history_conclusion',{comparison_id:historyJob.id,token:historyJob.token,result});check(error);return true;
 }
 const {data:comparisonJob,error:comparisonError}=await db.rpc('claim_imaging_comparison');check(comparisonError);
 if(comparisonJob){
  let result:string|null=null;
  try{if(process.env.EXTRACTION_ENGINE!=='bedrock')throw new Error('Bedrock is unavailable');result=await compareImaging(comparisonJob.reports);}catch{console.warn('Imaging comparison unavailable; source reports remain available.');}
  const {error}=await db.rpc('complete_imaging_comparison',{comparison_id:comparisonJob.id,token:comparisonJob.token,result});check(error);return true;
 }
 const {data:job,error}=await db.rpc('claim_job');check(error);if(!job)return false;
 try{
  const doc=job.document;if(!doc)throw new Error('Document unavailable.');
  if(job.kind==='delete'){
   const {error:removeError}=await db.storage.from('medical-documents').remove([doc.object_key]);check(removeError);
   const {error:deleteError}=await db.from('documents').delete().eq('id',doc.id).eq('owner_id',doc.owner_id).eq('status','deleting');check(deleteError);return true;
  }
  const {data:file,error:downloadError}=await db.storage.from('medical-documents').download(doc.object_key);check(downloadError);if(!file)throw new Error('Uploaded file missing.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes.length!==doc.bytes||bytes.length>26214400||createHash('sha256').update(bytes).digest('hex')!==doc.checksum)throw new Error('File integrity check failed. Please upload again.');
  if(!signature(bytes,doc.mime))throw new Error('Unsupported or corrupted file signature.');
  // Original becomes retrievable even if subsequent OCR fails.
  const {error:verifyError}=await db.from('documents').update({storage_verified:true}).eq('id',doc.id).neq('status','deleting');check(verifyError);
  const engine=process.env.EXTRACTION_ENGINE||'local';
  if(!['local','bedrock','azure'].includes(engine))throw new Error('Invalid EXTRACTION_ENGINE.');
  let text='', candidates, metadata: {title?:string;category?:string;structuredOutput?:unknown}={};
  let engineName='local-pdfjs-tesseract-6';
  if(engine==='bedrock'){
   try{
    const images=await render(bytes,doc.mime,1,doc.pages);
    const result=await bedrock(images,doc.id,doc.pages);
    metadata={title:result.title,category:result.category,structuredOutput:result.structuredOutput};
    candidates=result.reports;
    engineName=`bedrock-${process.env.AWS_BEDROCK_MODEL_ID||defaultModelId}`;
   }catch(error){if((process.env.EXTRACTION_FALLBACK||'local')!=='local')throw error;console.warn(`Bedrock extraction failed (${error instanceof Error?error.name:'UnknownError'}); using local extraction.`);metadata={};}
  }
  if(!candidates){
   text=engine==='azure'?await azure(bytes,doc.mime):await local(bytes,doc.mime);
   if(text.length>1500000)throw new Error('Text limit exceeded.');
   candidates=extractCandidates(text,doc.id);
   engineName=engine==='azure'?'azure-layout-2024-11-30':'local-pdfjs-tesseract-6';
  }
  const {error:publishError}=await db.rpc('complete_extraction',{job_id:job.id,token:job.lease_token,source_text:text,candidates,engine_name:engineName,document_metadata:metadata});check(publishError);
 }catch(e){
  const safe=e instanceof Error?e.message:'Processing failed.';
  await db.rpc('fail_job',{job_id:job.id,token:job.lease_token,error_message:safe});
  console.warn('Processing job failed; details are stored in the private job record.');
 }
 return true;
}
async function main(){
 if(process.env.EXTRACTION_ENGINE==='bedrock'&&!process.env.AWS_BEARER_TOKEN_BEDROCK){
  const client=bedrockClient(process.env.AWS_REGION||'eu-west-1');
  try{await client.config.credentials();}catch{console.error('Configure AWS credentials or AWS_BEARER_TOKEN_BEDROCK before starting Bedrock mode.');process.exitCode=1;return;}finally{client.destroy();}
 }
 console.log(`Folio worker ready. Engine: ${process.env.EXTRACTION_ENGINE||'local'}. Document contents are excluded from logs.`);
 while(true){try{if(!await tick())await wait(3000);}catch{console.warn('Worker connection failed; retrying.');await wait(5000);}}
}
void main();

