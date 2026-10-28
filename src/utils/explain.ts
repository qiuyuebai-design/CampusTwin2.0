/**
 * CampusTwin-DEMO · F3-B 第一阶段 · 候选对比解释与排除原因聚合 · 纯函数模块
 *
 * 职责边界：
 * 1. 只读消费 engine 的真实类型（Candidate / ConstraintCode / CampusDataset），
 *    不依赖 React、components/ResultPanel、utils/decision、utils/changeForm；
 * 2. 不修改、复制或重写 failureReasons 文案（排除原因文案恒为引擎原文，本模块只读 checks）；
 * 3. 排名差值为"部分解释"（partialExplain 恒为 true）：只描述实际排序键的数值差异，
 *    不做因果归因、不宣称全局最优；不为 excluded（score = null）候选伪造评分；
 * 4. 冲突活动补全只解析 slot-conflict-free 失败检查的既有 detail 格式，
 *    解析失败不抛错、不改变任何既有排除结果，匹配不上时保留原始活动 ID、其余字段为 null；
 * 5. 无 any、无不必要类型断言；输入只读，输出为新结构，确定性可重复。
 */

import type { Candidate, CandidateScore } from '../engine/candidates';
import type { ConstraintCode } from '../engine/constraints';
import type { CampusDataset } from '../types/campus';
import type { ActivityId, VenueId } from '../types/ids';

/* ---------- B1：排名差值（部分解释） ---------- */

/**
 * 排序原因（部分解释）：仅描述 compareCandidates 相邻两级键中"实际出现差异"的第一级。
 * 不表示因果归因；'tie' 表示前三级键全平（引擎随后按 venueId / 时段 start 稳定序决胜）。
 */
export type RankDeltaReason = 'total' | 'capacityFitScore' | 'distanceScore' | 'tie';

