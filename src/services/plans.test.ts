import { describe, expect, it } from 'vitest';
import { campusDataset } from '../data/campus';
import { defaultForm } from '../utils/changeForm';
import { analyze, type AnalysisInput } from './analysis';
import { createPlan, deletePlan, exportPlanReport, MAX_PLAN_BYTES, parsePlan, readPlans, restorePlan, savePlan, serializePlan, STORAGE_KEY, type SavedPlan, type StoragePort } from './plans';

const input: AnalysisInput = { mode: 'preset', form: defaultForm(campusDataset.activities[0]), presetId: 'chg-001', enumerateSlots: false };
const now = '2026-10-23T12:00:00.000Z';
function planFor(custom: AnalysisInput = input, key?: string): SavedPlan {
  const outcome = analyze(custom, campusDataset);
  if (!outcome.ok) throw new Error(outcome.errors.join('；'));
  const candidate = key ?? outcome.result.feasible[0]?.candidateKey;
  if (!candidate) throw new Error('缺少候选');
  return createPlan('测试方案', custom, outcome.result, candidate,
    ['manual-final-approval', 'sys-slot'], campusDataset, 'test-plan-1', now);
}
function memoryStore(): StoragePort {
  const data = new Map<string, string>();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
}
const customInput: AnalysisInput = {
  mode: 'custom', form: { ...defaultForm(campusDataset.activities[2]), kind: 'venue' },
  presetId: 'chg-001', enumerateSlots: true
};

