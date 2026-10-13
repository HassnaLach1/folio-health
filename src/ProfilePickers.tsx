import React,{useEffect,useRef,useState} from 'react';
import {FlatList,Pressable,Text,View} from 'react-native';
import {Button,Label,Sheet,colors,styles} from './ui';
import {dateLabel} from './domain';
import {convertMeasurement} from './userProfile';

const rowHeight=44;
function Wheel({label,values,selected,onChange}:{label:string;values:string[];selected:string;onChange:(value:string)=>void}){
 const ref=useRef<FlatList<string>>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const initialIndex=Math.max(0,values.indexOf(selected));
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 function settle(y:number){const index=Math.max(0,Math.min(values.length-1,Math.round(y/rowHeight)));onChange(values[index]!);}
 return <View style={{flex:1,minWidth:0,gap:8}}><Label>{label}</Label><View style={{height:220,overflow:'hidden',borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:colors.paper}}>
  <View pointerEvents="none" style={{position:'absolute',top:88,height:44,left:0,right:0,backgroundColor:colors.light,borderTopWidth:1,borderBottomWidth:1,borderColor:colors.border}}/>
  <FlatList ref={ref} data={values} keyExtractor={value=>value} initialNumToRender={7} windowSize={5} getItemLayout={(_,index)=>({length:rowHeight,offset:88+index*rowHeight,index})} nestedScrollEnabled showsVerticalScrollIndicator={false} snapToInterval={rowHeight} decelerationRate="fast" onLayout={()=>ref.current?.scrollToOffset({offset:initialIndex*rowHeight,animated:false})} contentContainerStyle={{paddingVertical:88}} scrollEventThrottle={16} onScroll={event=>{const y=event.nativeEvent.contentOffset.y;if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>settle(y),120);}} onMomentumScrollEnd={event=>{if(timer.current)clearTimeout(timer.current);settle(event.nativeEvent.contentOffset.y);}} renderItem={({item:value,index})=><Pressable key={value} accessibilityRole="button" accessibilityLabel={`${label} ${value}`} accessibilityState={{selected:value===selected}} onPress={()=>{if(timer.current)clearTimeout(timer.current);onChange(value);ref.current?.scrollToOffset({offset:index*rowHeight,animated:false});}} style={{height:rowHeight,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:22,fontWeight:value===selected?'600':'400',color:value===selected?colors.teal:colors.muted}}>{value}</Text></Pressable>}
  />
 </View></View>;
}
const numbers=(min:number,max:number)=>Array.from({length:max-min+1},(_,i)=>String(min+i));

export function BirthDatePicker({value,onChange}:{value:string;onChange:(value:string)=>void}){
 const [open,setOpen]=useState(false),[parts,setParts]=useState([1990,1,1]);
 const today=new Date(),currentYear=today.getFullYear();
 const [year,month,day]=parts as [number,number,number];
 const maxMonth=year===currentYear?today.getMonth()+1:12;
 const maxDay=year===currentYear&&month===maxMonth?today.getDate():new Date(year,month,0).getDate();
 function change(index:number,next:string){setParts(previous=>{const copy=[...previous];copy[index]=Number(next);const monthLimit=copy[0]===currentYear?today.getMonth()+1:12;copy[1]=Math.min(copy[1]!,monthLimit);const dayLimit=copy[0]===currentYear&&copy[1]===monthLimit?today.getDate():new Date(copy[0]!,copy[1]!,0).getDate();copy[2]=Math.min(copy[2]!,dayLimit);return copy;});}
 const date=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
 return <View style={{gap:6}}><Label>Date of birth</Label><Button secondary label={value?`Birth date: ${dateLabel(value)}`:'Choose birth date'} onPress={()=>{setParts(value?value.split('-').map(Number):[currentYear-30,1,1]);setOpen(true);}}/>
  <Sheet visible={open} title="Date of birth" subtitle="Scroll the year, month, and day. The highlighted row is selected." onClose={()=>setOpen(false)}>
   <View style={{flexDirection:'row',gap:12}}><Wheel label="Year" values={numbers(Math.min(currentYear-130,year),currentYear).reverse()} selected={String(year)} onChange={v=>change(0,v)}/><Wheel key={`month-${maxMonth}`} label="Month" values={numbers(1,maxMonth)} selected={String(month)} onChange={v=>change(1,v)}/><Wheel key={`day-${maxDay}`} label="Day" values={numbers(1,maxDay)} selected={String(day)} onChange={v=>change(2,v)}/></View>
   <Text style={[styles.h2,{textAlign:'center'}]}>{dateLabel(date)}</Text><Button label="Use birth date" onPress={()=>{onChange(date);setOpen(false);}}/><Button secondary label="Clear birth date" onPress={()=>{onChange('');setOpen(false);}}/>
  </Sheet>
 </View>;
}

