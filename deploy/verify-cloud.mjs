// Explicit deployed-stack check. Creates and removes only its own fictional data.
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {createHmac,randomUUID,createHash} from 'node:crypto';
import {PDFDocument,StandardFonts} from 'pdf-lib';
const url=process.env.FOLIO_PUBLIC_URL;
if(process.env.FOLIO_CLOUD_SMOKE!=='fictional-only'||!url?.startsWith('https://')||!process.env.TEST_JWT_SECRET||!process.env.ANON_KEY||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('Explicit fictional cloud-test configuration is required.');
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const checked=({data,error})=>{if(error)throw new Error(error.message);return data;};
let userId,objectKey;
function client(aal){const now=Math.floor(Date.now()/1000),header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),payload=Buffer.from(JSON.stringify({sub:userId,role:'authenticated',aud:'authenticated',iss:'supabase',iat:now,exp:now+900,aal})).toString('base64url'),unsigned=header+'.'+payload,token=unsigned+'.'+createHmac('sha256',process.env.TEST_JWT_SECRET).update(unsigned).digest('base64url');return createClient(url,process.env.ANON_KEY,{auth:{persistSession:false},global:{headers:{Authorization:'Bearer '+token}}});}
try{
 assert.equal((await fetch(url+'/pg/')).status,404);
 assert.equal((await fetch(url+'/auth/v1/settings',{headers:{Origin:'https://unrelated.example'}})).status,403);
 const settings=await fetch(url+'/auth/v1/settings',{headers:{apikey:process.env.ANON_KEY}});
 assert.ok(settings.ok);assert.equal((await settings.json()).external.google,true);
 const anonymous=createClient(url,process.env.ANON_KEY,{auth:{persistSession:false}});
 assert.ok((await anonymous.rpc('get_snapshot')).error);
 userId=checked(await admin.auth.admin.createUser({email:`folio-cloud-test-${randomUUID()}@example.test`,email_confirm:true})).user.id;
 assert.ok((await client('aal1').rpc('get_snapshot')).error);
 const app=client('aal2');assert.equal(checked(await app.rpc('get_snapshot')).documents.length,0);
 const profile={firstName:'Fictional',lastName:'Test',birthDate:'1990-01-02',photoPath:null,weightKg:70,heightMeters:null,weightUnit:'kg',heightUnit:'m',goals:['compare'],aiHelp:false,onboardingCompleted:true};
 checked(await app.rpc('save_profile',{item:profile}));assert.deepEqual(checked(await app.rpc('get_profile')),profile);
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
 const pages=[['FICTIONAL LABORATORY REPORT','Collection date: 2026-10-13','Kidney Function Panel','Creatinine | 1.2 | mg/dL | 0.6 - 1.1','This panel continues on the next page.'],['Kidney Function Panel - continued','Collection date: 2026-10-13','Urea | 5.0 | mmol/L | 2.5 - 7.5'],['Liver Function Panel','Collection date: 2026-10-13','ALT | 22 | U/L | 7 - 56','AST | 25 | U/L | 10 - 40']];
 for(const lines of pages){const page=pdf.addPage([595,842]);lines.forEach((text,i)=>page.drawText(text,{x:35,y:790-i*40,size:15,font}));}
 const bytes=Buffer.from(await pdf.save()),id=randomUUID();
 checked(await app.rpc('begin_upload',{doc:{id,title:'Fictional cloud test',filename:'synthetic-panels.pdf',category:'Other',pages:3,bytes:bytes.length,mime:'application/pdf',checksum:createHash('sha256').update(bytes).digest('hex')}}));
 objectKey=`${userId}/${id}/original`;checked(await app.storage.from('medical-documents').upload(objectKey,bytes,{contentType:'application/pdf'}));
 const signed=checked(await app.storage.from('medical-documents').createSignedUrl(objectKey,60));
 const original=await fetch(signed.signedUrl);assert.ok(original.ok,'The reviewed original must be reachable over public HTTPS.');
 assert.equal(createHash('sha256').update(Buffer.from(await original.arrayBuffer())).digest('hex'),createHash('sha256').update(bytes).digest('hex'));
 checked(await app.rpc('finish_upload',{doc_id:id}));
 let result;
 for(let i=0;i<180;i++){result=checked(await app.rpc('get_snapshot'));const document=result.documents.find(d=>d.id===id);if(document?.status==='review')break;if(document?.status==='failed')throw new Error('Cloud extraction failed');await new Promise(resolve=>setTimeout(resolve,2000));}
 assert.equal(result.documents.find(d=>d.id===id)?.status,'review');
 const reports=result.reports.filter(r=>r.documentId===id);assert.equal(reports.length,2);
 const kidney=reports.find(r=>r.panelCode==='kidney_function'),liver=reports.find(r=>r.panelCode==='liver_function');assert.ok(kidney);assert.ok(liver);
 assert.deepEqual(kidney.sourcePages,[1,2]);assert.deepEqual(liver.sourcePages,[3]);
 assert.equal(kidney.observations.find(o=>o.parameter==='creatinine')?.value,'1.2');
 assert.ok(reports.every(r=>!r.dateReviewed&&r.observations.every(o=>o.review.value==='pending')));
 const audit=checked(await admin.from('extraction_runs').select('engine').eq('document_id',id));assert.ok(audit.some(r=>r.engine.startsWith('bedrock-')),'Cloud test must use Bedrock, not fallback.');
 console.log('CLOUD_PASS: HTTPS, Google provider, private routes, origin check, MFA policy, onboarding persistence, upload, original download, role-based Haiku, three pages, two panels, needs-review status.');
}finally{
 if(objectKey)checked(await admin.storage.from('medical-documents').remove([objectKey]));
 if(userId)checked(await admin.auth.admin.deleteUser(userId));
}
