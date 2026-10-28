/**
 * CampusTwin-DEMO · M1-E 决策确认与执行清单 · 纯函数模块
 *
 * 职责边界：
 * 1. 仅消费真实 Activity / ActivityTargetState / Candidate / CampusDataset，不修改入参；
 * 2. 不使用 any / 宽泛断言，不虚构设备数量、预约状态、通知状态或资源分配结果；
 * 3. 所有生成文案为本地模拟措辞，禁止出现"已预约/已通知/已分配"等已执行语义；
 * 4. 无 React / DOM 依赖，可在 node 环境单测。
 */

import type { ActivityTargetState, Candidate } from '../engine/candidates';
import type { ResultView } from '../components/ResultPanel';
import type { Activity } from '../types/activity';
import type { CampusDataset } from '../types/campus';
import type { EquipmentId, ResourceId } from '../types/ids';

/** 本地模拟声明：M1-E 不具备任何真实执行能力，固定文案不可改写为已执行语义。 */
export const SIMULATION_NOTICE =
  '本地模拟：方案可在本机浏览器持久化保存；未执行真实预约、通知或设备分配。';

/** 确认摘要行：字段名 + 真实值文案（均来自入参真实数据）。 */
export interface ConfirmationSummaryRow {
  readonly label: string;
  readonly value: string;
}

/** 执行清单事项分类。 */
export type ChecklistKind = 'system' | 'manual';

/** 待人工确认事项的稳定键（保证清单 ID 唯一且跨渲染稳定）。 */
export type ManualConfirmKey =
  | 'venue-availability'
  | 'equipment-in-place'
  | 'resources-prepared'
  | 'staff-informed'
  | 'attendees-notified'
  | 'final-approval';

export interface ChecklistItem {
  /** 稳定唯一 ID：system 项为 `sys-*`，manual 项为 `manual-*` */
  readonly id: string;
  readonly kind: ChecklistKind;
  readonly label: string;
  readonly detail: string;
  /** 仅由 withCheckedState 生成；直接构建的项默认未勾选 */
  readonly checked: boolean;
}

const MANUAL_LABELS: Readonly<Record<ManualConfirmKey, string>> = {
  'venue-availability': '场地实际可用性确认（人工）',
  'equipment-in-place': '设备到位确认（人工，模型无设备数量，仅核对种类）',
  'resources-prepared': '资源准备确认（人工）',
  'staff-informed': '相关人员知悉确认（人工，未自动通知）',
  'attendees-notified': '参与人员通知确认（人工，未自动通知）',
  'final-approval': '最终方案确认（人工拍板）'
};

const MANUAL_ORDER: readonly ManualConfirmKey[] = [
  'venue-availability',
  'equipment-in-place',
  'resources-prepared',
  'staff-informed',
  'attendees-notified',
  'final-approval'
];

/**
 * 选择有效性：所选复合候选 key（场地@时段）必须存在于当前 result 的可行候选中，
 * 且本次分析已产出目标状态与关联活动（无效载荷 / 未知活动不产生决策）。
 * 同场地不同时段是不同选择，按 candidateKey 区分。
 */
export function isSelectionValid(
  result: ResultView | null,
  candidateKey: string | null
): boolean {
  if (result === null || candidateKey === null) {
    return false;
  }
  if (result.target === null || result.activity === null) {
    return false;
  }
  return result.feasible.some((candidate) => candidate.candidateKey === candidateKey);
}

/** 从可行候选中取出所选候选；无效选择返回 null。 */
export function findSelectedCandidate(
  result: ResultView | null,
  candidateKey: string | null
): Candidate | null {
  if (!isSelectionValid(result, candidateKey) || result === null || candidateKey === null) {
    return null;
  }
  return result.feasible.find((candidate) => candidate.candidateKey === candidateKey) ?? null;
}

/**
 * 分析身份签名：绑定"这一次分析"，防止相同 changeId + venueId 的旧选择复活。
 * 覆盖：来源路径、变更、状态、目标状态关键字段、关联活动、可行候选集合（含顺序）。
 */
