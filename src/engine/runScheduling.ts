/**
 * CampusTwin-DEMO · M1-B 调度引擎 —— 编排层
 *
 * 逐条变更驱动候选层与硬约束层，输出结构化调度结果：
 * 变更 ID、活动 ID、可行候选列表、被排除候选及原因、评分解释、限制说明。
 * 本文件不直接引用 Equipment / Venue / ResourceUnit，仅依赖 CampusDataset。
 */

import type { CampusDataset } from '../types/campus';
import type { ActivityChange, ChangeKind } from '../types/change';
import type { ActivityId, ChangeId } from '../types/ids';
import {
  buildTargetState,
  evaluateCandidates,
  type ActivityTargetState,
  type Candidate,
  type CandidateSet
} from './candidates';

export type ChangeStatus =
  | 'scheduled'
  | 'infeasible'
  | 'invalid-change'
  | 'unknown-change'
  | 'unknown-activity';

export interface ChangeSchedulingResult {
  readonly changeId: ChangeId;
  readonly activityId: ActivityId | null;
  readonly changeKind: ChangeKind | null;
  readonly status: ChangeStatus;
  readonly summary: string;
  readonly target: ActivityTargetState | null;
  readonly feasibleCandidates: readonly Candidate[];
  readonly excludedCandidates: readonly Candidate[];
  readonly warnings: readonly string[];
}

export interface SchedulingResult {
  readonly results: readonly ChangeSchedulingResult[];
  readonly limitations: readonly string[];
}

export interface RunSchedulingOptions {
  /** 需要处理的变更 ID；缺省处理数据集中的全部变更。 */
  readonly changeIds?: readonly ChangeId[];
}

export const SCHEDULING_LIMITATIONS: readonly string[] = [
  '设备数量限制：Activity.requiredEquipmentIds 与 Venue.equipmentIds 只表达设备种类，数据集中没有全校可移动设备库存，因此设备约束只检查种类匹配，不检查数量；设备数量的 before 无法验证，只作提示、不作确认。',
  '资源约束按变更后的目标需求数量与 ResourceUnit.available 比较，不做增量扣减；多条变更之间不共享库存扣减，逐条独立评估。',
  '载荷的 payload.before 会与活动当前状态比对（time ↔ currentSlot、venue ↔ currentVenueId、scale ↔ expectedAttendance、resource ↔ 当前资源需求），不一致的可验证 before 会被拒绝。',
  '时间按校园当地 YYYY-MM-DDTHH:mm 处理，不使用浏览器时区转换；仅支持单日活动，跨午夜/跨日活动直接判为不可行。',
  '冲突判断只与其他活动的当前状态比较；候选之间不互相占用，多条变更不做联合求解。',
  '评分为确定性启发式排序（容量适配度 + 距离），不是真实优化，也不代表真实校园路线；距离缺失或非法时不编造距离，候选集合统一评分口径。',
  '本引擎输出为教学演练用模拟结果，不构成真实校园调度建议。'
];

function summarize(
  change: ActivityChange,
  activityName: string,
  candidateSet: CandidateSet,
  status: ChangeStatus
): string {
  const head = `变更 ${change.id}（${change.kind}）→ 活动 ${change.activityId} ${activityName}`;

  if (status === 'scheduled') {
    const best = candidateSet.feasible.at(0);
    const bestText =
      best === undefined
        ? ''
        : `推荐 ${best.venueId} ${best.venueName}，时间段 [${best.slot.start}, ${best.slot.end})，总分 ${String(
            best.score?.total ?? '—'
          )}`;
    return `${head}：可行候选 ${candidateSet.feasible.length} 个、被排除 ${candidateSet.excluded.length} 个；${bestText}`;
  }

  const reasonText = candidateSet.excluded
    .map((item) => `${item.venueId} → ${item.evaluation.failureReasons.join('；')}`)
    .join(' | ');
  return `${head}：无可行候选；${reasonText === '' ? '未产生候选' : reasonText}`;
}

function scheduleChange(dataset: CampusDataset, change: ActivityChange): ChangeSchedulingResult {
  const activity = dataset.activities.find((item) => item.id === change.activityId);

  if (activity === undefined) {
    return {
      changeId: change.id,
      activityId: change.activityId,
      changeKind: change.kind,
      status: 'unknown-activity',
      summary: `变更 ${change.id} 关联的活动 ${change.activityId} 未在数据集中定义，无法调度`,
      target: null,
      feasibleCandidates: [],
      excludedCandidates: [],
      warnings: []
    };
  }

  const outcome = buildTargetState(dataset, change, activity);
  if (outcome.target === null) {
    return {
      changeId: change.id,
      activityId: change.activityId,
      changeKind: change.kind,
      status: 'invalid-change',
      summary: `变更 ${change.id} 的载荷不可用：${outcome.errors.join('；')}`,
      target: null,
      feasibleCandidates: [],
      excludedCandidates: [],
      warnings: outcome.warnings
    };
  }

  const candidateSet = evaluateCandidates(dataset, outcome.target, activity);
  const status: ChangeStatus = candidateSet.feasible.length > 0 ? 'scheduled' : 'infeasible';

  return {
    changeId: change.id,
    activityId: change.activityId,
    changeKind: change.kind,
    status,
    summary: summarize(change, activity.name, candidateSet, status),
    target: outcome.target,
    feasibleCandidates: candidateSet.feasible,
    excludedCandidates: candidateSet.excluded,
    warnings: [...outcome.warnings, ...candidateSet.warnings]
  };
}

/**
 * 调度入口：对所选变更逐条生成候选方案并排序。
 * 纯函数：不修改 dataset，不产生随机结果。
 */
export function runScheduling(
  dataset: CampusDataset,
  options: RunSchedulingOptions = {}
): SchedulingResult {
  const requestedIds = options.changeIds ?? dataset.changes.map((change) => change.id);
  const results: ChangeSchedulingResult[] = [];

  for (const changeId of requestedIds) {
    const change = dataset.changes.find((item) => item.id === changeId);
    if (change === undefined) {
      results.push({
        changeId,
        activityId: null,
        changeKind: null,
        status: 'unknown-change',
        summary: `变更 ${changeId} 未在数据集中定义，无法调度`,
        target: null,
        feasibleCandidates: [],
        excludedCandidates: [],
        warnings: []
      });
      continue;
    }
    results.push(scheduleChange(dataset, change));
  }

  return { results, limitations: SCHEDULING_LIMITATIONS };
}
