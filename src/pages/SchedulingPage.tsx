import { useState } from 'react';
import type { ReactElement } from 'react';
import ActivityList from '../components/ActivityList';
import PlanLibrary from '../components/PlanLibrary';
import { analyze, type AnalysisInput } from '../services/analysis';
import type { SavedPlan, restorePlan } from '../services/plans';
import ChangeForm from '../components/ChangeForm';
import DecisionPanel from '../components/DecisionPanel';
import ResultPanel, { type ResultView } from '../components/ResultPanel';
import { campusDataset } from '../data/campus';
import type { FormMode, WorkbenchForm } from '../utils/changeForm';
import {
  defaultForm,
  toPresetOptions
} from '../utils/changeForm';
import {
  analysisSignature,
  buildChecklistItems,
  buildConfirmationSummary,
  findSelectedCandidate,
  isSelectionValid,
  toggleChecklistItem,
  withCheckedState
} from '../utils/decision';

const { activities, venues, equipment, resources, changes } = campusDataset;
const PRESET_OPTIONS = toPresetOptions(changes);
const FIRST_ACTIVITY = activities[0];
const FIRST_PRESET = PRESET_OPTIONS[0];

export default function SchedulingPage(): ReactElement {
  const [mode, setMode] = useState<FormMode>('preset');
  const [form, setForm] = useState<WorkbenchForm>(() => defaultForm(FIRST_ACTIVITY));
  const [selectedPresetId, setSelectedPresetId] = useState<string>(FIRST_PRESET.id);
  const [result, setResult] = useState<ResultView | null>(null);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  /** 本次分析签名 + 所选候选复合 key（场地@时段）+ 勾选状态；全部随 clearOutput 清除，防旧选择复活 */
  const [selection, setSelection] = useState<{
    signature: string;
    candidateKey: string;
    checkedIds: readonly string[];
  } | null>(null);
  /** 自定义模式：是否按时段枚举生成 场地 × 时段 组合候选（预置模式固定关闭，保持单时段语义） */
  const [enumerateSlots, setEnumerateSlots] = useState<boolean>(false);

  const activity = activities.find((item) => item.id === form.activityId);
  const presetChange = changes.find((item) => item.id === selectedPresetId);

  const clearOutput = (): void => {
    setResult(null);
    setErrors([]);
    setSelection(null);
  };

  const patchForm = (patch: Partial<WorkbenchForm>): void => {
    if (patch.activityId !== undefined && patch.activityId !== form.activityId) {
      const next = activities.find((item) => item.id === patch.activityId);
      if (next !== undefined) {
        setForm({ ...defaultForm(next), kind: form.kind });
        clearOutput();
        return;
      }
    }
    setForm({ ...form, ...patch });
    clearOutput();
  };

  const changeMode = (next: FormMode): void => {
    setMode(next);
    clearOutput();
  };

  const changePreset = (presetId: string): void => {
    setSelectedPresetId(presetId);
    clearOutput();
  };

  const selectActivity = (activityId: string): void => {
    const next = activities.find((item) => item.id === activityId);
    if (next === undefined) {
      return;
    }
    setForm({ ...defaultForm(next), kind: form.kind });
    clearOutput();
  };

  const input: AnalysisInput = { mode, form, presetId: selectedPresetId, enumerateSlots };
  const submit = (): void => {
    clearOutput();
    setBusy(true);
    try {
      const outcome = analyze(input, campusDataset);
      if (outcome.ok) setResult(outcome.result);
      else setErrors(outcome.errors);
    } catch {
      setErrors(['分析未完成，请检查输入后重试']);
    } finally { setBusy(false); }
  };
  const changeEnumeration = (next: boolean): void => {
    setEnumerateSlots(next);
    clearOutput();
  };
  const applyRestored = (plan: SavedPlan, restored: ReturnType<typeof restorePlan>): void => {
    setMode(plan.input.mode); setForm(plan.input.form);
    setSelectedPresetId(plan.input.presetId); setEnumerateSlots(plan.input.enumerateSlots);
    setResult(restored.result); setErrors([]);
    setSelection(restored.candidateKey === null ? null : {
      signature: analysisSignature(restored.result), candidateKey: restored.candidateKey,
      checkedIds: restored.checkedIds
    });
  };

  /** 新分析（preset 运行成功）同样作废旧选择，防止同 changeId + 候选 key 复活 */
  const selectCandidate = (candidateKey: string): void => {
    if (result === null) {
      return;
    }
    const signature = analysisSignature(result);
    const candidate = result.feasible.find((item) => item.candidateKey === candidateKey);
    if (candidate === undefined) {
      return;
    }
    setSelection({ signature, candidateKey: candidate.candidateKey, checkedIds: [] });
  };

  const toggleChecklist = (itemId: string): void => {
    if (result === null || selection === null) {
      return;
    }
    if (result.target === null || result.activity === null) {
      return;
    }
    const candidate = findSelectedCandidate(result, selection.candidateKey);
    if (candidate === null) {
      return;
    }
    const items = buildChecklistItems(result.target, candidate, campusDataset);
    setSelection({
      ...selection,
      checkedIds: toggleChecklistItem(items, selection.checkedIds, itemId)
    });
  };

  /** 选择 + 面板数据：签名不匹配（重跑/失效）或选择无效时一律视为无选择 */
  const selectionValid = (() => {
    if (result === null || selection === null) {
      return false;
    }
    if (selection.signature !== analysisSignature(result)) {
      return false;
    }
    return isSelectionValid(result, selection.candidateKey);
  })();

  const activeCandidateKey: string | null =
    selectionValid && selection !== null ? selection.candidateKey : null;
  const selectedCandidate =
    result === null || activeCandidateKey === null
      ? null
      : findSelectedCandidate(result, activeCandidateKey);
  const decisionElement =
    selectionValid &&
    selection !== null &&
    result !== null &&
    result.target !== null &&
    result.activity !== null &&
    selectedCandidate !== null
      ? (() => {
          const summaryRows = buildConfirmationSummary(
            result.activity as NonNullable<typeof result.activity>,
            result.target as NonNullable<typeof result.target>,
            selectedCandidate,
            campusDataset
          );
          const items = withCheckedState(
            buildChecklistItems(
              result.target as NonNullable<typeof result.target>,
              selectedCandidate,
              campusDataset
            ),
            selection.checkedIds
          );
          return (
            <>
              <h4 className="wb-result__subtitle">决策确认与执行清单（所选方案）</h4>
              <DecisionPanel
                rows={summaryRows}
                items={items}
                onToggle={toggleChecklist}
              />
            </>
          );
        })()
      : null;

  return (
    <div className="wb-page">
      <header className="wb-hero">
        <p className="wb-hero__eyebrow">校园活动变更模拟工作台 · 本地演示原型</p>
        <h1 className="wb-hero__title">调度工作台</h1>
        <p className="wb-hero__lead">
          选择模拟活动，运行候选分析：先按硬约束过滤不可行场地，再对可行候选做启发式评分与排序；
          排除原因、评分说明与能力限制全部来自引擎实际输出。
        </p>
      </header>

      <div className="wb-layout">
        <aside className="wb-side">
          <h2 className="wb-side__title">01 · 活动列表（模拟数据）</h2>
          <ActivityList
            activities={activities}
            venues={venues}
            resources={resources}
            selectedActivityId={form.activityId}
            onSelect={selectActivity}
          />
        </aside>

        <div className="wb-main">
          <section className="wb-panel" aria-label="变更表单">
            <h2 className="wb-side__title">02 · 变更输入</h2>
            <ChangeForm
              mode={mode}
              onModeChange={changeMode}
              form={form}
              onFormPatch={patchForm}
              activities={activities}
              activity={activity}
              presetOptions={PRESET_OPTIONS}
              selectedPresetId={selectedPresetId}
              onPresetChange={changePreset}
              presetChange={presetChange}
              venues={venues}
              equipment={equipment}
              resources={resources}
              errors={errors}
              busy={busy}
              enumerateSlots={enumerateSlots}
              onEnumerateSlotsChange={changeEnumeration}
              onSubmit={submit}
            />
          </section>

          <section className="wb-panel" aria-label="方案结果">
            <h2 className="wb-side__title">03 · 方案结果</h2>
            <ResultPanel
              result={result}
              errors={errors}
              selectedCandidateKey={activeCandidateKey}
              onSelectCandidate={selectCandidate}
              decision={decisionElement}
              dataset={campusDataset}
            />
          </section>
          <PlanLibrary input={input} result={result} candidateKey={activeCandidateKey}
            checkedIds={selectionValid && selection !== null ? selection.checkedIds : []}
            dataset={campusDataset} onRestore={applyRestored} />
        </div>
      </div>
    </div>
  );
}
