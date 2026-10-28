import type { ResultView } from '../components/ResultPanel';
import { buildTargetState, evaluateCandidates } from '../engine/candidates';
import { runScheduling, SCHEDULING_LIMITATIONS } from '../engine/runScheduling';
import type { CampusDataset } from '../types/campus';
import type { FormMode, WorkbenchForm } from '../utils/changeForm';
import { buildCustomChange, formatChangeStatus, isChangeId, validateForm } from '../utils/changeForm';

export interface AnalysisInput {
  readonly mode: FormMode;
  readonly form: WorkbenchForm;
  readonly presetId: string;
  readonly enumerateSlots: boolean;
}
export type AnalysisOutcome =
  | { readonly ok: true; readonly result: ResultView }
  | { readonly ok: false; readonly errors: readonly string[] };

/** Shared by the workbench and restoration: imported results are never executed or trusted. */
export function analyze(input: AnalysisInput, dataset: CampusDataset): AnalysisOutcome {
  if (input.mode === 'preset') {
    if (!isChangeId(input.presetId)) return { ok: false, errors: ['预置变更编号无效'] };
    const scheduling = runScheduling(dataset, { changeIds: [input.presetId] });
    const first = scheduling.results[0];
    if (!first || !first.target) return { ok: false, errors: [first?.summary ?? '没有调度结果'] };
    return { ok: true, result: {
      source: 'preset', changeId: first.changeId, summary: first.summary,
      status: first.status, statusLabel: formatChangeStatus(first.status),
      feasible: first.feasibleCandidates, excluded: first.excludedCandidates,
      warnings: first.warnings, limitations: scheduling.limitations, target: first.target,
      activity: dataset.activities.find(item => item.id === first.activityId) ?? null
    } };
  }
  const validation = validateForm(input.form);
  if (!validation.ok) return { ok: false, errors: validation.errors };
  const activity = dataset.activities.find(item => item.id === input.form.activityId);
  if (!activity) return { ok: false, errors: ['场景引用的活动不存在'] };
  // requestedAt is metadata only; use a stable timestamp when rebuilding a saved simulation.
  const built = buildCustomChange(input.form, activity, '2026-10-23T00:00');
  if (!built.ok) return built;
  const outcome = buildTargetState(dataset, built.change, activity);
  if (!outcome.target) return { ok: false, errors: outcome.errors };
  const set = evaluateCandidates(dataset, outcome.target, activity, { enumerateSlots: input.enumerateSlots });
  return { ok: true, result: {
    source: 'custom', changeId: built.change.id, summary: null, status: null, statusLabel: null,
    feasible: set.feasible, excluded: set.excluded,
    warnings: [...outcome.warnings, ...set.warnings], limitations: SCHEDULING_LIMITATIONS,
    target: outcome.target, activity
  } };
}
