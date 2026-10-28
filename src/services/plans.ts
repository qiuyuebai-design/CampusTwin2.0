import type { ResultView } from '../components/ResultPanel';
import type { CampusDataset } from '../types/campus';
import type { WorkbenchForm } from '../utils/changeForm';
import { analysisSignature, buildChecklistItems, buildConfirmationSummary, findSelectedCandidate, withCheckedState } from '../utils/decision';
import { analyze, type AnalysisInput } from './analysis';

export const DATASET_VERSION = 'demo-demo-20261023-v1';
export const ENGINE_VERSION = '2.0.0';
export const STORAGE_KEY = 'campustwin.plans.v1';
export const MAX_PLAN_BYTES = 256 * 1024;
export const MAX_LIBRARY_BYTES = 2 * 1024 * 1024;
export const MAX_PLANS = 20;

export interface SavedPlan {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly label: string;
  readonly savedAt: string;
  readonly datasetVersion: string;
  readonly engineVersion: string;
  readonly input: AnalysisInput;
  readonly selection: {
    readonly candidateKey: string;
    readonly checkedIds: readonly string[];
    readonly analysisSignature: string;
  };
}
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
const byteLength = (text: string): number => new TextEncoder().encode(text).byteLength;
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('方案结构无效');
  return value as Record<string, unknown>;
}
function text(obj: Record<string, unknown>, key: string, max = 128): string {
  const value = obj[key];
  if (typeof value !== 'string' || value.length > max) throw new Error(`方案字段 ${key} 无效或过长`);
  return value;
}
function stringList(value: unknown, max: number): readonly string[] {
  if (!Array.isArray(value) || value.length > max ||
      !value.every(item => typeof item === 'string' && item.length <= 128) ||
      new Set(value).size !== value.length) throw new Error('方案列表字段无效或重复');
  return value.map(item => String(item));
}
function parseInput(value: unknown): AnalysisInput {
  const input = record(value);
  const raw = record(input.form);
  const mode = text(input, 'mode');
  const kind = text(raw, 'kind');
  if (mode !== 'preset' && mode !== 'custom') throw new Error('不支持的分析模式');
  if (kind !== 'time' && kind !== 'venue' && kind !== 'scale' && kind !== 'resource') throw new Error('不支持的变更类型');
  if (typeof input.enumerateSlots !== 'boolean') throw new Error('时段枚举字段必须是布尔值');
  const form: WorkbenchForm = {
    activityId: text(raw, 'activityId'), kind, start: text(raw, 'start'), end: text(raw, 'end'),
    minCapacity: text(raw, 'minCapacity'), targetVenueId: text(raw, 'targetVenueId'),
    requiredEquipmentIds: stringList(raw.requiredEquipmentIds, 32), after: text(raw, 'after'),
    equipmentId: text(raw, 'equipmentId'), equipmentAfter: text(raw, 'equipmentAfter'),
    resourceId: text(raw, 'resourceId'), resourceAfter: text(raw, 'resourceAfter')
  };
  if (!/^act-\d{3}$/.test(form.activityId)) throw new Error('活动编号无效');
  for (const [key, id] of [['targetVenueId', form.targetVenueId], ['equipmentId', form.equipmentId], ['resourceId', form.resourceId]]) {
    const prefix = key === 'targetVenueId' ? 'venue' : key === 'equipmentId' ? 'eq' : 'res';
    if (id !== '' && !new RegExp(`^${prefix}-\\d{3}$`).test(id)) throw new Error('场景引用编号无效');
  }
  if (!form.requiredEquipmentIds.every(id => /^eq-\d{3}$/.test(id))) throw new Error('设备编号无效');
  for (const value of [form.minCapacity, form.after, form.equipmentAfter, form.resourceAfter]) {
    if (value !== '' && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 1_000_000)) throw new Error('数量必须为 0 到 1000000 的整数');
  }
  const presetId = text(input, 'presetId');
  if (!/^chg-\d{3}$/.test(presetId)) throw new Error('预置编号无效');
  return { mode, form, presetId, enumerateSlots: input.enumerateSlots };
}
/** Build a fresh whitelisted object; never spread untrusted JSON into application state. */
function parseValue(value: unknown): SavedPlan {
  const raw = record(value);
  if (raw.schemaVersion !== 1) throw new Error('不兼容的方案文件版本（仅支持版本 1）');
  const selection = record(raw.selection);
  const id = text(raw, 'id');
  const label = text(raw, 'label', 80).trim();
  const savedAt = text(raw, 'savedAt');
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || !label) throw new Error('方案名称或编号无效');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(savedAt) ||
      !Number.isFinite(Date.parse(savedAt)) || new Date(savedAt).toISOString() !== savedAt) throw new Error('保存时间无效');
  const candidateKey = text(selection, 'candidateKey');
  if (!/^venue-\d{3}@[^~]+~[^~]+$/.test(candidateKey)) throw new Error('候选编号无效');
  const checkedIds = stringList(selection.checkedIds, 20);
  if (!checkedIds.every(id => /^(sys|manual)-[a-z0-9-]+$/.test(id))) throw new Error('清单编号无效');
  return {
    schemaVersion: 1, id, label, savedAt,
    datasetVersion: text(raw, 'datasetVersion'), engineVersion: text(raw, 'engineVersion'),
    input: parseInput(raw.input), selection: {
      candidateKey, checkedIds, analysisSignature: text(selection, 'analysisSignature', 131_072)
    }
  };
}
export function parsePlan(content: string): SavedPlan {
  if (byteLength(content) > MAX_PLAN_BYTES) throw new Error('方案文件超过 256 KiB 限制');
  let raw: unknown;
  try { raw = JSON.parse(content); } catch { throw new Error('方案文件不是合法 JSON'); }
  return parseValue(raw);
}
export function serializePlan(plan: SavedPlan): string {
  const content = JSON.stringify(plan, null, 2);
  parsePlan(content);
  return content + '\n';
}
export function createPlan(
  label: string, input: AnalysisInput, result: ResultView, candidateKey: string,
  checkedIds: readonly string[], dataset: CampusDataset, id: string, savedAt: string
): SavedPlan {
  const candidate = findSelectedCandidate(result, candidateKey);
  if (!candidate || !result.target || !result.activity) throw new Error('请先分析并选择一个可行方案');
  const allowedIds = buildChecklistItems(result.target, candidate, dataset).map(item => item.id);
  return parseValue({ schemaVersion: 1, id, label: label.trim(), savedAt,
    datasetVersion: DATASET_VERSION, engineVersion: ENGINE_VERSION,
    input, selection: { candidateKey, checkedIds: checkedIds.filter(value => allowedIds.includes(value)),
      analysisSignature: analysisSignature(result) }
  });
}
export function restorePlan(plan: SavedPlan, dataset: CampusDataset): {
  result: ResultView; candidateKey: string | null; checkedIds: readonly string[]; notice: string;
} {
  const outcome = analyze(plan.input, dataset);
  if (!outcome.ok) throw new Error(`无法恢复：${outcome.errors.join('；')}`);
  const result = outcome.result;
  const candidate = findSelectedCandidate(result, plan.selection.candidateKey);
  const current = plan.datasetVersion === DATASET_VERSION && plan.engineVersion === ENGINE_VERSION &&
    plan.selection.analysisSignature === analysisSignature(result);
  if (!current || !candidate || !result.target) return {
    result, candidateKey: null, checkedIds: [], notice: '已重新分析；数据、引擎或候选发生变化，旧选择与勾选已清除，请重新选择。'
  };
  const allowed = buildChecklistItems(result.target, candidate, dataset).map(item => item.id);
  return { result, candidateKey: candidate.candidateKey,
    checkedIds: plan.selection.checkedIds.filter(id => allowed.includes(id)),
    notice: '已重新分析并恢复方案及清单；这是本地模拟记录。'
  };
}
export function readPlans(storage: StoragePort): readonly SavedPlan[] {
  const content = storage.getItem(STORAGE_KEY);
  if (content === null) return [];
  if (byteLength(content) > MAX_LIBRARY_BYTES) throw new Error('本地方案库超过 2 MiB 限制');
  let raw: unknown;
  try { raw = JSON.parse(content); } catch { throw new Error('本地方案库已损坏；未覆盖原有数据，请先备份浏览器存储'); }
  if (!Array.isArray(raw) || raw.length > MAX_PLANS) throw new Error('本地方案库结构或数量无效');
  const plans = raw.map(value => parsePlan(JSON.stringify(value)));
  if (new Set(plans.map(plan => plan.id)).size !== plans.length) throw new Error('本地方案库包含重复编号');
  return plans;
}
function writePlans(storage: StoragePort, plans: readonly SavedPlan[]): void {
  const content = JSON.stringify(plans);
  if (byteLength(content) > MAX_LIBRARY_BYTES) throw new Error('本地方案库已满，请先导出备份并删除旧方案');
  try { storage.setItem(STORAGE_KEY, content); } catch {
    throw new Error('保存失败：浏览器存储不可用或空间不足，原方案列表未更新；可先导出 JSON 备份。');
  }
}
export function savePlan(storage: StoragePort, plan: SavedPlan): readonly SavedPlan[] {
  const checked = parsePlan(serializePlan(plan));
  const old = readPlans(storage); // A corrupt or blocked store must never be silently overwritten.
  const plans = [checked, ...old.filter(item => item.id !== checked.id)];
  if (plans.length > MAX_PLANS) throw new Error('最多保存 20 个方案，请先导出备份并删除旧方案');
  writePlans(storage, plans);
  return plans;
}
export function deletePlan(storage: StoragePort, id: string): readonly SavedPlan[] {
  const plans = readPlans(storage).filter(plan => plan.id !== id);
  writePlans(storage, plans);
  return plans;
}
function inline(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/[\\`*_{}\[\]()<>|#!]/g, char => `\\${char}`);
}
/** Recompute at export time. No imported score or result text is accepted as evidence. */
export function exportPlanReport(plan: SavedPlan, dataset: CampusDataset): string {
  const restored = restorePlan(plan, dataset);
  const candidate = findSelectedCandidate(restored.result, restored.candidateKey);
  const { target, activity } = restored.result;
  if (!candidate || !target || !activity) throw new Error('方案已过期，请重新选择并保存后导出报告');
  const rows = buildConfirmationSummary(activity, target, candidate, dataset);
  const items = withCheckedState(buildChecklistItems(target, candidate, dataset), restored.checkedIds);
  return [
    `# CampusTwin 2.0 · ${inline(plan.label)}`, '',
    '本地模拟方案：未执行真实预约、通知或设备分配。清单勾选仅为用户记录。', '',
    `保存时间：${plan.savedAt}`, `数据版本：${plan.datasetVersion}；引擎版本：${plan.engineVersion}`,
    `分析方式：${plan.input.mode === 'preset' ? '预置变更（单时段）' : plan.input.enumerateSlots ? '自定义变更（模拟多时段）' : '自定义变更（单时段）'}`, '',
    '## 所选方案', '', ...rows.map(row => `- ${inline(row.label)}：${inline(row.value)}`), '',
    '## 硬约束', '', ...candidate.evaluation.checks.map(check => `- ${inline(check.label)}：${check.status}；${inline(check.detail)}`), '',
    '## 评分说明', '', ...(candidate.score?.explanation ?? []).map(value => `- ${inline(value)}`), '',
    '## 人工清单与系统信息', '', ...items.map(item => `- [${item.checked ? 'x' : ' '}] ${inline(item.label)}：${inline(item.detail)}`), '',
    '## 警告与能力限制', '', ...[...restored.result.warnings, ...restored.result.limitations].map(value => `- ${inline(value)}`), '',
    '评分为确定性启发式排序，不保证全局最优；模拟时段不代表真实空闲或审批结果。', ''
  ].join('\n');
}