describe('方案保存、导入与重新分析', () => {
  it('预置方案经 JSON 往返后重新分析，保留候选与清单', () => {
    const plan = planFor();
    const parsed = parsePlan(serializePlan(plan));
    expect(parsed).toEqual(plan);
    const restored = restorePlan(parsed, campusDataset);
    expect(restored.candidateKey).toBe(plan.selection.candidateKey);
    expect(restored.checkedIds).toEqual(['manual-final-approval', 'sys-slot']);
    expect(restored.result.feasible[0]?.score?.total).toBe(73.6);
  });
  it('多时段方案在文件限制以内，报告使用所选晚间时段而非输入基准', () => {
    const key = 'venue-002@2026-10-22T19:00~2026-10-22T21:00';
    const plan = planFor(customInput, key);
    expect(new TextEncoder().encode(serializePlan(plan)).length).toBeLessThan(MAX_PLAN_BYTES);
    const report = exportPlanReport(plan, campusDataset);
    expect(report).toContain('目标时段：2026-10-22T19:00 → 2026-10-22T21:00');
    expect(report).toContain('基准时段');
    expect(report).toContain('[x] 最终方案确认');
    expect(report).toContain('未执行真实预约');
    expect(restorePlan(parsePlan(serializePlan(plan)), campusDataset).candidateKey).toBe(key);
  });
  it('数据版本变化时重新分析，但清除旧选择和勾选', () => {
    const plan = { ...planFor(), datasetVersion: 'old-seed' };
    const restored = restorePlan(plan, campusDataset);
    expect(restored.result.feasible.length).toBeGreaterThan(0);
    expect(restored.candidateKey).toBeNull();
    expect(restored.checkedIds).toEqual([]);
    expect(() => exportPlanReport(plan, campusDataset)).toThrow('过期');
  });
  it('引擎版本变化时旧选择失效', () => {
    expect(restorePlan({ ...planFor(), engineVersion: 'old-engine' }, campusDataset).candidateKey).toBeNull();
  });
  it('同一候选的距离评分变化也会使旧勾选失效', () => {
    const updated = { ...campusDataset, venues: campusDataset.venues.map(v => v.id === 'venue-002' ? { ...v, distanceToCenterMeters: 999 } : v) };
    expect(restorePlan(planFor(), updated).candidateKey).toBeNull();
  });
  it('候选容量不再足够时不能恢复旧可行状态', () => {
    const updated = { ...campusDataset, venues: campusDataset.venues.map(v => v.id === 'venue-002' ? { ...v, capacity: 10 } : v) };
    const restored = restorePlan(planFor(), updated);
    expect(restored.result.feasible).toHaveLength(0);
    expect(restored.candidateKey).toBeNull();
  });
  it('忽略导入的伪造结果与原型字段，使用真实引擎重算', () => {
    const raw = serializePlan(planFor()).trim().slice(0, -1) + ',"result":{"status":"approved","score":99999},"__proto__":{"polluted":true}}';
    const plan = parsePlan(raw);
    expect(Object.prototype.hasOwnProperty.call(plan, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(plan, 'result')).toBe(false);
    expect(restorePlan(plan, campusDataset).result.feasible[0]?.score?.total).toBe(73.6);
  });
  it('未知清单项不会进入恢复结果', () => {
    const plan = planFor();
    const changed = { ...plan, selection: { ...plan.selection, checkedIds: ['manual-made-up', ...plan.selection.checkedIds] } };
    expect(restorePlan(parsePlan(serializePlan(changed)), campusDataset).checkedIds).not.toContain('manual-made-up');
  });
  it('拒绝非法 JSON、未知 schema、非法布尔和不合法数量', () => {
    expect(() => parsePlan('{')).toThrow('JSON');
    expect(() => parsePlan(JSON.stringify({ ...planFor(), schemaVersion: 9 }))).toThrow('版本');
    const plan = planFor();
    expect(() => parsePlan(JSON.stringify({ ...plan, input: { ...plan.input, enumerateSlots: 'true' } }))).toThrow('布尔');
    expect(() => parsePlan(JSON.stringify({ ...plan, input: { ...plan.input, form: { ...plan.input.form, after: 'Infinity' } } }))).toThrow('数量');
  });
  it('按 UTF-8 字节限制文件，拒绝过大中文载荷', () => {
    expect(() => parsePlan('中'.repeat(90_000))).toThrow('256 KiB');
  });
  it('拒绝无效时间、空名称和重复清单项', () => {
    const plan = planFor();
    expect(() => parsePlan(JSON.stringify({ ...plan, savedAt: '2026-02-30T12:00:00.000Z' }))).toThrow('时间');
    expect(() => parsePlan(JSON.stringify({ ...plan, label: '   ' }))).toThrow('名称');
    expect(() => parsePlan(JSON.stringify({ ...plan, selection: { ...plan.selection, checkedIds: ['sys-slot', 'sys-slot'] } }))).toThrow('重复');
  });
  it('导入不存在的活动时恢复失败，不产生伪造推荐', () => {
    const plan = planFor(customInput);
    expect(() => restorePlan({ ...plan, input: { ...plan.input, form: { ...plan.input.form, activityId: 'act-999' } } }, campusDataset)).toThrow('不存在');
  });
  it('报告中的用户标题作为文字转义，不成为 Markdown 链接或标签', () => {
    const report = exportPlanReport({ ...planFor(), label: '[点我](javascript:alert(1)) <img>' }, campusDataset);
    expect(report).not.toContain('[点我](javascript:');
    expect(report).not.toContain('<img>');
  });
});

describe('本地存储边界', () => {
  it('保存、重新读取、同编号更新和删除，不修改原有数组', () => {
    const store = memoryStore();
    const saved = savePlan(store, planFor());
    expect(readPlans(store)).toEqual(saved);
    savePlan(store, { ...planFor(), label: '已修改' });
    expect(readPlans(store)).toHaveLength(1);
    expect(readPlans(store)[0]?.label).toBe('已修改');
    expect(saved[0]?.label).toBe('测试方案');
    expect(deletePlan(store, saved[0].id)).toEqual([]);
    expect(readPlans(store)).toEqual([]);
  });
  it('损坏的旧存储不会被保存操作覆盖', () => {
    const store = memoryStore(); store.setItem(STORAGE_KEY, '{bad');
    expect(() => savePlan(store, planFor())).toThrow('损坏');
    expect(store.getItem(STORAGE_KEY)).toBe('{bad');
  });
  it('存储配额失败会明确报错，原有数据保持不变', () => {
    const store = memoryStore(); savePlan(store, planFor());
    const previous = store.getItem(STORAGE_KEY);
    const blocked = { getItem: store.getItem, setItem: () => { throw new Error('quota'); } };
    expect(() => savePlan(blocked, { ...planFor(), id: 'new' })).toThrow('空间不足');
    expect(store.getItem(STORAGE_KEY)).toBe(previous);
  });
  it('存储读取被禁止时不尝试写入', () => {
    let wrote = false;
    const blocked = { getItem: (): string | null => { throw new Error('blocked'); }, setItem: () => { wrote = true; } };
    expect(() => savePlan(blocked, planFor())).toThrow('blocked'); expect(wrote).toBe(false);
  });
  it('第 21 个方案被拒绝，不静默淘汰已有备份', () => {
    const store = memoryStore(); const plan = planFor();
    for (let index = 0; index < 20; index++) savePlan(store, { ...plan, id: `plan-${index}` });
    expect(() => savePlan(store, { ...plan, id: 'overflow' })).toThrow('20');
    expect(readPlans(store)).toHaveLength(20);
  });
});
