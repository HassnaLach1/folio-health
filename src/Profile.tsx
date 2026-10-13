import React, {useEffect,useRef,useState} from 'react';
import {Image,Platform,Text,View} from 'react-native';
import {UserRound} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import {File} from 'expo-file-system';
import {Button,Busy,Field,Sheet,colors,styles} from './ui';
import {loadProfile,saveProfile,profilePhotoUrl,uploadProfilePhoto,deleteProfilePhoto} from './backend';
import {UserProfile,emptyProfile,profileSchema,onboardingError} from './userProfile';
import {ProfileQuestions,UnitPreferences} from './ProfileQuestions';
import {BirthDatePicker,MeasurementPicker} from './ProfilePickers';

export default function Profile({onClose,onSaved}:{onClose:()=>void;onSaved:()=>void}){
 const [draft,setDraft]=useState<UserProfile>({...emptyProfile}),[loading,setLoading]=useState(true),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[photo,setPhoto]=useState('');
 const originalPhoto=useRef<string|null>(null),pendingPhotos=useRef<string[]>([]),committed=useRef(false);
 useEffect(()=>{
  let active=true;
  void (async()=>{try{const value=await loadProfile();if(!active)return;setDraft(value);setLoaded(true);originalPhoto.current=value.photoPath;
   if(value.photoPath){const url=await profilePhotoUrl(value.photoPath);if(active)setPhoto(url);}
  }catch(e){if(active)setError(e instanceof Error?e.message:'Could not load your profile.');}finally{if(active)setLoading(false);}})();
  return()=>{active=false;for(const path of pendingPhotos.current)if(!committed.current)void deleteProfilePhoto(path).catch(()=>{});};
 },[]);
 async function pickPhoto(){setBusy(true);setError('');try{
  if(Platform.OS!=='web'){const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();if(!permission.granted)throw new Error('Allow photo access to choose your profile image.');}
  const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:true,aspect:[1,1],quality:0.85});
  if(result.canceled)return;
  const asset=result.assets[0]!;
  const bytes=Platform.OS==='web'?new Uint8Array(await(await fetch(asset.uri)).arrayBuffer()):await new File(asset.uri).bytes();
  const path=await uploadProfilePhoto(bytes,asset.mimeType||'image/jpeg');pendingPhotos.current.push(path);
  setDraft(previous=>({...previous,photoPath:path}));setPhoto(asset.uri);
 }catch(e){setError(e instanceof Error?e.message:'Could not save photo.');}finally{setBusy(false);}}
 async function save(){setBusy(true);setError('');try{
  if(draft.onboardingCompleted){const problem=onboardingError(draft);if(problem)throw new Error(problem);}
  const result=profileSchema.safeParse(draft);
  if(!result.success)throw new Error(result.error.issues[0]?.message||'Check your profile fields.');
  await saveProfile(result.data);committed.current=true;
  const obsolete=[originalPhoto.current,...pendingPhotos.current].filter((path):path is string=>!!path&&path!==result.data.photoPath);
  for(const path of obsolete)void deleteProfilePhoto(path).catch(()=>{});
  onSaved();onClose();
 }catch(e){setError(e instanceof Error?e.message:'Could not save your profile.');}finally{setBusy(false);}}
 return <Sheet visible title="Your profile" subtitle="Your personal details · private to your account" onClose={()=>{if(!busy)onClose();}}>{loading?<Busy/>:<>
  <View style={{alignItems:'center',gap:12}}>{photo?<Image accessibilityLabel="Profile photo" source={{uri:photo}} style={{width:88,height:88,borderRadius:44}}/>:<View style={{width:88,height:88,borderRadius:44,backgroundColor:colors.light,alignItems:'center',justifyContent:'center'}}><UserRound size={38} color={colors.teal}/></View>}<View style={styles.wrap}><Button label={photo?'Change photo':'Choose photo'} secondary small disabled={busy} onPress={()=>void pickPhoto()}/>{photo&&<Button label="Remove photo" secondary small disabled={busy} onPress={()=>{setPhoto('');setDraft(previous=>({...previous,photoPath:null}));}}/>}</View><Text style={styles.muted}>JPEG or PNG · up to 5 MB</Text></View>
  <Field label="First name" value={draft.firstName} onChange={firstName=>setDraft({...draft,firstName})}/>
  <Field label="Last name" value={draft.lastName} onChange={lastName=>setDraft({...draft,lastName})}/>
  <BirthDatePicker value={draft.birthDate} onChange={birthDate=>setDraft({...draft,birthDate})}/>
  <MeasurementPicker kind="weight" preferredUnit={draft.weightUnit} onUnitChange={unit=>setDraft(p=>({...p,weightUnit:unit as 'kg'|'lb'}))} value={draft.weightKg} onChange={weightKg=>setDraft(p=>({...p,weightKg}))}/>
  <MeasurementPicker kind="height" preferredUnit={draft.heightUnit} onUnitChange={unit=>setDraft(p=>({...p,heightUnit:unit as 'm'|'in'}))} value={draft.heightMeters} onChange={heightMeters=>setDraft(p=>({...p,heightMeters}))}/>
  <UnitPreferences value={draft} onChange={setDraft}/><ProfileQuestions value={draft} onChange={setDraft}/>
  <Text style={styles.muted}>Scroll to select your details. Both unit equivalents are shown after selection. Height and photo are optional.</Text>
  {!!error&&<Text accessibilityRole="alert" style={{color:colors.red}}>{error}</Text>}
  <Button label={busy?'Saving…':'Save profile'} disabled={busy||!loaded} onPress={()=>void save()}/>
 </>}</Sheet>;
}
