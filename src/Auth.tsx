import React, { useEffect, useState } from 'react';
import { View, Text, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { LockKeyhole, ShieldCheck } from 'lucide-react-native';
import { supabase } from './backend';
import { Button, Field, colors, styles } from './ui';

export default function Auth({ onReady }: { onReady: () => void }) {
 const [recovery,setRecovery]=useState(false);
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[code,setCode]=useState(''),[secret,setSecret]=useState(''),[factor,setFactor]=useState(''),[step,setStep]=useState<'login'|'totp'|'reset'>('login'),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function afterPassword(recoveryFlow=false){setRecovery(recoveryFlow);const s=supabase!;const {data,error}=await s.auth.mfa.getAuthenticatorAssuranceLevel();if(error)throw error;if(data.currentLevel==='aal2'){if(recoveryFlow)setStep('reset');else onReady();return;}const factors=await s.auth.mfa.listFactors();if(factors.error)throw factors.error;const existing=factors.data.totp.find(f=>f.status==='verified');if(existing)setFactor(existing.id);else{for(const f of factors.data.all.filter(f=>f.status==='unverified'))await s.auth.mfa.unenroll({factorId:f.id});const enrollment=await s.auth.mfa.enroll({factorType:'totp',friendlyName:'Folio authenticator'});if(enrollment.error)throw enrollment.error;setFactor(enrollment.data.id);setSecret(enrollment.data.totp.secret);}setStep('totp');}
 async function run(fn:()=>Promise<void>){setBusy(true);setMessage('');try{await fn();}catch(e){setMessage(e instanceof Error?e.message:'Authentication failed.');}finally{setBusy(false);}}
 useEffect(()=>{
  let cancelled=false;
  const handle=async(url:string)=>{
   const fragment=url.split('#')[1];if(!fragment)return false;
   const p=new URLSearchParams(fragment);if(!p.get('access_token')||!p.get('refresh_token'))return false;
   const {error}=await supabase!.auth.setSession({access_token:p.get('access_token')!,refresh_token:p.get('refresh_token')!});
   if(Platform.OS==='web')window.history.replaceState(null,'',window.location.pathname+window.location.search);
   if(cancelled)return true;if(error){setMessage(error.message);return true;}
   await run(()=>afterPassword(p.get('type')==='recovery'));return true;
  };
  void (async()=>{const url=await Linking.getInitialURL();if(url&&await handle(url))return;const {data}=await supabase!.auth.getSession();if(!cancelled&&data.session)await run(()=>afterPassword());})();
  const listener=Linking.addEventListener('url',e=>void handle(e.url).catch(()=>setMessage('This sign-in link could not be used. Request a new link.')));
  return()=>{cancelled=true;listener.remove();};
 },[]);
 return <View style={{flex:1,backgroundColor:colors.bg,alignItems:'center',justifyContent:'center',padding:24}}><View style={[styles.card,{width:'100%',maxWidth:440,gap:20,padding:32}]}><ShieldCheck size={34} color={colors.teal}/><Text style={styles.title}>Welcome to Folio.</Text><Text style={styles.muted}>A private place for your medical documents.</Text>{step==='login'?<><Field label="Email address" value={email} onChange={setEmail}/><Field label="Password (at least 12 characters)" value={password} onChange={setPassword} secure/><Button label={busy?'Signing in…':'Sign in'} disabled={busy} icon={LockKeyhole} onPress={()=>void run(async()=>{const {error}=await supabase!.auth.signInWithPassword({email,password});if(error)throw error;await afterPassword();})}/><Button label="Create an account" secondary disabled={busy} onPress={()=>void run(async()=>{if(password.length<12)throw new Error('Use at least 12 characters.');const {error}=await supabase!.auth.signUp({email,password,options:{emailRedirectTo:Linking.createURL('/')}});if(error)throw error;setMessage('Check your email to confirm your account, then sign in.');})}/><Button label="Reset password" secondary disabled={busy} onPress={()=>void run(async()=>{const {error}=await supabase!.auth.resetPasswordForEmail(email,{redirectTo:Linking.createURL('/')});if(error)throw error;setMessage('If this account exists, a reset link has been sent. Your authenticator is still required.');})}/></>:step==='reset'?<><Field label="New password" value={password} onChange={setPassword} secure/><Button label="Update password" disabled={busy} onPress={()=>void run(async()=>{if(password.length<12)throw new Error('Use at least 12 characters.');const {error}=await supabase!.auth.updateUser({password});if(error)throw error;await afterPassword();})}/></>:<><Text style={styles.h2}>{secret?'Set up your authenticator':'Enter your authenticator code'}</Text>{!!secret&&<><Text style={styles.muted}>Add a time-based account in your authenticator using this secret. Keep a secure backup of the authenticator before continuing.</Text><Text selectable style={[styles.input,{fontFamily:'monospace'}]}>{secret}</Text></>}<Field label="Six-digit authenticator code" value={code} onChange={setCode}/><Button label={busy?'Checking…':'Unlock my records'} disabled={busy||code.length!==6} onPress={()=>void run(async()=>{const {error}=await supabase!.auth.mfa.challengeAndVerify({factorId:factor,code});if(error)throw error;setSecret('');if(recovery)setStep('reset');else onReady();})}/><Text style={[styles.muted,{fontSize:11}]}>Medical records remain locked until this step is complete. Password reset does not bypass your authenticator.</Text></>}{!!message&&<Text accessibilityRole="alert" style={[styles.muted,{color:colors.amber}]}>{message}</Text>}</View></View>;
}

