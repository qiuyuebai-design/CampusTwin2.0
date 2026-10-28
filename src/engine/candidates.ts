/**
 * CampusTwin-DEMO · M1-B 调度引擎 —— 候选层
 *
 * 职责：把 ActivityChange 应用为"目标状态"（不修改 Activity 与数据集），
 * 生成候选场地集，执行硬约束评估，再对可行候选做确定性评分与稳定排序。
 *
 * 修订说明（M1-B 四轮）：
 * - Venue 从 types/resource.ts 导入（与 Equipment / ResourceUnit 同源）；
 * - 距离仅在"有限且非负"时可用于评分；候选集合统一评分口径，禁止混合；
 * - resource 变更不再假定每种设备当前数量为 1，只做目标状态的设备种类映射，
 *   数量在现有类型模型下无法验证，只报告、不确认；
 * - equipmentAdjustments / resourceAdjustments 逐项防御（不只依赖最终列表兜底）：
 *   形状（含数组中的 undefined / null）→ 同 ID 只允许出现一次（消除顺序依赖）
 *   → 设备 ID 必须在 dataset.equipment 中已定义（after 为 0 或正数均不豁免）；
 * - 调整项逐条先经 readDemandAdjustment 运行期判定再取值，异常输入不抛错；
 * - ActivityTargetState.slot 一律为复制出的新对象，不与输入共享引用。
 *
 * F3-A 方案 B（显式模拟时段目录）：
 * - 枚举开启时候选时段改为读取 dataset.slotCatalog（显式模拟数据），不再动态生成；
 * - 时长与 target.slot 不一致、或不匹配活动/场地的目录条目不进入候选集，并在 warnings 报告；
 * - 基准时段非法或跨日时先回退基准评估（跨日守卫），不让合法目录条目绕过；
 * - generateCandidateSlots / GenerateCandidateSlotsOptions / slotStepMinutes / maxSlots
 *   仅保留供回滚参考，新路径不消费这些选项。
 */

import type { Activity } from '../types/activity';
import type { CampusDataset } from '../types/campus';
import type { ActivityChange, ChangeKind } from '../types/change';
import type { ActivityId, ChangeId, EquipmentId, ResourceId, VenueId } from '../types/ids';
import type { Venue } from '../types/resource';
import type { TimeSlot } from '../types/time';
import {
  evaluateCandidate,
  readDemandAdjustment,
  validateChangePayload,
  validateTimeSlot,
  type CandidateEvaluation,
  type CandidateSpec
} from './constraints';

/** 变更应用后的目标状态（用于生成候选，不代表已应用到 Activity）。 */
export interface ActivityTargetState {
  readonly changeId: ChangeId;
  readonly activityId: ActivityId;
  readonly changeKind: ChangeKind;
  readonly slot: TimeSlot;
  readonly attendance: number;
  readonly requiredCapacity: number;
  readonly requiredEquipmentIds: readonly EquipmentId[];
  readonly resourceNeeds: Readonly<Record<ResourceId, number>>;
  readonly candidateVenueIds: readonly VenueId[];
}