export function analysisSignature(result: ResultView | null): string {
  if (result === null) {
    return 'no-result';
  }
  const feasibleKeys = result.feasible.map((candidate) => candidate.candidateKey).join(',');
  const target = result.target;
  const targetPart =
    target === null
      ? 'target:null'
      : [
          target.changeId,
          target.activityId,
          target.changeKind,
          `${target.slot.start}/${target.slot.end}`,
          String(target.attendance),
          String(target.requiredCapacity),
          Object.keys(target.resourceNeeds)
            .sort()
            .map((key) => `${key}=${target.resourceNeeds[key as ResourceId]}`)
            .join('|')
        ].join(';');
  return [
    result.source,
    result.changeId,
    result.status ?? 'no-status',
    result.activity?.id ?? 'no-activity',
    targetPart,
    `candidates:[${feasibleKeys}]`,
    JSON.stringify({ target: result.target, feasible: result.feasible, excluded: result.excluded })
  ].join('#');
}

/** 确认摘要：全部字段来自真实入参；缺失元数据明确降级，不编造。 */
export function buildConfirmationSummary(
  activity: Activity,
  target: ActivityTargetState,
  candidate: Candidate,
  dataset: CampusDataset
): readonly ConfirmationSummaryRow[] {
  const venue = dataset.venues.find((item) => item.id === candidate.venueId);

  const equipmentText =
    target.requiredEquipmentIds
      .map((id: EquipmentId) => {
        const unit = dataset.equipment.find((item) => item.id === id);
        return unit === undefined ? `${id}（设备名称缺失）` : `${unit.name}（${id}）`;
      })
      .join('、') || '（无设备需求）';

  const resourceText =
    Object.keys(target.resourceNeeds)
      .sort()
      .map((rawId) => {
        const id = rawId as ResourceId;
        const amount = target.resourceNeeds[id];
        const unit = dataset.resources.find((item) => item.id === id);
        if (unit === undefined) {
          return `${id} × ${amount}（资源名称缺失）`;
        }
        return `${unit.name}：需求 ${amount} / 可用 ${unit.available}`;
      })
      .join('；') || '（无资源需求）';

  const capacityText =
    venue === undefined
      ? `${target.requiredCapacity} 人（场地容量信息缺失）`
      : `${target.requiredCapacity} 人（场地容量 ${venue.capacity} 人）`;

  const scoreText =
    candidate.score === null
      ? '—（该候选无评分）'
      : `${candidate.score.total.toFixed(2)}（口径：${
          candidate.score.weightMode === 'capacity-and-distance' ? '容量 + 距离' : '仅容量适配度'
        }）`;

  return [
    {
      label: '场地',
      value: `${candidate.venueName}（${candidate.venueId}）${
        candidate.isCurrentVenue ? '（当前场地）' : ''
      }`
    },
    { label: '目标时段', value: `${candidate.slot.start} → ${candidate.slot.end}` },
    { label: '基准时段（目标状态）', value: `${target.slot.start} → ${target.slot.end}` },
    { label: '预计参与人数', value: `${target.attendance} 人` },
    { label: '容量需求', value: capacityText },
    { label: '设备种类', value: equipmentText },
    { label: '资源需求', value: resourceText },
    { label: '活动（变更前）', value: `${activity.id} · ${activity.name}` },
    { label: '评分', value: scoreText }
  ];
}

