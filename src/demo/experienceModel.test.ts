import {describe,expect,it} from 'vitest';
import {baseline,compareScenario,numberFromText,parseRequest,planReport} from './experienceModel';
import {initialState} from './model';
describe('interactive scenario decisions',()=>{
 it('retains feasible baseline and replaces overcapacity library with arts',()=>{const state=initialState();expect(compareScenario(state,baseline).originalFits).toBe(true);const r=compareScenario(state,{...baseline,people:260});expect(r.originalFits).toBe(false);expect(r.best?.venue.id).toBe('v3');expect(r.best?.checks.every(c=>c.pass)).toBe(true)});
 it('never recommends excluded venues',()=>{const r=compareScenario(initialState(),{...baseline,people:260,excluded:['v3']});expect(r.best).toBeUndefined();expect(r.options.find(c=>c.venue.id==='v3')?.feasible).toBe(false)});
 it('checks actual approved occupancy',()=>{const r=compareScenario(initialState(),{...baseline,start:'14:00',end:'16:00'});expect(r.original.find(c=>c.label==='时段冲突')?.pass).toBe(false)});
 it('recomputes for resource availability and equipment changes',()=>{const state=initialState();state.venues.find(v=>v.id==='v3')!.equipment=[];expect(compareScenario(state,{...baseline,people:260}).best).toBeUndefined()});
 it('rejects invalid scenario times and counts',()=>{expect(compareScenario(initialState(),{...baseline,start:'16:00',end:'14:00'}).best).toBeUndefined();expect(compareScenario(initialState(),{...baseline,people:0}).best).toBeUndefined()});
 it('reports selected plan actual parameters',()=>{const report=planReport(initialState(),{...baseline,people:260,start:'11:00',end:'13:00'},'v3');expect(report).toContain('11:00–13:00');expect(report).toContain('艺术活动中心');expect(report).toContain('260')});
});
describe('offline conversation parsing',()=>{
 it('parses Chinese numbers',()=>{expect(numberFromText('两百六十')).toBe(260);expect(numberFromText('十二')).toBe(12);expect(numberFromText('一千零五')).toBe(1005)});
 it('inherits unchanged fields across followups',()=>{const first=parseRequest('改成两百六十人，需要舞台灯光',baseline);const second=parseRequest('下午两点半到四点',first.scenario);expect(second.scenario).toMatchObject({people:260,start:'14:30',end:'16:00',date:baseline.date});expect(second.scenario.equipment).toContain('舞台灯光');expect(baseline.people).toBe(180);expect(baseline.equipment).not.toContain('舞台灯光')});
 it('does not confuse a date with a time range',()=>{const r=parseRequest('2026-11-02 10:30-12:00，280人',baseline);expect(r.scenario.date).toBe('2026-11-02');expect(r.scenario.start).toBe('10:30');expect(r.warnings).toEqual([])});
 it('dates-only input retains time',()=>{const r=parseRequest('2026-11-02',baseline);expect(r.scenario.start).toBe('10:00');expect(r.warnings).toEqual([])});
 it('resolves relative dates to documented demo day',()=>{expect(parseRequest('明天',baseline).scenario.date).toBe('2026-10-24');expect(parseRequest('下周一',baseline).scenario.date).toBe('2026-10-26')});
 it('excludes and restores venue',()=>{const r=parseRequest('排除艺术活动中心',baseline);expect(r.scenario.excluded).toEqual(['v3']);expect(parseRequest('取消排除艺术活动中心',r.scenario).scenario.excluded).toEqual([])});
 it('removes explicitly negated equipment',()=>{expect(parseRequest('不需要投影',baseline).scenario.equipment).toEqual(['无线话筒'])});
 it('does not silently apply invalid time, date or count',()=>{const r=parseRequest('2026-02-30，0人，晚上十点到十一点',baseline);expect(r.scenario).toEqual(baseline);expect(r.warnings).toHaveLength(3)});
 it('handles unsupported statements without inventing values',()=>{const r=parseRequest('帮我安排咖啡',baseline);expect(r.recognized).toBe(false);expect(r.scenario).toEqual(baseline)});
});