export interface TargetStateOutcome {
  readonly target: ActivityTargetState | null;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export type ScoringMode = 'capacity-and-distance' | 'capacity-only';

export interface CandidateScore {
  readonly capacityFitScore: number;
  readonly distanceMeters: number | null;
  readonly distanceScore: number | null;
  readonly total: number;
  readonly weightMode: ScoringMode;
  readonly explanation: readonly string[];
}

export interface Candidate {
  /** 复合候选身份：`venueId@start~end`。同场地不同时段是不同候选；UI 选择与去重均以此为准。 */
  readonly candidateKey: string;
  readonly venueId: VenueId;
  readonly venueName: string;
  readonly isCurrentVenue: boolean;
  readonly slot: TimeSlot;
  readonly evaluation: CandidateEvaluation;
  readonly score: CandidateScore | null;
}

export interface CandidateSet {
  /** 与全部已评分候选的 weightMode 一致；被排除候选不评分、不参与口径。 */
  readonly scoringMode: ScoringMode;
  readonly feasible: readonly Candidate[];
  readonly excluded: readonly Candidate[];
  readonly warnings: readonly string[];
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 复制时间段对象，保证目标状态不与输入共享时间对象引用。 */
function cloneSlot(slot: TimeSlot): TimeSlot {
  return { start: slot.start, end: slot.end };
}

/** 距离只有在"有限且非负"时才可用于评分；缺失、NaN、Infinity、负数一律视为不可用。 */
export function isUsableDistance(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

/**
 * 把变更载荷应用到活动当前状态，得到目标状态。
 * 只读取 activity 与 dataset，绝不写回；时间对象一律复制。
 * 载荷形状已由 validateChangePayload 拒绝非法项（含数组中的 undefined/null）。
 * resource 变更再逐项防御：同 ID 只允许出现一次；equipmentAdjustments 的 item.id
 * 必须是 dataset.equipment 中已定义的设备（after 为 0 或正数均不豁免）。
 * 逐项均先经 readDemandAdjustment 判定再取值，任何异常输入都不会触发 item.after 抛错。
 */
export function buildTargetState(
  dataset: CampusDataset,
  change: ActivityChange,
  activity: Activity
): TargetStateOutcome {
  const payloadCheck = validateChangePayload(change, activity);
  const warnings: string[] = [...payloadCheck.unverified];
  if (!payloadCheck.ok) {
    return { target: null, errors: [payloadCheck.reason], warnings };
  }

  const errors: string[] = [];
  /** 已报告过的"未定义设备 ID"：逐项校验与最终列表兜底共用，同一 ID 只报一次。 */
  const reportedMissingEquipment = new Set<EquipmentId>();
  const baseEquipment: EquipmentId[] = [...activity.requiredEquipmentIds];
  let slot: TimeSlot = cloneSlot(activity.currentSlot);
  let attendance = activity.expectedAttendance;
  let requiredCapacity = activity.expectedAttendance;
  let requiredEquipmentIds: readonly EquipmentId[] = baseEquipment;
  let resourceNeeds: Readonly<Record<ResourceId, number>> = { ...activity.resourceNeeds };
  let candidateVenueIds: readonly VenueId[] = [activity.currentVenueId];

  switch (change.kind) {
    case 'time': {
      slot = cloneSlot(change.payload.after);
      candidateVenueIds = [activity.currentVenueId];
      warnings.push('time 变更只调整时间段，候选场地固定为活动当前场地（引擎不擅自迁移场地）');
      break;
    }
    case 'venue': {
      const { minCapacity, requiredEquipmentIds: venueRequirement, targetVenueId } = change.payload;
      requiredCapacity = Math.max(activity.expectedAttendance, minCapacity);

      const mergedEquipment: EquipmentId[] = [...baseEquipment];
      for (const id of venueRequirement) {
        if (!mergedEquipment.includes(id)) {
          mergedEquipment.push(id);
        }
      }
      requiredEquipmentIds = mergedEquipment;

      candidateVenueIds =
        targetVenueId !== undefined
          ? [targetVenueId]
          : dataset.venues
              .map((venue) => venue.id)
              .filter((id) => id !== activity.currentVenueId);

      warnings.push('venue 变更沿用活动当前时间段，仅重新选择场地（是否按时段枚举由 evaluateCandidates 选项决定）');
      if (targetVenueId === undefined) {
        warnings.push('venue 变更未指定目标场地，已枚举除当前场地外的全部场地作为候选');
      }
      break;
    }
    case 'scale': {
      attendance = change.payload.after;
      requiredCapacity = change.payload.after;
      candidateVenueIds = [activity.currentVenueId];
      warnings.push('scale 变更仅按 after 人数重新核算容量与资源，场地与时间段保持不变');
      break;
    }
    case 'resource': {
      if (
        !Array.isArray(change.payload.equipmentAdjustments) ||
        !Array.isArray(change.payload.resourceAdjustments)
      ) {
        errors.push("kind='resource' 的载荷必须同时包含 equipmentAdjustments 与 resourceAdjustments 数组");
        break;
      }

      // 只做"目标状态的设备种类映射"：
      // after ≥ 1 → 目标状态请求该设备种类；after = 0 → 目标状态不再请求该种类。
      // 不推断、不假定任何设备数量（包括"每种当前数量为 1"这类假设）。
      //
      // 逐项防御顺序：形状 → 同 ID 重复 → 设备 ID 存在性 → 种类映射。
      // 存在性必须逐项校验：after=0 的未知设备 ID 若只走最终列表兜底会被静默忽略。
      const requestedKinds: EquipmentId[] = [...baseEquipment];
      const seenEquipment = new Set<EquipmentId>();
      for (const item of change.payload.equipmentAdjustments) {
        if (readDemandAdjustment(item) === null) {
          errors.push('变更载荷的 equipmentAdjustments 含非法项，无法生成目标设备种类映射');
          continue;
        }
        if (seenEquipment.has(item.id)) {
          errors.push(`设备 ${item.id} 在 equipmentAdjustments 中重复出现：重复调整会引入顺序依赖，已拒绝`);
          continue;
        }
        seenEquipment.add(item.id);

        if (!dataset.equipment.some((equipment) => equipment.id === item.id)) {
          if (!reportedMissingEquipment.has(item.id)) {
            reportedMissingEquipment.add(item.id);
            errors.push(`设备 ${item.id} 未在数据集中定义`);
          }
          continue;
        }

        const after = item.after;
        if (after >= 1) {
          if (!requestedKinds.includes(item.id)) {
            requestedKinds.push(item.id);
          }
        } else {
          const index = requestedKinds.indexOf(item.id);
          if (index >= 0) {
            requestedKinds.splice(index, 1);
          }
        }
      }
      requiredEquipmentIds = requestedKinds;

      // 资源调整采用一致的防御规则：同 ID 只允许出现一次，避免后写覆盖前写的顺序依赖。
      const mergedNeeds: Record<ResourceId, number> = { ...activity.resourceNeeds };
      const seenResources = new Set<ResourceId>();
      for (const item of change.payload.resourceAdjustments) {
        if (readDemandAdjustment(item) === null) {
          errors.push('变更载荷的 resourceAdjustments 含非法项，无法生成目标资源需求');
          continue;
        }
        if (seenResources.has(item.id)) {
          errors.push(`资源 ${item.id} 在 resourceAdjustments 中重复出现：重复调整会引入顺序依赖，已拒绝`);
          continue;
        }
        seenResources.add(item.id);
        mergedNeeds[item.id] = item.after;
      }
      resourceNeeds = mergedNeeds;
      candidateVenueIds = [activity.currentVenueId];

      warnings.push(
        '设备数量无法验证：Activity.requiredEquipmentIds 与 Venue.equipmentIds 只表达设备种类，没有全校可移动设备库存，也不假定每种设备当前数量为 1；因此只做目标状态的设备种类映射与种类匹配检查，不检查数量。'
      );
      warnings.push(
        '设备 after=0 只表示目标状态不再请求该设备种类，属于请求目标状态的种类映射，不代表真实设备数量为 0，也不代表设备库存已核对。'
      );
      warnings.push(
        '设备 before 无法验证：类型模型不含设备数量，不能伪造当前设备数量，也不作虚假确认。'
      );
      warnings.push(
        '资源需求按变更后的目标数量与 ResourceUnit.available 比较，不做增量扣减，也不跨变更累计。'
      );
      break;
    }
  }

  for (const id of requiredEquipmentIds) {
    if (!reportedMissingEquipment.has(id) && !dataset.equipment.some((item) => item.id === id)) {
      errors.push(`设备 ${id} 未在数据集中定义`);
    }
  }
  for (const key of Object.keys(resourceNeeds)) {
    if (!dataset.resources.some((item) => item.id === key)) {
      errors.push(`资源 ${key} 未在数据集中定义`);
    }
  }

  if (errors.length > 0) {
    return { target: null, errors, warnings };
  }

  return {
    target: {
      changeId: change.id,
      activityId: activity.id,
      changeKind: change.kind,
      slot,
      attendance,
      requiredCapacity,
      requiredEquipmentIds,
      resourceNeeds,
      candidateVenueIds
    },
    errors,
    warnings
  };
}

/**
 * 确定性评分：
 * - 容量适配度 = round(需求 / 容量 × 100, 2)，容量越贴近需求越高；
 * - 距离评分 = round(100 × (1 − min(距离, 1000) / 1000), 2)，距离缺失或非法时不编造；
 * - useDistance=false 或距离不可用时降级为"仅容量适配度"。
 */
export function scoreCandidate(
  venue: Venue,
  requiredCapacity: number,
  useDistance: boolean
): CandidateScore {
  const capacityFitScore =
    venue.capacity > 0 ? roundScore(Math.min(100, (requiredCapacity / venue.capacity) * 100)) : 0;

  const rawDistance: number | undefined = venue.distanceToCenterMeters;
  const distanceMeters: number | null = isUsableDistance(rawDistance) ? rawDistance : null;
  const distanceScore: number | null =
    distanceMeters === null ? null : roundScore(100 * (1 - Math.min(distanceMeters, 1000) / 1000));

  const explanation: string[] = [
    `容量适配度 ${capacityFitScore.toFixed(2)}：目标需求 ${requiredCapacity} 人 / 场地容量 ${venue.capacity} 人（可行候选中容量越贴近需求得分越高）`
  ];

  if (useDistance && distanceScore !== null && distanceMeters !== null) {
    const total = roundScore(0.6 * capacityFitScore + 0.4 * distanceScore);
    explanation.push(
      `距离评分 ${distanceScore.toFixed(2)}：距学生活动中心 ${distanceMeters} 米（0 米 = 100 分，≥1000 米 = 0 分）`
    );
    explanation.push(`总分 ${total.toFixed(2)} = 0.6 × 容量适配度 + 0.4 × 距离评分`);
    return {
      capacityFitScore,
      distanceMeters,
      distanceScore,
      total,
      weightMode: 'capacity-and-distance',
      explanation
    };
  }

  if (!useDistance) {
    explanation.push('候选中存在距离缺失或非法的场地，为保证公平比较仅按容量适配度评分（不编造距离）');
  } else {
    explanation.push('距离缺失或非法（非有限数、负数）：不编造距离，仅按容量适配度评分');
  }
  explanation.push(`总分 ${capacityFitScore.toFixed(2)} = 容量适配度`);

  return {
    capacityFitScore,
    distanceMeters,
    distanceScore: null,
    total: capacityFitScore,
    weightMode: 'capacity-only',
    explanation
  };
}

/**
 * 稳定排序：总分 DESC → 容量适配度 DESC → 距离评分 DESC（null 最后）→ venueId ASC → 时段 start ASC。
 * 末两级键消除同场地多时段并列的不确定性，结果与输入顺序无关。
 */
export function rankCandidates(candidates: readonly Candidate[]): readonly Candidate[] {
  return [...candidates].sort(compareCandidates);
}

function compareCandidates(a: Candidate, b: Candidate): number {
  const aScore = a.score;
  const bScore = b.score;

  if (aScore === null && bScore === null) {
    return compareIds(a.venueId, b.venueId) || compareIds(a.slot.start, b.slot.start);
  }
  if (aScore === null) {
    return 1;
  }
  if (bScore === null) {
    return -1;
  }

  if (bScore.total !== aScore.total) {
    return bScore.total - aScore.total;
  }
  if (bScore.capacityFitScore !== aScore.capacityFitScore) {
    return bScore.capacityFitScore - aScore.capacityFitScore;
  }

  const useDistance = aScore.weightMode === 'capacity-and-distance' &&
    bScore.weightMode === 'capacity-and-distance';
  const aDistance = useDistance ? aScore.distanceScore : null;
  const bDistance = useDistance ? bScore.distanceScore : null;
  if (aDistance === null && bDistance !== null) {
    return 1;
  }
  if (aDistance !== null && bDistance === null) {
    return -1;
  }
  if (aDistance !== null && bDistance !== null && aDistance !== bDistance) {
    return bDistance - aDistance;
  }

  return compareIds(a.venueId, b.venueId) || compareIds(a.slot.start, b.slot.start);
}

function compareIds(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/** 复合候选身份：`venueId@start~end`，用于选择、去重与排序末级键。 */
export function makeCandidateKey(venueId: VenueId, slot: TimeSlot): string {
  return `${venueId}@${slot.start}~${slot.end}`;
}

/** 同一自然日内的时长（分钟）：HH:mm 之差。仅在已通过单日合法性守卫后使用。 */
function durationMinutes(slot: TimeSlot): number {
  const toMinutes = (clock: string): number =>
    Number(clock.slice(11, 13)) * 60 + Number(clock.slice(14, 16));
  return toMinutes(slot.end) - toMinutes(slot.start);
}

/** 时段枚举参数。 */
export interface GenerateCandidateSlotsOptions {
  /** 起点步长（分钟），默认 60，最小 15。 */
  readonly stepMinutes?: number;
  /** 生成时段条数上限，默认 9，最小 1。 */
  readonly maxSlots?: number;
}

/**
 * 由基准时段生成同日可选候选时段：日期与活动时长取自 base，
 * 起点按步长递增，全部截断到当日 22:00（候选晚于 22:00 不生成）。
 * 非法输入（非单日 / 时长 ≤ 0）不生成时段，返回空数组（由调用方保持既有行为或展示无候选）。
 * 纯函数、确定性；跨日时段在此被拒绝，不进入候选。
 */
export function generateCandidateSlots(
  base: TimeSlot,
  options: GenerateCandidateSlotsOptions = {}
): readonly TimeSlot[] {
  if (base.start.slice(0, 10) !== base.end.slice(0, 10)) {
    return [];
  }
  const durationMs =
    Date.parse(base.end.replace(' ', 'T')) - Date.parse(base.start.replace(' ', 'T'));
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return [];
  }

  const stepMinutes = Math.max(15, Math.floor(options.stepMinutes ?? 60));
  const maxSlots = Math.max(1, Math.floor(options.maxSlots ?? 9));
  const day = base.start.slice(0, 10);
  const baseStartMs = Date.parse(base.start);
  const limitMs = Date.parse(`${day}T22:00`);
  if (!Number.isFinite(baseStartMs) || !Number.isFinite(limitMs)) {
    return [];
  }

  const slots: TimeSlot[] = [];
  for (let index = 0; index < maxSlots; index += 1) {
    const startMs = baseStartMs + index * stepMinutes * 60_000;
    const endMs = startMs + durationMs;
    if (startMs >= limitMs || endMs > limitMs) {
      break;
    }
    const start = formatSlotTime(startMs);
    const end = formatSlotTime(endMs);
    if (start === null || end === null || start >= end) {
      break;
    }
    slots.push({ start, end });
  }
  return slots;
}

function formatSlotTime(ms: number): string | null {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const pad = (value: number): string => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export interface EvaluateCandidatesOptions {
  /**
   * 为 true 时：从 dataset.slotCatalog 读取显式模拟时段目录，
   * 与场地做组合候选；默认 false（单时段，保持既有预置/M1-E 行为）。
   */
  readonly enumerateSlots?: boolean;
  /**
   * @deprecated 方案 A 动态生成遗留项，仅供回滚参考。
   * 方案 B 新路径（读取 slotCatalog）不消费该选项。
   */
  readonly slotStepMinutes?: number;
  /**
   * @deprecated 方案 A 动态生成遗留项，仅供回滚参考。
   * 方案 B 新路径（读取 slotCatalog）不消费该选项。
   */
  readonly maxSlots?: number;
}

/**
 * 评估目标状态的全部候选（场地 × 时段），硬约束过滤后评分排序。
 * 评分口径在全部可行候选之间统一：只要有一个可行候选的距离缺失或非法，
 * 整个候选集合就降级为 capacity-only，禁止混合评分口径。
 * 相同 venueId + 时段的候选在生成层去重；不同时间段不互相去重。
 */
export function evaluateCandidates(
  dataset: CampusDataset,
  target: ActivityTargetState,
  activity: Activity,
  options: EvaluateCandidatesOptions = {}
): CandidateSet {
  const warnings: string[] = [];
  const evaluated: Candidate[] = [];

  /**
   * 枚举模式（方案 B：读取显式模拟时段目录）下按候选场地分组的时段。
   * null = 目录缺失、过滤后为空、或基准时段非法/跨日 → 回退基准时段评估。
   * 默认模式（enumerateSlots !== true）保持单时段语义，不读目录。
   */
  let slotsByVenue: ReadonlyMap<VenueId, readonly TimeSlot[]> | null = null;
  let fallbackReason = '基准时段非法或跨日';
  if (options.enumerateSlots === true) {
    // 跨日守卫（方案甲）：基准时段必须合法、start/end 同一自然日，否则直接回退基准评估，
    // 不读取目录，不让合法目录条目绕过该守卫。守卫条件与方案 A generateCandidateSlots 的前置一致。
    const baseValidation = validateTimeSlot(target.slot);
    const baseSingleDay = target.slot.start.slice(0, 10) === target.slot.end.slice(0, 10);
    if (baseValidation.ok && baseSingleDay) {
      const baseDuration = durationMinutes(target.slot);
      const applicable = (dataset.slotCatalog ?? []).filter(
        (item) =>
          item.activityId === target.activityId &&
          (item.venueId === undefined || target.candidateVenueIds.includes(item.venueId))
      );
      fallbackReason = dataset.slotCatalog === undefined
        ? '模拟时段目录缺失'
        : dataset.slotCatalog.length === 0
          ? '模拟时段目录为空'
          : applicable.length === 0
            ? '目录中没有匹配当前活动与候选场地的条目'
            : '目录条目的时长均与目标时段不一致';
      let durationMismatched = 0;
      const grouped = new Map<VenueId, TimeSlot[]>();
      for (const item of applicable) {
        if (validateTimeSlot(item.slot).ok) {
          // 时长必须与 target.slot 时长一致：不一致条目在过滤期剔除（不进入候选集），仅计数后报告。
          if (durationMinutes(item.slot) !== baseDuration) {
            durationMismatched += 1;
            continue;
          }
        }
        // 非法时间/跨日条目不过滤期剔除，进入候选后由 evaluateCandidate 的 slot-valid
        // 硬约束判为不可行，落为 excluded（score = null），不得成为可行候选。
        const slot: TimeSlot = { start: item.slot.start, end: item.slot.end };
        // venueId 缺省 → 与全部候选场地组合；指定 → 只与该场地组合。
        const pairedVenueIds: readonly VenueId[] =
          item.venueId === undefined ? target.candidateVenueIds : [item.venueId];
        for (const pairedVenueId of pairedVenueIds) {
          const list = grouped.get(pairedVenueId);
          if (list === undefined) {
            grouped.set(pairedVenueId, [slot]);
          } else {
            list.push(slot);
          }
        }
      }
      if (durationMismatched > 0) {
        warnings.push(
          `显式模拟时段目录中 ${durationMismatched} 条与目标时段时长不一致，已排除（不进入候选集；目录条目仅为模拟时段，不代表真实空闲、真实预约或已获场地批准）`
        );
      }
      slotsByVenue = grouped.size > 0 ? grouped : null;
    }
    if (slotsByVenue === null) {
      warnings.push(`可选时段枚举结果为空（${fallbackReason}），退回基准时段评估`);
    }
  }

  const seenKeys = new Set<string>();

  for (const venueId of target.candidateVenueIds) {
    const venue = dataset.venues.find((item) => item.id === venueId);
    // 枚举模式下按场地取目录时段（该场地无条目则不为其产出候选）；默认/回退模式为基准单时段。
    const effectiveSlots: readonly TimeSlot[] =
      options.enumerateSlots !== true || slotsByVenue === null
        ? [target.slot]
        : slotsByVenue.get(venueId) ?? [];
    for (const slot of effectiveSlots) {
      const candidateKey = makeCandidateKey(venueId, slot);
      if (seenKeys.has(candidateKey)) {
        continue;
      }
      seenKeys.add(candidateKey);

      const spec: CandidateSpec = {
        venueId,
        slot,
        attendance: target.attendance,
        requiredCapacity: target.requiredCapacity,
        requiredEquipmentIds: target.requiredEquipmentIds,
        resourceNeeds: target.resourceNeeds
      };
      const evaluation = evaluateCandidate(dataset, spec, activity.id);

      evaluated.push({
        candidateKey,
        venueId,
        venueName: venue === undefined ? '（未在数据集中定义）' : venue.name,
        isCurrentVenue: venueId === activity.currentVenueId,
        slot,
        evaluation,
        score: null
      });
    }
  }

  const feasiblePool = evaluated.filter((item) => item.evaluation.passed);
  const excluded = [...evaluated.filter((item) => !item.evaluation.passed)].sort((a, b) =>
    compareIds(a.candidateKey, b.candidateKey)
  );

  // 只有可行候选参与评分与排序；被排除候选 score=null，不参与评分口径。
  // 空可行集时没有评分候选，scoringMode 报 capacity-only 不与任何候选冲突。
  const useDistance =
    feasiblePool.length > 0 &&
    feasiblePool.every((item) => {
      const venue = dataset.venues.find((candidate) => candidate.id === item.venueId);
      return venue !== undefined && isUsableDistance(venue.distanceToCenterMeters);
    });

  if (feasiblePool.length > 0 && !useDistance) {
    warnings.push(
      '候选中存在 distanceToCenterMeters 缺失或非法（非有限数、负数）的可行候选，评分统一降级为仅容量适配度（不编造距离，禁止混合评分口径）'
    );
  }

  const scored: Candidate[] = [];
  for (const item of feasiblePool) {
    const venue = dataset.venues.find((candidate) => candidate.id === item.venueId);
    if (venue === undefined) {
      continue;
    }
    scored.push({
      ...item,
      score: scoreCandidate(venue, target.requiredCapacity, useDistance)
    });
  }

  return {
    scoringMode: useDistance ? 'capacity-and-distance' : 'capacity-only',
    feasible: rankCandidates(scored),
    excluded,
    warnings
  };
}
