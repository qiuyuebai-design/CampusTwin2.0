import type { ReactElement, ReactNode } from 'react';
import type { Candidate } from '../engine/candidates';
import type { ChangeStatus } from '../engine/runScheduling';
import type { Activity } from '../types/activity';
import type { ActivityTargetState } from '../engine/candidates';
import type { CampusDataset } from '../types/campus';
import {
  SCORING_DISCLAIMER,
  buildComparisonRows,
  formatScoringModeLabel,
  resolveScoringMode
} from '../utils/changeForm';
import {
  buildExclusionOverview,
  explainRankDeltas,
  summarizeExclusions,
  type ExcludeSummary,
  type ExclusionOverview,
  type RankDeltaReason
} from '../utils/explain';

/** 结果视图模型：由 SchedulingPage 从引擎真实返回值组装，不伪造任何字段。 */
export interface ResultView {
  /** preset = runScheduling 完整调度；custom = buildTargetState + evaluateCandidates 原语分析 */
  readonly source: 'preset' | 'custom';
  readonly changeId: string;
  /** 仅预置变更有 summary；自定义分析为 null（不伪造 runScheduling 文案） */
  readonly summary: string | null;
  /** 仅预置变更有 status */
  readonly status: ChangeStatus | null;
  readonly statusLabel: string | null;
  readonly feasible: readonly Candidate[];
  readonly excluded: readonly Candidate[];
  readonly warnings: readonly string[];
  readonly limitations: readonly string[];
  /** 引擎真实返回的变更后目标状态；载荷无效时为 null */
  readonly target: ActivityTargetState | null;
  /** 关联活动（变更前真实状态）；未知活动时为 null */
  readonly activity: Activity | null;
}

interface ResultPanelProps {
  readonly result: ResultView | null;
  readonly errors: readonly string[];
  /** 当前选中的可行候选复合 key（场地@时段）；null 表示未选择 */
  readonly selectedCandidateKey: string | null;
  /** 仅可行候选触发；excluded 渲染不挂此回调 */
  readonly onSelectCandidate: (candidateKey: string) => void;
  /** 决策面板数据；由页面组装，null 表示无有效选择 */
  readonly decision: ReactNode;
  /** 冲突活动补全所需的只读活动数据；缺省时只做排除原因汇总，不做冲突补全 */
  readonly dataset?: Pick<CampusDataset, 'activities'>;
}

const CHECK_LABEL: Readonly<Record<string, string>> = {
  passed: '✓ 通过',
  failed: '✗ 未通过',
  skipped: '– 跳过'
};

const DELTA_LABEL: Readonly<Record<string, string>> = {
  added: '新增',
  removed: '移除',
  unchanged: '保持不变',
  updated: '数量调整'
};

function passedCount(candidate: Candidate): string {
  const checks = candidate.evaluation.checks;
  const passed = checks.filter((check) => check.status === 'passed').length;
  return `${passed}/${checks.length} 通过`;
}

function formatScoreValue(value: number | null, suffix = ''): string {
  return value === null ? '—' : `${value.toFixed(2)}${suffix}`;
}

