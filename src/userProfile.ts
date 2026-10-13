import { z } from 'zod';
import Decimal from 'decimal.js';
import { validDate } from './domain';

export const goalOptions = { digitize:'Digitize and organize my documents', compare:'Compare results over time', appointments:'Keep track of appointments', understand:'Understand my reports' } as const;
export const profileSchema = z.object({
  firstName: z.string().trim().max(100), lastName: z.string().trim().max(100),
  birthDate: z.string().refine(value => !value || (validDate(value) && value <= new Date().toISOString().slice(0,10)), 'Enter a valid birth date that is not in the future.'),
  photoPath: z.string().max(200).nullable(),
  weightKg: z.number().finite().positive().max(1000).nullable(),
  heightMeters: z.number().finite().positive().max(3).nullable(),
  weightUnit: z.enum(['kg','lb']).default('kg'), heightUnit: z.enum(['m','in']).default('m'),
  goals: z.array(z.enum(['digitize','compare','appointments','understand'])).max(4).default([]),
  aiHelp: z.boolean().nullable().default(null), onboardingCompleted: z.boolean().default(false)
});
export type UserProfile = z.infer<typeof profileSchema>;
export const emptyProfile: UserProfile = {firstName:'',lastName:'',birthDate:'',photoPath:null,weightKg:null,heightMeters:null,weightUnit:'kg',heightUnit:'m',goals:[],aiHelp:null,onboardingCompleted:false};
export function convertMeasurement(value:string, factor:number, multiply:boolean):string {
  if(!/^\d+(?:[.,]\d*)?$/.test(value))return '';
  const number=new Decimal(value.replace(',','.'));
  return (multiply?number.mul(factor):number.div(factor)).toDecimalPlaces(4).toString();
}

export function onboardingError(profile:UserProfile, step?:number):string {
 if((step===undefined||step===0)&&(!profile.firstName.trim()||!profile.lastName.trim()||!profile.birthDate))return 'Enter your first name, last name, and date of birth.';
 if((step===undefined||step===1)&&profile.weightKg===null)return 'Choose your current weight.';
 if((step===undefined||step===2)&&(!profile.goals.length||profile.aiHelp===null))return 'Choose at least one goal and whether you want AI help.';
 const result=profileSchema.safeParse(profile);return result.success?'':result.error.issues[0]!.message;
}
