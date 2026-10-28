import { useState } from 'react';
import type { ChangeEvent, ReactElement } from 'react';
import type { ResultView } from './ResultPanel';
import type { CampusDataset } from '../types/campus';
import type { AnalysisInput } from '../services/analysis';
import { createPlan, deletePlan, exportPlanReport, MAX_PLAN_BYTES, parsePlan, readPlans, restorePlan, savePlan, serializePlan, type SavedPlan } from '../services/plans';

interface PlanLibraryProps {
  readonly input: AnalysisInput;
  readonly result: ResultView | null;
  readonly candidateKey: string | null;
  readonly checkedIds: readonly string[];
  readonly dataset: CampusDataset;
  readonly onRestore: (plan: SavedPlan, restored: ReturnType<typeof restorePlan>) => void;
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请检查浏览器存储或文件权限';
}
function initialLibrary(): { plans: readonly SavedPlan[]; error: string } {
  try { return { plans: readPlans(window.localStorage), error: '' }; }
  catch (error) { return { plans: [], error: `方案库读取失败：${message(error)}` }; }
}
function download(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  // Defer revocation so browsers can start the download before the URL expires.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PlanLibrary({ input, result, candidateKey, checkedIds, dataset, onRestore }: PlanLibraryProps): ReactElement {
  const [initial] = useState(initialLibrary);
  const [plans, setPlans] = useState(initial.plans);
  const [label, setLabel] = useState('我的调度方案');
  const [notice, setNotice] = useState(initial.error);
  const [isError, setIsError] = useState(Boolean(initial.error));
  const canSave = result !== null && candidateKey !== null;
  const run = (action: () => void): void => {
    try { action(); setIsError(false); } catch (error) { setIsError(true); setNotice(message(error)); }
  };
  const currentPlan = (): SavedPlan => {
    if (!result || !candidateKey) throw new Error('请先运行分析并选择一个可行方案');
    return createPlan(label, input, result, candidateKey, checkedIds, dataset, crypto.randomUUID(), new Date().toISOString());
  };
  const saveCurrent = (): void => run(() => {
    const plan = currentPlan();
    setPlans(savePlan(window.localStorage, plan));
    setNotice('方案已保存到本机浏览器。刷新或切换首页后，可从列表重新恢复。');
  });
  const restore = (plan: SavedPlan): void => run(() => {
    const restored = restorePlan(plan, dataset);
    onRestore(plan, restored); setLabel(plan.label); setNotice(restored.notice);
  });
  const exportCurrent = (format: 'json' | 'report'): void => run(() => {
    const plan = currentPlan();
    const content = format === 'json' ? serializePlan(plan) : exportPlanReport(plan, dataset);
    download(`CampusTwin-plan-${plan.id}.${format === 'json' ? 'json' : 'md'}`, content,
      format === 'json' ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8');
    setNotice('已生成下载文件，请在浏览器下载列表中查看。JSON 可再次导入，报告供阅读和分享。');
  });
  const importFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const element = event.currentTarget;
    const file = element.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_PLAN_BYTES) throw new Error('方案文件超过 256 KiB 限制');
      const parsed = parsePlan(await file.text());
      const restored = restorePlan(parsed, dataset);
      // Import as a new entry, never replace another plan just because a file reuses its ID.
      const plan: SavedPlan = { ...parsed, id: crypto.randomUUID() };
      setPlans(savePlan(window.localStorage, plan));
      onRestore(plan, restored); setLabel(plan.label); setIsError(false);
      setNotice(`方案已导入并保存。${restored.notice}`);
    } catch (error) { setIsError(true); setNotice(message(error)); }
    finally { element.value = ''; }
  };
  return (
    <section className="wb-panel wb-library" aria-label="方案保存与导出">
      <h2 className="wb-side__title">04 · 方案保存与导出</h2>
      <p className="wb-hint">仅保存在当前浏览器、当前访问地址，最多 20 个方案；不跨设备同步。清理浏览器数据会删除记录，请导出 JSON 备份。恢复时会重新分析，过期选择与勾选会清除。</p>
      <div className="wb-library__controls">
        <label className="wb-field" htmlFor="plan-name"><span className="wb-label">方案名称</span>
          <input id="plan-name" className="wb-input" maxLength={80} value={label} onChange={event => setLabel(event.currentTarget.value)} />
        </label>
        <div className="wb-library__actions">
          <button className="wb-mode__btn" type="button" disabled={!canSave} onClick={saveCurrent}>保存当前方案</button>
          <button className="wb-mode__btn" type="button" disabled={!canSave} onClick={() => exportCurrent('json')}>导出方案 JSON</button>
          <button className="wb-mode__btn" type="button" disabled={!canSave} onClick={() => exportCurrent('report')}>导出方案报告</button>
        </div>
        <label className="wb-field" htmlFor="plan-import"><span className="wb-label">导入方案 JSON（最大 256 KiB）</span>
          <input id="plan-import" type="file" accept=".json,application/json" onChange={event => { void importFile(event); }} />
        </label>
      </div>
      {!canSave && <p className="wb-hint">先运行分析并选择可行候选，即可保存或导出当前方案。</p>}
      {notice && <p className={isError ? 'wb-library__error' : 'wb-library__notice'} role={isError ? 'alert' : 'status'}>{notice}</p>}
      <h3 className="wb-result__subtitle">已保存方案（{plans.length} / 20）</h3>
      {plans.length === 0 ? <p className="wb-placeholder">尚无已保存方案。这里将显示你主动保存或导入的记录。</p> : (
        <ul className="wb-library__list">{plans.map(plan => (
          <li key={plan.id} className="wb-library__item">
            <div><strong>{plan.label}</strong><p className="wb-hint">保存于 {new Date(plan.savedAt).toLocaleString('zh-CN')} · {plan.input.mode === 'preset' ? '预置' : '自定义'} · {plan.selection.candidateKey}</p></div>
            <div className="wb-library__actions">
              <button type="button" className="wb-mode__btn" onClick={() => restore(plan)}>恢复方案</button>
              <button type="button" className="wb-mode__btn" onClick={() => run(() => { download(`CampusTwin-plan-${plan.id}.json`, serializePlan(plan), 'application/json;charset=utf-8'); setNotice('已生成 JSON 备份下载文件。'); })}>下载 JSON</button>
              <button type="button" className="wb-mode__btn" aria-label={`删除方案 ${plan.label}`} onClick={() => run(() => { setPlans(deletePlan(window.localStorage, plan.id)); setNotice('该保存记录已删除，当前分析不受影响。'); })}>删除</button>
            </div>
          </li>
        ))}</ul>
      )}
    </section>
  );
}