export interface RankDelta {
  readonly candidateKey: string;
  readonly venueId: VenueId;
  /** 1-based 位次 = 输入数组下标 + 1；函数不重排。 */
  readonly rank: number;
  /** 上位候选位次；首名为 null。 */
  readonly vsRank: number | null;
  readonly vsCandidateKey: string | null;
  /** 上位候选 − 当前候选（两位小数）；任一侧缺值（含 score = null）为 null。 */
  readonly totalDelta: number | null;
  readonly capacityDelta: number | null;
  /** 任一侧 distanceScore 为 null（含 capacity-only 口径）→ null，不编造。 */
  readonly distanceDelta: number | null;
  /** 恒为 true：排序原因只到键级差异，非完整因果解释。 */
  readonly partialExplain: true;
  readonly reason: RankDeltaReason;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function reasonBetween(above: CandidateScore, current: CandidateScore): RankDeltaReason {
  if (above.total !== current.total) {
    return 'total';
  }
  if (above.capacityFitScore !== current.capacityFitScore) {
    return 'capacityFitScore';
  }
  if (above.weightMode === 'capacity-and-distance' &&
      current.weightMode === 'capacity-and-distance' &&
      above.distanceScore !== current.distanceScore) {
    return 'distanceScore';
  }
  return 'tie';
}

/**
 * 为已排序（或任一顺序）的候选数组生成逐位差值行：
 * 方向恒为「上位候选 − 当前候选」，保留两位小数；
 * 不重排、不修改输入；score 为 null 的候选不伪造评分（delta 全 null，reason = 'tie'）。
 */
export function explainRankDeltas(feasible: readonly Candidate[]): readonly RankDelta[] {
  const rows: RankDelta[] = [];

  for (let index = 0; index < feasible.length; index += 1) {
    const current = feasible[index];
    const above = index === 0 ? null : feasible[index - 1];
    const currentScore = current.score;
    const aboveScore = above === null ? null : above.score;
    const hasScores = currentScore !== null && aboveScore !== null;

    const totalDelta =
      hasScores && aboveScore !== null && currentScore !== null
        ? round2(aboveScore.total - currentScore.total)
        : null;
    const capacityDelta =
      hasScores && aboveScore !== null && currentScore !== null
        ? round2(aboveScore.capacityFitScore - currentScore.capacityFitScore)
        : null;
    const distanceDelta =
      hasScores &&
      aboveScore !== null &&
      currentScore !== null &&
      aboveScore.weightMode === 'capacity-and-distance' &&
      currentScore.weightMode === 'capacity-and-distance' &&
      aboveScore.distanceScore !== null &&
      currentScore.distanceScore !== null
        ? round2(aboveScore.distanceScore - currentScore.distanceScore)
        : null;
    const reason =
      hasScores && aboveScore !== null && currentScore !== null
        ? reasonBetween(aboveScore, currentScore)
        : 'tie';

    rows.push({
      candidateKey: current.candidateKey,
      venueId: current.venueId,
      rank: index + 1,
      vsRank: index === 0 ? null : index,
      vsCandidateKey: above === null ? null : above.candidateKey,
      totalDelta,
      capacityDelta,
      distanceDelta,
      partialExplain: true,
      reason
    });
  }

  return rows;
}

/* ---------- B1：排除原因聚合（只读 checks，不触碰 failureReasons） ---------- */

export interface ExcludeGroup {
  readonly code: ConstraintCode;
  /** 该 code 在引擎中的固定 label（取自首个失败检查，只读）。 */
  readonly label: string;
  /** 口径①：涉及候选数——至少因该 code 失败一次的候选数（候选内去重）。 */
  readonly candidateCount: number;
  /** 口径②：失败检查数——checks 中 status='failed' 且 code 相同的次数（不去重）。 */
  readonly failureCount: number;
  /** 该组候选 key，按输入顺序保序去重。 */
  readonly candidateKeys: readonly string[];
}

export interface ExcludeSummary {
  readonly totalCandidates: number;
  readonly groups: readonly ExcludeGroup[];
}

const EMPTY_SUMMARY: ExcludeSummary = Object.freeze({
  totalCandidates: 0,
  groups: Object.freeze([])
});

interface MutableGroup {
  readonly code: ConstraintCode;
  readonly label: string;
  candidateCount: number;
  failureCount: number;
  readonly seenCandidates: Set<string>;
}

/**
 * 按 code 聚合被排除候选的失败检查。
 * 只读 evaluation.checks（status = 'failed'）；空输入返回稳定空结构；
 * 分组顺序：failureCount DESC → code ASC（确定性）。
 */
export function summarizeExclusions(excluded: readonly Candidate[]): ExcludeSummary {
  if (excluded.length === 0) {
    return EMPTY_SUMMARY;
  }

  const mutableGroups = new Map<ConstraintCode, MutableGroup>();

  for (const candidate of excluded) {
    const seenCodesForCandidate = new Set<ConstraintCode>();

    for (const check of candidate.evaluation.checks) {
      if (check.status !== 'failed') {
        continue;
      }

      let group = mutableGroups.get(check.code);
      if (group === undefined) {
        group = {
          code: check.code,
          label: check.label,
          candidateCount: 0,
          failureCount: 0,
          seenCandidates: new Set<string>()
        };
        mutableGroups.set(check.code, group);
      }

      group.failureCount += 1;
      if (!seenCodesForCandidate.has(check.code)) {
        seenCodesForCandidate.add(check.code);
        group.candidateCount += 1;
        group.seenCandidates.add(candidate.candidateKey);
      }
    }
  }

  const groups: ExcludeGroup[] = [...mutableGroups.values()]
    .map((group) => ({
      code: group.code,
      label: group.label,
      candidateCount: group.candidateCount,
      failureCount: group.failureCount,
      candidateKeys: [...group.seenCandidates]
    }))
    .sort(
      (left, right) =>
        right.failureCount - left.failureCount ||
        (left.code < right.code ? -1 : left.code > right.code ? 1 : 0)
    );

  return {
    totalCandidates: excluded.length,
    groups
  };
}

/* ---------- B1：冲突活动只读补全 ---------- */

export interface ConflictActivityRef {
  readonly activityId: ActivityId;
  /** true = 在 dataset.activities 中可靠匹配；false = 仅保留原始 ID，其余字段 null。 */
  readonly resolved: boolean;
  readonly name: string | null;
  readonly currentVenueId: VenueId | null;
  readonly currentSlotText: string | null;
}

const UNRESOLVED_NULLS = {
  name: null,
  currentVenueId: null,
  currentSlotText: null
};

/**
 * 按活动 ID 只读匹配 dataset.activities：
 * 找不到 → 保留 activityId 原文、resolved=false、其余字段 null（不编造）；
 * 重复 ID 保序去重；空输入返回空数组。
 */
export function resolveConflictActivities(
  dataset: Pick<CampusDataset, 'activities'>,
  ids: readonly ActivityId[]
): readonly ConflictActivityRef[] {
  const results: ConflictActivityRef[] = [];
  const seen = new Set<string>();

  for (const id of ids) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);

