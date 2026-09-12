import {describe,it,expect} from 'vitest';
import {targets,score,dayScore,mergeEntries,estimateSchema,weeklyEnergy,weightTrend,trajectory,standardDrinks,unsafeText,type Profile,type Entry,type Estimate} from '../lib/engine';
const p:Profile={name:'Alex',age:36,sex:'male',height:188,weight:90,goal:'maintain',training:3,activity:'moderate',difficulty:'balanced',alcoholFrequency:1,start:'2026-09-07',timezone:'Australia/Sydney',targetWeight:null,waist:null,calorieLow:null,calorieHigh:null,protein:null,share:true,minimum:'Normal meals and comfortable movement',reviewReminder:false};
const estimate:Estimate={foods:[{name:'lunch',quantity:'one',caloriesLow:500,caloriesHigh:700,proteinLow:25,proteinHigh:35,standardDrinks:0}],drinks:[],exercise:[],steps:5000,confidence:'medium',assumptions:['Typical portion'],clarification:null,safetyConcern:false,completeDay:false};
const entry=(id='a'):Entry=>({id,day:'2026-09-07',source:'text',estimate:structuredClone(estimate)});
describe('deterministic estimates and scoring',()=>{
it('uses Mifflin St Jeor and a fixed activity factor',()=>{expect(targets(p).bmr).toBe(1900);expect(targets(p).tdee).toBe(2945);expect(targets(p).protein).toBe(144);});
it('raises dangerously low edited targets',()=>{expect(targets({...p,calorieLow:1200,calorieHigh:1300}).low).toBe(1900);});
it('gives no exercise bonus and counts rest',()=>{expect(score({food:'on',training:'rest',alcohol:'none',complete:true,minimum:false}).total).toBe(100);});
it('withholds nutrition credit for very low full-day intake even on Gold',()=>{const e=entry();e.estimate.completeDay=true;expect(dayScore({food:'on',training:'done',alcohol:'none',complete:true,minimum:false},[e],p,true).nutrition).toBe(0);});
it('permits intentional Gold flexibility without rewarding unplanned drinking',()=>{expect(score({food:'off',training:'rest',alcohol:'unplanned',complete:true,minimum:false},true).total).toBe(75);});
it('merges separate meals but deduplicates retry IDs and uses cumulative steps',()=>{expect(mergeEntries([entry(),entry(),entry('b')])).toMatchObject({caloriesLow:1000,caloriesHigh:1400,steps:5000});});
it('treats partial and missing days as unknown',()=>{expect(weeklyEnergy([entry()],p,'2026-09-08').loggedDays).toBe(0);const e=entry();e.estimate.completeDay=true;expect(weeklyEnergy([e],p,'2026-09-08')).toMatchObject({loggedDays:1,elapsedDays:2,intakeLow:500});});
it('rejects inverted model ranges, negative intake and missing confidence',()=>{const e=entry().estimate;e.foods[0].caloriesHigh=10;expect(estimateSchema.safeParse(e).success).toBe(false);e.foods[0].caloriesLow=-2;expect(estimateSchema.safeParse(e).success).toBe(false);expect(estimateSchema.safeParse({foods:[]}).success).toBe(false);});
it('uses time based rolling means',()=>{expect(weightTrend([{day:'2026-09-01',weight:100},{day:'2026-09-09',weight:90}])[1].average).toBe(90);});
it('does not project from insufficient or extreme weight history',()=>{expect(trajectory([{day:'2026-09-01',weight:90}],p.start,'2026-09-12')).toBeNull();expect(trajectory([1,8,15,22].map(d=>({day:`2026-08-${String(d).padStart(2,'0')}`,weight:100-d})),p.start,'2026-08-22')).toBeNull();});
it('computes Australian standard drinks from volume and alcohol',()=>{expect(standardDrinks(425,4.8)).toBeCloseTo(1.60956);});
it('detects compensation and purging requests',()=>{expect(unsafeText('should I purge dinner')).toBe(true);expect(unsafeText('fast tomorrow to compensate')).toBe(true);});
});