function buildSystemItems(
  target: ActivityTargetState,
  candidate: Candidate,
  dataset: CampusDataset
): readonly ChecklistItem[] {
  const venue = dataset.venues.find((item) => item.id === candidate.venueId);

  const resourceDetails =
    Object.keys(target.resourceNeeds)
      .sort()
      .map((rawId) => {
        const id = rawId as ResourceId;
        const amount = target.resourceNeeds[id];
        const unit = dataset.resources.find((item) => item.id === id);
        if (unit === undefined) {
          return `${id} × ${amount}（资源名称缺失，可用量未知）`;
        }
        return `${unit.name}：需求 ${amount} / 可用 ${unit.available}`;
      })
      .join('；') || '无资源需求';

  const equipmentDetails =
    target.requiredEquipmentIds
      .map((id: EquipmentId) => {
        const unit = dataset.equipment.find((item) => item.id === id);
        return unit === undefined ? `${id}（设备名称缺失）` : `${unit.name}（${id}）`;
      })
      .join('、') || '无设备需求';

  return [
    {
      id: 'sys-target',
      kind: 'system',
      label: '目标状态（引擎输出）',
      detail: `时段 ${target.slot.start} → ${target.slot.end}；预计 ${target.attendance} 人；容量需求 ${target.requiredCapacity} 人`,
      checked: false
    },
    {
      id: 'sys-venue',
      kind: 'system',
      label: '候选场地（引擎输出）',
      detail:
        venue === undefined
          ? `${candidate.venueName}（${candidate.venueId}，场地容量信息缺失）`
          : `${venue.name}（${venue.id}），容量 ${venue.capacity} 人，开放 ${venue.openFrom}–${venue.openTo}，距中心 ${venue.distanceToCenterMeters ?? '未知'} 米`,
      checked: false
    },
    {
      id: 'sys-slot',
      kind: 'system',
      label: '所选时段（候选身份）',
      detail: `候选 key ${candidate.candidateKey}：[${candidate.slot.start}, ${candidate.slot.end}) 半开区间`,
      checked: false
    },
    {
      id: 'sys-resources',
      kind: 'system',
      label: '资源需求与可用量对照',
      detail: resourceDetails,
      checked: false
    },
    {
      id: 'sys-equipment',
      kind: 'system',
      label: '设备种类清单（模型无数量字段，仅种类）',
      detail: equipmentDetails,
      checked: false
    },
    {
      id: 'sys-scoring',
      kind: 'system',
      label: '评分与约束结论',
      detail:
        candidate.score === null
          ? '该候选无评分'
          : `总分 ${candidate.score.total.toFixed(2)}，口径 ${
              candidate.score.weightMode === 'capacity-and-distance' ? '容量 + 距离' : '仅容量适配度'
            }；硬约束 ${candidate.evaluation.checks.filter((check) => check.status === 'passed').length}/${
              candidate.evaluation.checks.length
            } 通过。评分为确定性启发式排序，不保证全局最优。`,
      checked: false
    }
  ];
}

function buildManualItems(): readonly ChecklistItem[] {
  return MANUAL_ORDER.map((key) => ({
    id: `manual-${key}`,
    kind: 'manual' as const,
    label: MANUAL_LABELS[key],
    detail: '需人工在真实场景中确认；本页面勾选仅记录本地模拟状态。',
    checked: false
  }));
}

/**
 * 结构化执行清单：系统生成的信息（客观、来自引擎与数据集）+ 待人工确认事项。
 * 事项 ID 稳定唯一；不包含任何已执行语义。
 */
export function buildChecklistItems(
  target: ActivityTargetState,
  candidate: Candidate,
  dataset: CampusDataset
): readonly ChecklistItem[] {
  return [...buildSystemItems(target, candidate, dataset), ...buildManualItems()];
}

/**
 * 不可变勾选更新：未知 itemId 返回原数组引用（不误改其他事项）；
 * 已勾选则取消、未勾选则勾选。
 */
export function toggleChecklistItem(
  items: readonly ChecklistItem[],
  checkedIds: readonly string[],
  itemId: string
): readonly string[] {
  if (!items.some((item) => item.id === itemId)) {
    return checkedIds;
  }
  return checkedIds.includes(itemId)
    ? checkedIds.filter((id) => id !== itemId)
    : [...checkedIds, itemId];
}

/** 把勾选状态合并进清单项（仅读取 checkedIds，不修改入参）。 */
export function withCheckedState(
  items: readonly ChecklistItem[],
  checkedIds: readonly string[]
): readonly ChecklistItem[] {
  return items.map((item) => ({ ...item, checked: checkedIds.includes(item.id) }));
}