function CandidateCard({
  candidate,
  rank,
  selectedCandidateKey,
  onSelectCandidate
}: {
  candidate: Candidate;
  rank?: number;
  selectedCandidateKey: string | null;
  onSelectCandidate: (candidateKey: string) => void;
}): ReactElement {
  const { evaluation, score } = candidate;
  const selected = candidate.candidateKey === selectedCandidateKey;
  return (
    <article className={`wb-candidate${selected ? ' wb-candidate--selected' : ''}`}>
      <header className="wb-candidate__head">
        <span className="wb-candidate__venue">
          {rank !== undefined && <span className="wb-candidate__rank">第 {rank} 位 · </span>}
          {candidate.venueName}
          <span className="wb-candidate__id">{candidate.venueId}</span>
          {candidate.isCurrentVenue && <span className="wb-candidate__tag">当前场地</span>}
          {selected && <span className="wb-candidate__tag wb-candidate__tag--selected">已选择</span>}
        </span>
        <span className="wb-candidate__head-right">
          {score !== null && <span className="wb-candidate__score">总分 {score.total.toFixed(2)}</span>}
          <button
            type="button"
            className="wb-select-btn"
            aria-pressed={selected}
            onClick={() => onSelectCandidate(candidate.candidateKey)}
          >
            {selected ? '已选择' : '选择此方案'}
          </button>
        </span>
      </header>

      <p className="wb-candidate__slot">
        时间段 [{candidate.slot.start}, {candidate.slot.end})
      </p>

      {score !== null && (
        <div className="wb-score">
          <p className="wb-score__line">
            容量适配度 {score.capacityFitScore.toFixed(2)}
            {score.distanceScore !== null && score.distanceMeters !== null
              ? ` · 距离评分 ${score.distanceScore.toFixed(2)}（${score.distanceMeters} 米）`
              : ' · 距离评分不可用'}
            {' · 口径：'}
            {formatScoringModeLabel(score.weightMode)}
          </p>
          <ul className="wb-score__explain">
            {score.explanation.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      <ul className="wb-checks">
        {evaluation.checks.map((check) => (
          <li key={check.code} className={`wb-check-item wb-check-item--${check.status}`}>
            <span className="wb-check-item__label">{check.label}</span>
            <span className="wb-check-item__status">{CHECK_LABEL[check.status] ?? check.status}</span>
            <span className="wb-check-item__detail">{check.detail}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function FeasibleTable({
  candidates,
  selectedCandidateKey,
  onSelectCandidate
}: {
  candidates: readonly Candidate[];
  selectedCandidateKey: string | null;
  onSelectCandidate: (candidateKey: string) => void;
}): ReactElement {
  return (
    <div className="wb-table-scroll" role="region" aria-label="可行候选方案对比表" tabIndex={0}>
      <table className="wb-table wb-table--compare">
        <thead>
          <tr>
            <th scope="col">排名</th>
            <th scope="col">场地</th>
            <th scope="col">当前场地</th>
            <th scope="col">总分</th>
            <th scope="col">容量适配分</th>
            <th scope="col">距离</th>
            <th scope="col">距离分</th>
            <th scope="col">时段</th>
            <th scope="col">约束</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((candidate, index) => {
            const score = candidate.score;
            const selected = candidate.candidateKey === selectedCandidateKey;
            return (
              <tr key={candidate.candidateKey} className={selected ? 'wb-row--selected' : undefined}>
                <td className="wb-table__rank">第 {index + 1} 位</td>
                <td>
                  <span className="wb-table__venue">{candidate.venueName}</span>
                  <span className="wb-candidate__id">{candidate.venueId}</span>
                </td>
                <td>{candidate.isCurrentVenue ? '是' : '否'}</td>
                <td className="wb-table__num">
                  {score === null ? '—' : score.total.toFixed(2)}
                </td>
                <td className="wb-table__num">
                  {score === null ? '—' : score.capacityFitScore.toFixed(2)}
                </td>
                <td className="wb-table__num">
                  {score === null || score.distanceMeters === null
                    ? '—'
                    : `${score.distanceMeters} 米`}
                </td>
                <td className="wb-table__num">{score === null ? '—' : formatScoreValue(score.distanceScore)}</td>
                <td className="wb-table__slot">
                  {candidate.slot.start.slice(11, 16)}–{candidate.slot.end.slice(11, 16)}
                </td>
                <td>{passedCount(candidate)}</td>
                <td>
                  <button
                    type="button"
                    className="wb-select-btn"
                    aria-pressed={selected}
                    onClick={() => onSelectCandidate(candidate.candidateKey)}
                  >
                    {selected ? '已选择' : '选择此方案'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ComparisonTable({ result }: { result: ResultView }): ReactElement {
  const { activity, target } = result;

  if (activity === null || target === null) {
    return (
      <p className="wb-placeholder">载荷无效，无目标状态，无法展示变更前后对比。</p>
    );
  }

  const rows = buildComparisonRows(activity, target);
  if (rows.length === 0) {
    return <p className="wb-placeholder">载荷无效，无目标状态，无法展示变更前后对比。</p>;
  }

  return (
    <div className="wb-table-scroll" role="region" aria-label="变更前后关键字段对比表" tabIndex={0}>
      <table className="wb-table wb-table--compare">
        <thead>
          <tr>
            <th scope="col">字段</th>
            <th scope="col">变更前</th>
            <th scope="col">变更后</th>
            <th scope="col">变化</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>
                <span className="wb-table__field">{row.label}</span>
                {row.note !== '' && <span className="wb-table__note">{row.note}</span>}
              </td>
              <td className="wb-table__value">{row.beforeText}</td>
              <td className="wb-table__value">
                {row.afterText}
                {row.deltas.length > 0 && (
                  <span className="wb-deltas">
                    {row.deltas.map((delta) => (
                      <span key={delta.id} className={`wb-delta wb-delta--${delta.change}`}>
                        {delta.id} {DELTA_LABEL[delta.change]}
                        {delta.change === 'added' && <span className="wb-delta__missing">此前无此需求</span>}
                        {delta.change === 'updated' &&
                          delta.before !== null &&
                          delta.after !== null &&
                          `（${delta.before} → ${delta.after}）`}
                      </span>
                    ))}
                  </span>
                )}
              </td>
              <td>
                <span className={`wb-badge ${row.changed ? 'wb-badge--changed' : 'wb-badge--same'}`}>
                  {row.changed ? '已变更' : '无变化'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const RANK_REASON_LABEL: Readonly<Record<RankDeltaReason, string>> = {
  total: '总分',
  capacityFitScore: '容量适配分',
  distanceScore: '距离评分',
  tie: '同分同分项（按场地 ID、时段起点稳定序）'
};

function formatDelta(value: number | null): string {
  if (value === null) {
    return '不可比';
  }
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

/**
 * 排序差异（部分解释）：只列出第 2 位起、相对上一位候选（第 N−1 位）的评分键差值，
 * 差值方向为「上位候选 − 当前候选」（来自 explainRankDeltas），不重排、不改数据。
 */
function RankDeltaBlock({
  feasible
}: {
  readonly feasible: readonly Candidate[];
}): ReactElement | null {
  if (feasible.length < 2) {
    return null;
  }

  const rows = explainRankDeltas(feasible);

  return (
    <>
      <h4 className="wb-result__subtitle">排序差异（相对上位候选）</h4>
      <p className="wb-scoring-note wb-rank-deltas__note">
        以下仅列出第 2 位起、相对上一位候选（第 N−1 位）的评分键数值差，差值方向为「上位候选 − 当前候选」；
        任一侧缺少距离评分时该差值为「不可比」，未以 0 代替。排序差异为部分解释：不表示因果归因，也不代表全局最优。
      </p>
      <ul className="wb-rank-deltas">
        {rows
          .filter((row) => row.rank > 1)
          .map((row) => {
            const above = feasible[row.rank - 2];
            const current = feasible[row.rank - 1];
            return (
              <li key={row.candidateKey} className="wb-rank-deltas__item">
                <span className="wb-rank-deltas__head">
                  第 {row.rank} 位 {current.venueName}（{row.venueId}）相对第 {row.rank - 1}{' '}
                  位（{above.venueName}）
                </span>
                <span className="wb-rank-deltas__values">
                  总分差 {formatDelta(row.totalDelta)} · 容量适配分差 {formatDelta(row.capacityDelta)} ·
                  距离评分差 {formatDelta(row.distanceDelta)}
                </span>
                <span className="wb-rank-deltas__reason">差异键：{RANK_REASON_LABEL[row.reason]}</span>
              </li>
            );
          })}
      </ul>
    </>
  );
}

/**
 * 排除原因汇总：只做计数聚合，不复制、不改写逐卡 failureReasons 原文；
 * 冲突活动仅在 dataset 提供且能在模拟数据中可靠匹配时展示，否则明确降级。
 */
function ExclusionSummaryBlock({
  excluded,
  dataset
}: {
  readonly excluded: readonly Candidate[];
  readonly dataset?: Pick<CampusDataset, 'activities'>;
}): ReactElement | null {
  if (excluded.length === 0) {
    return null;
  }

  const overview: ExclusionOverview | null =
    dataset === undefined ? null : buildExclusionOverview(excluded, dataset);
  const summary: ExcludeSummary =
    overview === null ? summarizeExclusions(excluded) : overview.summary;
  const conflictRefs = overview === null ? [] : overview.conflictRefs;

  if (summary.groups.length === 0 && conflictRefs.length === 0) {
    return null;
  }

  return (
    <>
      <h4 className="wb-result__subtitle">排除原因汇总（{excluded.length} 个候选）</h4>
      <ul className="wb-exclude-summary">
        {summary.groups.map((group) => (
          <li key={group.code} className="wb-exclude-summary__item">
            <span className="wb-exclude-summary__label">
              {group.label}（{group.code}）
            </span>
            <span className="wb-exclude-summary__counts">
              涉及候选 {group.candidateCount} 个 · 失败检查 {group.failureCount} 次
            </span>
          </li>
        ))}
      </ul>
      <p className="wb-scoring-note">
        口径说明：涉及候选=至少因该原因失败一次的候选数；失败检查=失败检查项次数（同一候选可有多项）。
        汇总仅统计结构化检查，不替代下方逐卡排除原因原文。
      </p>

      <h5 className="wb-exclude-summary__heading">
        冲突活动（仅展示可在数据集中可靠匹配的条目）
      </h5>
      {dataset === undefined ? (
        <p className="wb-placeholder">
          未提供活动数据，未做冲突活动补全；这不表示不存在冲突，也不表示任何检查通过。
        </p>
      ) : conflictRefs.length === 0 ? (
        <p className="wb-placeholder">
          未找到可可靠匹配的冲突活动；上方排除原因原文保持不变。这不表示冲突不存在。
        </p>
      ) : (
        <>
          <ul className="wb-conflict-refs">
            {conflictRefs.map((ref) => (
              <li key={ref.activityId} className="wb-conflict-refs__item">
                {ref.name === null ? ref.activityId : `${ref.name}（${ref.activityId}）`} ·
                当前场地 {ref.currentVenueId ?? '未知'} · 当前时段 {ref.currentSlotText ?? '未知'}
              </li>
            ))}
          </ul>
          <p className="wb-scoring-note">
            未被可靠匹配的活动不在此列；这不表示冲突不存在，也不表示检查通过。
          </p>
        </>
      )}
    </>
  );
}

export default function ResultPanel({
  result,
  errors,
  selectedCandidateKey,
  onSelectCandidate,
  decision,
  dataset
}: ResultPanelProps): ReactElement {
  if (errors.length > 0) {
    return (
      <section className="wb-result wb-result--error" aria-label="输入错误">
        <h3 className="wb-result__title">输入无效，未运行分析</h3>
        <ul className="wb-errors" role="alert">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      </section>
    );
  }

  if (result === null) {
    return (
      <section className="wb-result wb-result--empty" aria-label="分析结果">
        <h3 className="wb-result__title">分析结果</h3>
        <p className="wb-placeholder">
          尚未运行分析。请在左侧选择分析模式并填写变更内容，然后点击「运行调度分析」。
          切换活动、变更类型或修改输入后，上一次的结果会被自动清除。
        </p>
      </section>
    );
  }

  const mode = resolveScoringMode(result.feasible);
  const best = result.feasible.at(0);

  return (
    <section className="wb-result" aria-label="分析结果">
      <header className="wb-result__head">
        <span className="wb-result__source">
          {result.source === 'preset' ? '预置变更 · runScheduling' : '自定义变更分析'}
        </span>
        <span className="wb-result__change">{result.changeId}</span>
        {result.statusLabel !== null && (
          <span className={`wb-result__status wb-result__status--${result.status ?? ''}`}>
            {result.statusLabel}
          </span>
        )}
      </header>

      {result.summary !== null && <p className="wb-result__summary">{result.summary}</p>}
      {result.source === 'custom' && (
        <p className="wb-result__summary wb-result__summary--muted">
          本次为自定义分析：直接检查各候选场地并给出评分与排除原因，不经过预置变更的完整调度流程，
          因此没有汇总结论（summary）与状态标签（status），以下结论均为本次直接分析所得。
          技术说明：由 buildTargetState + evaluateCandidates 生成。
        </p>
      )}

      <h4 className="wb-result__subtitle">推荐方案</h4>
      {best === undefined ? (
        <p className="wb-placeholder">
          没有可行候选，不展示推荐方案。排除候选及原因见下方「被排除候选」。
        </p>
      ) : (
        <article className="wb-reco">
          <p className="wb-reco__line">
            <strong>{best.venueName}</strong>
            <span className="wb-candidate__id">{best.venueId}</span>
            {best.isCurrentVenue && <span className="wb-candidate__tag">当前场地</span>}
            <span className="wb-reco__score">
              {best.score === null ? '' : `总分 ${best.score.total.toFixed(2)}`}
            </span>
          </p>
          <p className="wb-reco__slot">
            时间段 [{best.slot.start}, {best.slot.end})
          </p>
          <p className="wb-reco__basis">
            {result.source === 'preset'
              ? '依据：预置变更的汇总结论与可行候选排序首位。排序采用确定性启发式评分（容量与距离加权），不代表全局最优。'
              : '依据：自定义分析中按确定性启发式评分排序后的首位可行候选；这不是预置变更的推荐结论，也不代表全局最优。'}
          </p>
        </article>
      )}

      <h4 className="wb-result__subtitle">变更前后关键字段对比（输入目标；所选时段见确认摘要）</h4>
      <ComparisonTable result={result} />

      <h4 className="wb-result__subtitle">
        可行候选方案对比（{result.feasible.length} 个）
        {mode !== null && ` · 评分口径：${formatScoringModeLabel(mode)}（整个可行候选集合统一口径）`}
      </h4>
      {result.feasible.length === 0 ? (
        <p className="wb-placeholder">
          无可行候选：全部候选未通过硬约束检查，原因见下方排除清单。硬约束不可用评分抵消。
        </p>
      ) : (
        <>
          <FeasibleTable
            candidates={result.feasible}
            selectedCandidateKey={selectedCandidateKey}
            onSelectCandidate={onSelectCandidate}
          />
          <p className="wb-scoring-note">{SCORING_DISCLAIMER}</p>
          <RankDeltaBlock feasible={result.feasible} />
          <div className="wb-candidates">
            {result.feasible.map((candidate, index) => (
              <CandidateCard
                key={candidate.candidateKey}
                candidate={candidate}
                rank={index + 1}
                selectedCandidateKey={selectedCandidateKey}
                onSelectCandidate={onSelectCandidate}
              />
            ))}
          </div>
        </>
      )}

      {decision}

      <ExclusionSummaryBlock excluded={result.excluded} dataset={dataset} />

      <h4 className="wb-result__subtitle">被排除候选（{result.excluded.length} 个）及原因</h4>
      {result.excluded.length === 0 ? (
        <p className="wb-placeholder">没有被排除的候选。</p>
      ) : (
        <div className="wb-candidates wb-candidates--excluded">
          {result.excluded.map((candidate) => (
            <article key={candidate.candidateKey} className="wb-candidate wb-candidate--excluded">
              <header className="wb-candidate__head">
                <span className="wb-candidate__venue">
                  {candidate.venueName}
                  <span className="wb-candidate__id">{candidate.venueId}</span>
                </span>
                <span className="wb-candidate__score wb-candidate__score--muted">未参与评分</span>
              </header>
              <p className="wb-candidate__slot">时段 [{candidate.slot.start}, {candidate.slot.end})</p>
              <ul className="wb-failures">
                {candidate.evaluation.failureReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}

      <h4 className="wb-result__subtitle">警告（{result.warnings.length} 条）</h4>
      {result.warnings.length === 0 ? (
        <p className="wb-placeholder">无警告。</p>
      ) : (
        <ul className="wb-warnings">
          {result.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      <h4 className="wb-result__subtitle">能力限制（{result.limitations.length} 条）</h4>
      {result.limitations.length === 0 ? (
        <p className="wb-placeholder">
          {result.source === 'custom'
            ? '本次为自定义分析，不生成预置变更的完整能力限制清单；设备与资源相关限制已在上方「警告」中如实说明（引擎原文，含少量英文字段名）。'
            : '无。'}
        </p>
      ) : (
        <>
          <p className="wb-scoring-note">
            以下为引擎原文，逐条界定本系统的能力边界；其中 Activity、Venue、ResourceUnit 等为源码中的数据类型名，
            用于精确指代对应数据，请以每条结论本身为准。
          </p>
          <ul className="wb-limitations">
            {result.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
