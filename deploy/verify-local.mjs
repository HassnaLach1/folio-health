// Explicit fictional integration test for the isolated fresh deployment stack.
// Never points at production or the user's existing local account workspace.
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {randomUUID,createHmac,createHash} from 'node:crypto';
import {PDFDocument,StandardFonts} from 'pdf-lib';
const url='http://127.0.0.1:18081/api';
if(!process.env.ANON_KEY||!process.env.SERVICE_ROLE_KEY)throw new Error('Load the isolated deployment test environment.');
const admin=createClient(url,process.env.SERVICE_ROLE_KEY,{auth:{persistSession:false}}),app=createClient(url,process.env.ANON_KEY,{auth:{persistSession:false}});
const checked=({data,error})=>{if(error)throw new Error(error.message);return data;};
function totp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const ch of secret.replace(/=+$/,''))bits+=alphabet.indexOf(ch).toString(2).padStart(5,'0');const bytes=Buffer.from(bits.match(/.{8}/g).map(v=>parseInt(v,2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',bytes).update(counter).digest(),offset=hash.at(-1)&15;return ((hash.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');}
let userId,objectKey;
try{
 assert.equal((await fetch(url+'/pg/')).status,404,'Admin routes must be inaccessible.');
 assert.equal((await fetch(url+'/auth/v1/settings',{headers:{Origin:'https://unrelated.example'}})).status,403,'Foreign browser origins must be rejected.');
 assert.ok((await app.rpc('get_snapshot')).error,'Anonymous users cannot read the workspace.');
 const email=`folio-deploytest-${randomUUID()}@example.test`,password=`Synthetic-${randomUUID()}`;
 userId=checked(await admin.auth.admin.createUser({email,password,email_confirm:true})).user.id;
 checked(await app.auth.signInWithPassword({email,password}));
 assert.ok((await app.rpc('get_snapshot')).error,'Production records require the authenticator step.');
 const factor=checked(await app.auth.mfa.enroll({factorType:'totp'}));
 checked(await app.auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(factor.totp.secret)}));
 assert.equal(checked(await app.rpc('get_snapshot')).documents.length,0);
 const profile={firstName:'Fictional',lastName:'Test',birthDate:'1990-01-02',photoPath:null,weightKg:70,heightMeters:null,weightUnit:'lb',heightUnit:'m',goals:['compare'],aiHelp:false,onboardingCompleted:true};
 checked(await app.rpc('save_profile',{item:profile}));
 assert.deepEqual(checked(await app.rpc('get_profile')),profile);
 assert.equal(checked(await app.rpc('get_snapshot')).preferences.showAiInterpretation,false);
 const pdf=await PDFDocument.create(),page=pdf.addPage([595,842]);
 page.drawText('SYNTHETIC CBC REPORT\nExamination date: 2026-10-13\nHemoglobin | 12.8 | g/dL | 12 - 16',{x:30,y:770,size:16,lineHeight:28,font:await pdf.embedFont(StandardFonts.Helvetica)});
 const bytes=Buffer.from(await pdf.save()),id=randomUUID();
 checked(await app.rpc('begin_upload',{doc:{id,title:'Fictional deployment test',filename:'synthetic.pdf',category:'Other',pages:1,bytes:bytes.length,mime:'application/pdf',checksum:createHash('sha256').update(bytes).digest('hex')}}));
 objectKey=`${userId}/${id}/original`;
 checked(await app.storage.from('medical-documents').upload(objectKey,bytes,{contentType:'application/pdf'}));
 checked(await app.rpc('finish_upload',{doc_id:id}));
 let result;
 for(let i=0;i<45;i++){result=checked(await app.rpc('get_snapshot'));const document=result.documents.find(d=>d.id===id);if(document?.status==='review')break;if(document?.status==='failed')throw new Error('Fictional extraction failed');await new Promise(resolve=>setTimeout(resolve,1000));}
 assert.equal(result.documents.find(d=>d.id===id)?.status,'review');
 assert.ok(result.reports.find(r=>r.documentId===id)?.observations.some(o=>o.parameter==='hemoglobin'&&o.value==='12.8'));
 console.log('Fresh deployment PASS: private routes, origin check, anonymous denial, MFA, onboarding persistence, upload, local worker, and needs-review results.');
}finally{
 if(objectKey)checked(await admin.storage.from('medical-documents').remove([objectKey]));
 if(userId)checked(await admin.auth.admin.deleteUser(userId));
}
