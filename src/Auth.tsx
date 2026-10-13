import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Platform, ScrollView } from 'react-native';
import * as Linking from 'expo-linking';
import { LockKeyhole, ShieldCheck } from 'lucide-react-native';
import { supabase, googleSignInAvailable } from './backend';
import {readAuthCallback} from './authCallback';
import { Button, Field, colors, styles } from './ui';

export default function Auth({ onReady }: { onReady: () => void }) {
 const [recovery,setRecovery]=useState(false),[googleAvailable,setGoogleAvailable]=useState<boolean|null>(null),[creating,setCreating]=useState(false);
 const callbacks=useRef(new Set<string>()),recoveryCallback=useRef(false);
 const redirect=()=>Platform.OS==='web'?window.location.origin+'/':'foliohealth://auth/callback';
 useEffect(()=>{let active=true;void googleSignInAvailable().then(enabled=>{if(active)setGoogleAvailable(enabled);}).catch(()=>{if(active)setGoogleAvailable(false);});return()=>{active=false;};},[]);
 async function googleLogin(){const {data,error}=await supabase!.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirect(),skipBrowserRedirect:Platform.OS!=='web',scopes:'openid email profile',queryParams:{prompt:'select_account'}}});if(error)throw error;if(Platform.OS!=='web'&&data.url){await Linking.openURL(data.url);setMessage('Finish signing in with Google in your browser, then return to Folio.');}}
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[code,setCode]=useState(''),[secret,setSecret]=useState(''),[factor,setFactor]=useState(''),[step,setStep]=useState<'login'|'totp'|'reset'>('login'),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function afterPassword(recoveryFlow=false){setRecovery(recoveryFlow);if(process.env.EXPO_PUBLIC_REQUIRE_MFA==='false'){if(recoveryFlow)setStep('reset');else onReady();return;}const s=supabase!;const {data,error}=await s.auth.mfa.getAuthenticatorAssuranceLevel();if(error)throw error;if(data.currentLevel==='aal2'){if(recoveryFlow)setStep('reset');else onReady();return;}const factors=await s.auth.mfa.listFactors();if(factors.error)throw factors.error;const existing=factors.data.totp.find(f=>f.status==='verified');if(existing)setFactor(existing.id);else{for(const f of factors.data.all.filter(f=>f.status==='unverified'))await s.auth.mfa.unenroll({factorId:f.id});const enrollment=await s.auth.mfa.enroll({factorType:'totp',friendlyName:'Folio authenticator'});if(enrollment.error)throw enrollment.error;setFactor(enrollment.data.id);setSecret(enrollment.data.totp.secret);}setStep('totp');}
 async function run(fn:()=>Promise<void>){setBusy(true);setMessage('');try{await fn();}catch(e){setMessage(e instanceof Error?e.message:'Authentication failed.');}finally{setBusy(false);}}
 useEffect(()=>{
  let cancelled=false;
  const {data:{subscription}}=supabase!.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')recoveryCallback.current=true;});
  const handle=async(url:string)=>{
   const callback=readAuthCallback(url,Platform.OS==='web'?window.location.origin:undefined);if(!callback)return false;
   if(callbacks.current.has(url))return true;callbacks.current.add(url);
   if(Platform.OS==='web')window.history.replaceState(null,'',window.location.pathname);
   if(callback.kind==='error'){setMessage('Google sign-in was canceled or could not finish. Please try again.');return true;}
   if(callback.kind==='code'){
    recoveryCallback.current=false;const {error}=await supabase!.auth.exchangeCodeForSession(callback.code,callback.flowId?{flowId:callback.flowId}:undefined);if(error)throw error;
    if(!cancelled)await run(()=>afterPassword(recoveryCallback.current));
   }else{
    const {error}=await supabase!.auth.setSession({access_token:callback.accessToken,refresh_token:callback.refreshToken});if(error)throw error;
    if(!cancelled)await run(()=>afterPassword(callback.recovery));
   }
   return true;
  };
  void (async()=>{const url=await Linking.getInitialURL();if(url&&await handle(url))return;const {data}=await supabase!.auth.getSession();if(!cancelled&&data.session)await run(()=>afterPassword());})().catch(()=>{if(!cancelled)setMessage('This sign-in link expired or was opened in a different browser. Please start again here.');});
  const listener=Linking.addEventListener('url',e=>void handle(e.url).catch(()=>setMessage('This sign-in link could not be used. Request a new link.')));
  return()=>{cancelled=true;listener.remove();subscription.unsubscribe();};
 },[]);
 return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{flexGrow:1,backgroundColor:colors.bg,alignItems:'center',justifyContent:'center',padding:24}}><View style={[styles.card,{width:'100%',maxWidth:440,gap:20,padding:32}]}><ShieldCheck size={34} color={colors.teal}/><Text style={styles.title}>Welcome to Folio.</Text><Text style={styles.muted}>A private place for your medical documents.</Text>{step==='login'?<><Text style={styles.h2}>{creating?'Create your account':'Sign in to your account'}</Text><Button label="Continue with Google" secondary disabled={busy||googleAvailable!==true} onPress={()=>void run(googleLogin)}/><Text style={[styles.muted,{fontSize:12}]}>{googleAvailable===null?'Checking Google sign-in…':googleAvailable?'Your first Google sign-in creates your Folio account.':'Google sign-in is awaiting setup. You can use email below.'}</Text><Text style={[styles.muted,{textAlign:'center'}]}>or continue with email</Text><Field label="Email address" value={email} onChange={setEmail}/><Field label="Password (at least 12 characters)" value={password} onChange={setPassword} secure/><Button label={busy?'Please wait…':creating?'Create account':'Sign in'} disabled={busy} icon={LockKeyhole} onPress={()=>void run(async()=>{
 if(creating){if(password.length<12)throw new Error('Use at least 12 characters.');const {data,error}=await supabase!.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:redirect()}});if(error)throw error;if(data.session)await afterPassword();else setMessage('Check your email to confirm your account. Open the link in this same browser or device.');}
 else{const {error}=await supabase!.auth.signInWithPassword({email:email.trim(),password});if(error)throw error;await afterPassword();}
 })}/><Button label={creating?'Already have an account? Sign in':'Create an account'} secondary disabled={busy} onPress={()=>{setCreating(!creating);setMessage('');}}/>{!creating&&<Button label="Reset password" secondary disabled={busy} onPress={()=>void run(async()=>{const {error}=await supabase!.auth.resetPasswordForEmail(email.trim(),{redirectTo:redirect()});if(error)throw error;setMessage('If this account exists, a reset link has been sent. Open it in this same browser or device.');})}/>}</>:step==='reset'?<><Field label="New password" value={password} onChange={setPassword} secure/><Button label="Update password" disabled={busy} onPress={()=>void run(async()=>{if(password.length<12)throw new Error('Use at least 12 characters.');const {error}=await supabase!.auth.updateUser({password});if(error)throw error;await afterPassword();})}/></>:<><Text style={styles.h2}>{secret?'Set up your authenticator':'Enter your authenticator code'}</Text>{!!secret&&<><Text style={styles.muted}>Add a time-based account in your authenticator using this secret. Keep a secure backup of the authenticator before continuing.</Text><Text selectable style={[styles.input,{fontFamily:'monospace'}]}>{secret}</Text></>}<Field label="Six-digit authenticator code" value={code} onChange={setCode}/><Button label={busy?'Checking…':'Unlock my records'} disabled={busy||code.length!==6} onPress={()=>void run(async()=>{const {error}=await supabase!.auth.mfa.challengeAndVerify({factorId:factor,code});if(error)throw error;setSecret('');if(recovery)setStep('reset');else onReady();})}/><Text style={[styles.muted,{fontSize:11}]}>Medical records remain locked until this step is complete. Password reset does not bypass your authenticator.</Text></>}{!!message&&<Text accessibilityRole="alert" style={[styles.muted,{color:colors.amber}]}>{message}</Text>}</View></ScrollView>;
}

