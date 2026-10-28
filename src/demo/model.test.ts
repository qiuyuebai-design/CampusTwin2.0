import {describe,it,expect} from 'vitest';
import {initialState,checks,candidates,validDemoState,validDate} from './model';
const input={venueId:'v1',date:'2026-10-23',start:'14:00',end:'16:00',people:100,equipment:['投影设备']};
describe('interactive demo validation',()=>{
 it('blocks overlapping confirmed bookings and allows adjacent slots',()=>{const s=initialState();expect(checks(s.venues,s.bookings,input).find(c=>c.label==='时段冲突')?.pass).toBe(false);expect(checks(s.venues,s.bookings,{...input,start:'16:00',end:'18:00'}).every(c=>c.pass)).toBe(true)});
 it('pending requests do not reserve a venue',()=>{const s=initialState();expect(checks(s.venues,s.bookings,{...input,venueId:'v2'}).every(c=>c.pass)).toBe(true)});
 it.each([{people:0},{people:201},{people:1.5},{start:'14:99'},{end:'24:00'},{start:'20:00',end:'10:00'},{date:'2026-02-30'},{equipment:['舞台灯光']},{venueId:'v6'},{venueId:'missing'}])('rejects impossible requirements %j',patch=>{const s=initialState();expect(checks(s.venues,[],{...input,...patch}).some(c=>!c.pass)).toBe(true)});
 it('excludes the old approved version only during its own revision',()=>{const s=initialState();expect(checks(s.venues,s.bookings,input,'event-ai').every(c=>c.pass)).toBe(true)});
 it('ranks feasible large-capacity candidates ahead of impossible candidates',()=>{const s=initialState();const c=candidates(s,{...input,people:560,equipment:['音响']});expect(c[0].venue.id).toBe('v4');expect(c[0].feasible).toBe(true);expect(c.filter(x=>x.feasible)).toHaveLength(2)});
 it('validates backup references, record types, and stable venue identifiers',()=>{const s=initialState();expect(validDemoState(s)).toBe(true);expect(validDemoState({...s,notices:[{id:'x'}]})).toBe(false);expect(validDemoState({...s,bookings:[{...s.bookings[0],venueId:'unknown'}]})).toBe(false);expect(validDemoState({...s,venues:s.venues.map(v=>({...v,id:'duplicate'}))})).toBe(false);expect(validDemoState({...s,plans:[{id:'broken'}]})).toBe(false);expect(validDemoState(null)).toBe(false)});
 it('validates leap dates',()=>{expect(validDate('2028-02-29')).toBe(true);expect(validDate('2026-02-29')).toBe(false)});
});
