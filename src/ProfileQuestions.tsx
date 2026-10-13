import React from 'react';
import {Text,View} from 'react-native';
import {CheckRow,Label,Pill,styles} from './ui';
import {goalOptions,UserProfile} from './userProfile';

export function UnitPreferences({value,onChange}:{value:UserProfile;onChange:(value:UserProfile)=>void}){
 return <View style={{gap:12}}><Label>Preferred units</Label><View style={styles.wrap}>{(['kg','lb'] as const).map(unit=><Pill key={unit} label={unit==='kg'?'Kilograms (kg)':'Pounds (lb)'} active={value.weightUnit===unit} onPress={()=>onChange({...value,weightUnit:unit})}/>)}</View><View style={styles.wrap}>{(['m','in'] as const).map(unit=><Pill key={unit} label={unit==='m'?'Meters (m)':'Inches (in)'} active={value.heightUnit===unit} onPress={()=>onChange({...value,heightUnit:unit})}/>)}</View></View>;
}
export function ProfileQuestions({value,onChange}:{value:UserProfile;onChange:(value:UserProfile)=>void}){
 return <View style={{gap:16}}><Text style={styles.h2}>What brings you to Folio?</Text><Text style={styles.muted}>Choose one or more goals.</Text>{(Object.keys(goalOptions) as Array<keyof typeof goalOptions>).map(goal=><CheckRow key={goal} label={goalOptions[goal]} checked={value.goals.includes(goal)} onChange={()=>onChange({...value,goals:value.goals.includes(goal)?value.goals.filter(g=>g!==goal):[...value.goals,goal]})}/>)}<Text style={styles.h2}>Would you like AI help?</Text><Text style={styles.muted}>Show short AI explanations and comparisons of your reports. You can change this anytime. This controls optional insights; document digitization uses the configured extraction service.</Text><View style={styles.wrap}><Pill label="Yes, show AI insights" active={value.aiHelp===true} onPress={()=>onChange({...value,aiHelp:true})}/><Pill label="No, keep insights hidden" active={value.aiHelp===false} onPress={()=>onChange({...value,aiHelp:false})}/></View></View>;
}
