import test from 'node:test';
import assert from 'node:assert/strict';
import {convertMeasurement,emptyProfile,profileSchema,onboardingError} from '../src/userProfile';
test('profile converts both unit pairs and validates personal details',()=>{
 assert.equal(convertMeasurement('70',0.45359237,false),'154.3236');
 assert.equal(convertMeasurement('154.3236',0.45359237,true),'70');
 assert.equal(convertMeasurement('1,75',0.0254,false),'68.8976');
 assert.equal(convertMeasurement('68.8976',0.0254,true),'1.75');
 assert.equal(convertMeasurement('',0.0254,true),'');
 assert.equal(convertMeasurement('abc',0.0254,true),'');
 assert.equal(profileSchema.safeParse({...emptyProfile,birthDate:'2025-02-30'}).success,false);
 assert.equal(profileSchema.safeParse({...emptyProfile,birthDate:'2999-01-01'}).success,false);
 assert.equal(profileSchema.safeParse({...emptyProfile,weightKg:-10}).success,false);
 assert.equal(profileSchema.safeParse({...emptyProfile,heightMeters:0}).success,false);
 assert.equal(profileSchema.safeParse(emptyProfile).success,true);
});

test('onboarding requires personal details, goals and an explicit AI choice',()=>{
 assert.notEqual(onboardingError(emptyProfile),'');
 const complete={...emptyProfile,firstName:'Test',lastName:'User',birthDate:'1990-01-01',weightKg:70,goals:['compare' as const],aiHelp:false};
 assert.equal(onboardingError(complete),'');
 assert.notEqual(onboardingError({...complete,aiHelp:null}),'');
 assert.notEqual(onboardingError({...complete,weightKg:null}),'');
 assert.equal(profileSchema.safeParse({...complete,weightUnit:'stone'}).success,false);
});