export function MeasurementPicker({kind,value,onChange,preferredUnit,onUnitChange}:{kind:'weight'|'height';value:number|null;onChange:(value:number|null)=>void;preferredUnit?:string;onUnitChange?:(unit:string)=>void}){
 const isWeight=kind==='weight',label=isWeight?'Weight':'Height',units=isWeight?['kg','lb']:['m','in'];
 const [open,setOpen]=useState(false),[unit,setUnit]=useState(units[0]!),[canonical,setCanonical]=useState<number>(isWeight?70:1.7);
 const factor=isWeight?0.45359237:0.0254;
 const shown=unit===units[0]?canonical:Number(convertMeasurement(String(canonical),factor,false));
 const precision=unit==='m'?100:10,rounded=Math.round(shown*precision),whole=Math.floor(rounded/precision),fraction=rounded%precision;
 const max=unit==='kg'?1000:unit==='lb'?2204:unit==='m'?3:118;
 function numberChanged(integer:number,decimal:number){const amount=(integer*precision+decimal)/precision;setCanonical(unit===units[0]?amount:Number(convertMeasurement(String(amount),factor,true)));}
 const summary=value===null?'Choose '+kind:isWeight?`${Number(value.toFixed(1))} kg · ${Number(convertMeasurement(String(value),factor,false)).toFixed(1)} lb`:`${Number(value.toFixed(2))} m · ${Number(convertMeasurement(String(value),factor,false)).toFixed(1)} in`;
 return <View style={{gap:6}}><Label>{label}</Label><Button secondary label={summary} onPress={()=>{setCanonical(value??(isWeight?70:1.7));setUnit(preferredUnit??units[0]!);setOpen(true);}}/>
  <Sheet visible={open} title={`Choose ${kind}`} subtitle="Scroll the number, decimal, and unit. The highlighted row is selected." onClose={()=>setOpen(false)}>
   <View style={{flexDirection:'row',gap:12}}><Wheel key={`whole-${unit}`} label="Number" values={numbers(0,max)} selected={String(Math.min(whole,max))} onChange={v=>numberChanged(Number(v),fraction)}/><Wheel key={`decimal-${unit}`} label="Decimal" values={numbers(0,precision-1).map(n=>'.'+n.padStart(precision===100?2:1,'0'))} selected={'.'+String(fraction).padStart(precision===100?2:1,'0')} onChange={v=>numberChanged(whole,Number(v.slice(1)))}/><Wheel label="Unit" values={units} selected={unit} onChange={setUnit}/></View>
   <Text style={[styles.h2,{textAlign:'center'}]}>{(rounded/precision).toFixed(precision===100?2:1)} {unit}</Text>
   <Button label={`Use ${kind}`} disabled={canonical<=0||canonical>(isWeight?1000:3)} onPress={()=>{onChange(canonical);onUnitChange?.(unit);setOpen(false);}}/><Button secondary label={`Clear ${kind}`} onPress={()=>{onChange(null);setOpen(false);}}/>
  </Sheet>
 </View>;
}