    const activity = dataset.activities.find((item) => item.id === id);
    if (activity === undefined) {
      results.push({ activityId: id, resolved: false, ...UNRESOLVED_NULLS });
      continue;
    }
    results.push({
      activityId: id,
      resolved: true,
      name: activity.name,
      currentVenueId: activity.currentVenueId,
      currentSlotText: `${activity.currentSlot.start} → ${activity.currentSlot.end}`
    });
  }

  return results;
}

/** findSlotConflicts 既有 detail 前缀（constraints.ts 原文，解析只认这一种格式）。 */
const CONFLICT_DETAIL_PREFIX = '与同场地活动 ';
/** findSlotConflicts 既有 detail 后缀（constraints.ts 原文）。 */
const CONFLICT_DETAIL_SUFFIX = ' 的时间段重叠（半开区间 [start, end)）';

/**
 * 从一条 slot-conflict-free 失败检查的 detail 中提取活动 ID。
 * 只认引擎既有格式：`与同场地活动 <id、id…> 的时间段重叠（半开区间 [start, end)）`；
 * 格式不匹配返回 []；每个 ID 还必须能在 dataset.activities 中找到、
 * 且 currentVenueId 与候选场地一致（不满足则丢弃，不猜测）。绝不抛错。
 */
function extractConflictIds(
  detail: string,
  dataset: Pick<CampusDataset, 'activities'>,
  candidateVenueId: VenueId
): readonly ActivityId[] {
  if (!detail.startsWith(CONFLICT_DETAIL_PREFIX) || !detail.endsWith(CONFLICT_DETAIL_SUFFIX)) {
    return [];
  }
  const middle = detail.slice(
    CONFLICT_DETAIL_PREFIX.length,
    detail.length - CONFLICT_DETAIL_SUFFIX.length
  );
  if (middle === '') {
    return [];
  }

  const extracted: ActivityId[] = [];
  for (const token of middle.split('、')) {
    const activity = dataset.activities.find(
      (item) => item.id === token && item.currentVenueId === candidateVenueId
    );
    if (activity !== undefined && !extracted.includes(activity.id)) {
      extracted.push(activity.id);
    }
  }
  return extracted;
}

export interface ExclusionOverview {
  readonly summary: ExcludeSummary;
  /** 所有冲突失败检查中可靠匹配到的活动（保序去重）。 */
  readonly conflictRefs: readonly ConflictActivityRef[];
}

/**
 * 排除总览 = 聚合摘要 + 冲突活动补全。
 * 解析失败或匹配不可靠时该条不贡献活动 ID（conflictRefs 变短），
 * 既不抛错，也不改变任何既有排除结果与文案。
 */
export function buildExclusionOverview(
  excluded: readonly Candidate[],
  dataset: Pick<CampusDataset, 'activities'>
): ExclusionOverview {
  const summary = summarizeExclusions(excluded);

  const ids: ActivityId[] = [];
  const seenIds = new Set<string>();

  for (const candidate of excluded) {
    for (const check of candidate.evaluation.checks) {
      if (check.status !== 'failed' || check.code !== 'slot-conflict-free') {
        continue;
      }
      for (const id of extractConflictIds(check.detail, dataset, candidate.venueId)) {
        if (!seenIds.has(id)) {
          seenIds.add(id);
          ids.push(id);
        }
      }
    }
  }

  return { summary, conflictRefs: resolveConflictActivities(dataset, ids) };
}
