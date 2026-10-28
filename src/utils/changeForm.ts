/**
 * CampusTwin-DEMO · M1-C 工作台 · 表单纯函数模块
 *
 * 职责边界：
 * 1. 只做"必填项 / 输入格式 / 基础范围"的前端校验，不复制 src/engine 的业务约束判断；
 * 2. 构造真实 ActivityChange（kind 判别联合），before 字段一律取自活动当前状态；
 * 3. 状态中文映射与预置变更选项映射均为纯函数，可在 node 环境单测。
 */

import type { ActivityTargetState, Candidate, ScoringMode } from '../engine/candidates';
import type { ChangeStatus } from '../engine/runScheduling';
import type { Activity } from '../types/activity';
import type { ActivityChange, ChangeKind, DemandAdjustment } from '../types/change';
import type { ActivityId, ChangeId, EquipmentId, ResourceId, VenueId } from '../types/ids';

/** 工作台自定义变更的预览 ID（不写入 dataset.changes，仅用于构建载荷）。 */
export const FORM_CHANGE_ID: ChangeId = 'chg-form01';

/** 自定义变更的请求人标识（模拟角色）。 */
export const WORKBENCH_REQUESTER = 'role-workbench-01';

/** 表单模式：预置变更（runScheduling）/ 自定义变更（buildTargetState + evaluateCandidates）。 */
export type FormMode = 'preset' | 'custom';

/** 工作台表单状态：全部为字符串输入，提交前经 validateForm 校验。 */
export interface WorkbenchForm {
  readonly activityId: string;
  readonly kind: ChangeKind;
  readonly start: string;
  readonly end: string;
  readonly minCapacity: string;
  readonly targetVenueId: string;
  readonly requiredEquipmentIds: readonly string[];
  readonly after: string;
  readonly equipmentId: string;
  readonly equipmentAfter: string;
  readonly resourceId: string;
  readonly resourceAfter: string;
}

export interface FormValidation {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

export type BuildChangeResult =
  | { readonly ok: true; readonly change: ActivityChange }
  | { readonly ok: false; readonly errors: readonly string[] };

export interface PresetOption {
  readonly id: ChangeId;
  readonly kind: ChangeKind;
  readonly activityId: ActivityId;
  readonly label: string;
  readonly description: string;
  readonly requestedAt: string;
  readonly requestedBy: string;
}

const DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const DIGITS_PATTERN = /^\d+$/;
const ACTIVITY_ID_PATTERN = /^act-\d{3}$/;
const EQUIPMENT_ID_PATTERN = /^eq-\d{3}$/;
const RESOURCE_ID_PATTERN = /^res-\d{3}$/;
const VENUE_ID_PATTERN = /^venue-\d{3}$/;
const CHANGE_ID_PATTERN = /^chg-\d{3}$/;

export const KIND_OPTIONS: readonly { readonly value: ChangeKind; readonly label: string }[] = [
  { value: 'time', label: '时间变更（time）' },
  { value: 'venue', label: '场地变更（venue）' },
  { value: 'scale', label: '规模变更（scale）' },
  { value: 'resource', label: '资源变更（resource）' }
];

export const KIND_LABELS: Readonly<Record<ChangeKind, string>> = {
  time: '时间',
  venue: '场地',
  scale: '规模',
  resource: '资源'
};

/** ID 形态判定：与 src/engine 的类型谓词风格一致，不做宽泛断言。 */
export function isActivityId(value: string): value is ActivityId {
  return ACTIVITY_ID_PATTERN.test(value);
}

export function isEquipmentId(value: string): value is EquipmentId {
  return EQUIPMENT_ID_PATTERN.test(value);
}

export function isResourceId(value: string): value is ResourceId {
  return RESOURCE_ID_PATTERN.test(value);
}

export function isVenueId(value: string): value is VenueId {
  return VENUE_ID_PATTERN.test(value);
}

export function isChangeId(value: string): value is ChangeId {
  return CHANGE_ID_PATTERN.test(value);
}

/** 时钟合法性（格式层面）：HH:mm 且时 ≤ 23、分 ≤ 59。 */
function isValidClock(value: string): boolean {
  const parts = value.match(DATETIME_PATTERN);
  if (parts === null) {
    return false;
  }
  return Number(parts[4]) <= 23 && Number(parts[5]) <= 59;
}

function isNonNegativeIntText(value: string): boolean {
  if (!DIGITS_PATTERN.test(value)) {
    return false;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0;
}

/** 以所选活动初始化表单：时间与人数字段预填活动当前值。 */
export function defaultForm(activity: Activity): WorkbenchForm {
  return {
    activityId: activity.id,
    kind: 'time',
    start: activity.currentSlot.start,
    end: activity.currentSlot.end,
    minCapacity: String(activity.expectedAttendance),
    targetVenueId: '',
    requiredEquipmentIds: [],
    after: String(activity.expectedAttendance),
    equipmentId: '',
    equipmentAfter: '',
    resourceId: '',
    resourceAfter: ''
  };
}

/**
 * 前端基础校验：必填项、输入格式、基础范围。
 * 不判断容量/冲突/库存等业务约束（那些由 src/engine 负责）。
 */
export function validateForm(form: WorkbenchForm): FormValidation {
  const errors: string[] = [];

  if (!isActivityId(form.activityId)) {
    errors.push('请先选择合法的活动（ID 形如 act-001）');
  }

  switch (form.kind) {
    case 'time': {
      if (form.start.trim() === '') {
        errors.push('新开始时间必填（格式 YYYY-MM-DDTHH:mm）');
      } else if (!DATETIME_PATTERN.test(form.start)) {
        errors.push(`新开始时间格式非法：${form.start}（应为 YYYY-MM-DDTHH:mm）`);
      } else if (!isValidClock(form.start)) {
        errors.push(`新开始时间的时分超出 00:00–23:59：${form.start}`);
      }
      if (form.end.trim() === '') {
        errors.push('新结束时间必填（格式 YYYY-MM-DDTHH:mm）');
      } else if (!DATETIME_PATTERN.test(form.end)) {
        errors.push(`新结束时间格式非法：${form.end}（应为 YYYY-MM-DDTHH:mm）`);
      } else if (!isValidClock(form.end)) {
        errors.push(`新结束时间的时分超出 00:00–23:59：${form.end}`);
      }
      break;
    }
    case 'venue': {
      if (form.minCapacity.trim() === '') {
        errors.push('目标容量下限必填（正整数，单位：人）');
      } else if (!DIGITS_PATTERN.test(form.minCapacity) || Number(form.minCapacity) <= 0) {
        errors.push(`目标容量下限必须是正整数：${form.minCapacity}`);
      }
      if (form.targetVenueId !== '' && !isVenueId(form.targetVenueId)) {
        errors.push(`目标场地 ID 格式非法：${form.targetVenueId}（形如 venue-001，留空表示由引擎枚举候选）`);
      }
      for (const id of form.requiredEquipmentIds) {
        if (!isEquipmentId(id)) {
          errors.push(`必需设备 ID 格式非法：${id}（形如 eq-001）`);
        }
      }
      break;
    }
    case 'scale': {
      if (form.after.trim() === '') {
        errors.push('变更后人数必填（非负整数）');
      } else if (!isNonNegativeIntText(form.after)) {
        errors.push(`变更后人数必须是非负整数：${form.after}`);
      }
      break;
    }
    case 'resource': {
      const hasEquipment = form.equipmentId !== '' || form.equipmentAfter.trim() !== '';
      const hasResource = form.resourceId !== '' || form.resourceAfter.trim() !== '';
      if (!hasEquipment && !hasResource) {
        errors.push('至少填写一项设备或资源调整');
      }
      if (form.equipmentId === '' && form.equipmentAfter.trim() !== '') {
        errors.push('已填写设备目标数量，但未选择设备');
      }
      if (form.equipmentId !== '' && form.equipmentAfter.trim() === '') {
        errors.push('已选择设备，但未填写目标数量');
      }
      if (form.equipmentId !== '' && !isEquipmentId(form.equipmentId)) {
        errors.push(`设备 ID 格式非法：${form.equipmentId}（形如 eq-001）`);
      }
      if (form.equipmentAfter.trim() !== '' && !isNonNegativeIntText(form.equipmentAfter)) {
        errors.push(`设备目标数量必须是非负整数：${form.equipmentAfter}`);
      }
      if (form.resourceId === '' && form.resourceAfter.trim() !== '') {
        errors.push('已填写资源目标数量，但未选择资源');
      }
      if (form.resourceId !== '' && form.resourceAfter.trim() === '') {
        errors.push('已选择资源，但未填写目标数量');
      }
      if (form.resourceId !== '' && !isResourceId(form.resourceId)) {
        errors.push(`资源 ID 格式非法：${form.resourceId}（形如 res-001）`);
      }
      if (form.resourceAfter.trim() !== '' && !isNonNegativeIntText(form.resourceAfter)) {
        errors.push(`资源目标数量必须是非负整数：${form.resourceAfter}`);
      }
      break;
    }
  }

  return { ok: errors.length === 0, errors };
}

/** 把本地 Date 格式化为引擎约定的 YYYY-MM-DDTHH:mm（不带时区后缀）。 */
export function formatLocalDateTime(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${String(date.getFullYear())}-${month}-${day}T${hour}:${minute}`;
}

/**
 * 由表单构建真实 ActivityChange。
 * 约定：before 一律取自活动当前状态（可验证一致）；
 * 设备调整不携带 before（类型模型无设备数量，不编造）。
 */
export function buildCustomChange(
  form: WorkbenchForm,
  activity: Activity,
  requestedAt: string
): BuildChangeResult {
  const validation = validateForm(form);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }
  if (form.activityId !== activity.id) {
    return { ok: false, errors: ['所选活动与当前活动不一致，请重新选择活动'] };
  }
  if (!DATETIME_PATTERN.test(requestedAt)) {
    return { ok: false, errors: [`请求时间格式非法：${requestedAt}`] };
  }

  const base = {
    id: FORM_CHANGE_ID,
    activityId: activity.id,
    description: `工作台自定义${KIND_LABELS[form.kind]}变更（预览分析）`,
    requestedAt,
    requestedBy: WORKBENCH_REQUESTER
  };

  switch (form.kind) {
    case 'time': {
      return {
        ok: true,
        change: {
          ...base,
          kind: 'time',
          payload: {
            before: activity.currentSlot,
            after: { start: form.start, end: form.end }
          }
        }
      };
    }
    case 'venue': {
      const requiredEquipmentIds: EquipmentId[] = form.requiredEquipmentIds.filter(isEquipmentId);
      const targetVenueId: VenueId | undefined = isVenueId(form.targetVenueId)
        ? form.targetVenueId
        : undefined;
      const payload = {
        before: activity.currentVenueId,
        minCapacity: Number(form.minCapacity),
        requiredEquipmentIds,
        ...(targetVenueId !== undefined ? { targetVenueId } : {})
      };
      return { ok: true, change: { ...base, kind: 'venue', payload } };
    }
    case 'scale': {
      return {
        ok: true,
        change: {
          ...base,
          kind: 'scale',
          payload: { before: activity.expectedAttendance, after: Number(form.after) }
        }
      };
    }
    case 'resource': {
      const equipmentAdjustments: DemandAdjustment<EquipmentId>[] = [];
      if (isEquipmentId(form.equipmentId)) {
        equipmentAdjustments.push({ id: form.equipmentId, after: Number(form.equipmentAfter) });
      }

      const resourceAdjustments: DemandAdjustment<ResourceId>[] = [];
      if (isResourceId(form.resourceId)) {
        const resourceId: ResourceId = form.resourceId;
        const current = activity.resourceNeeds[resourceId];
        resourceAdjustments.push(
          current === undefined
            ? { id: resourceId, after: Number(form.resourceAfter) }
            : { id: resourceId, after: Number(form.resourceAfter), before: current }
        );
      }

      return {
        ok: true,
        change: {
          ...base,
          kind: 'resource',
          payload: { equipmentAdjustments, resourceAdjustments }
        }
      };
    }
  }
}

/** 预置变更状态的中文标签（直接映射 runScheduling 返回的真实 status）。 */
export function formatChangeStatus(status: ChangeStatus): string {
  switch (status) {
    case 'scheduled':
      return '存在可行方案';
    case 'infeasible':
      return '无可行方案';
    case 'invalid-change':
      return '变更载荷无效';
    case 'unknown-change':
      return '未找到该变更';
    case 'unknown-activity':
      return '未找到关联活动';
    default: {
      const unexpected: never = status;
      throw new Error(`未知的变更状态：${String(unexpected)}`);
    }
  }
}

/** 预置变更下拉选项映射。 */
export function toPresetOptions(changes: readonly ActivityChange[]): readonly PresetOption[] {
  return changes.map((change) => ({
    id: change.id,
    kind: change.kind,
    activityId: change.activityId,
    label: `${change.id} · ${change.kind} → ${change.activityId}`,
    description: change.description,
    requestedAt: change.requestedAt,
    requestedBy: change.requestedBy
  }));
}

/* ---------- M1-D：变更前后对比与评分口径（纯函数，仅消费真实引擎输出） ---------- */

/** 评分性质声明：固定文案，禁止把启发式结果描述为全局最优。 */
export const SCORING_DISCLAIMER =
  '评分为确定性启发式排序，依据当前评分口径计算，不保证全局最优。';

export type ComparisonRowKey =
  | 'time'
  | 'venue'
  | 'attendance'
  | 'capacity'
  | 'equipment'
  | 'resources';

/**
 * 单项（设备/资源）差异：
 * - added：仅存在于变更后（before 为 null，展示为"此前无此需求"，不以 0 代替）；
 * - removed：仅存在于变更前（after 为 null）；
 * - updated：前后均有但数量不同（仅资源会出现；模型无设备数量）；
 * - unchanged：前后一致。
 * 设备只有种类语义，before / after 一律 null，绝不编造数量。
 */
export interface ComparisonDelta {
  readonly id: string;
  readonly change: 'added' | 'removed' | 'unchanged' | 'updated';
  readonly before: number | null;
  readonly after: number | null;
}

export interface ComparisonRow {
  readonly key: ComparisonRowKey;
  readonly label: string;
  readonly beforeText: string;
  readonly afterText: string;
  readonly changed: boolean;
  /** 补充说明（如候选集合语义），无则为空串 */
  readonly note: string;
  readonly deltas: readonly ComparisonDelta[];
}

/**
 * 由真实的变更前状态（Activity）与变更后目标状态（ActivityTargetState）生成对比行。
 * target 为 null（载荷无效）时返回空数组，由展示层显示"载荷无效，无目标状态"，
 * 不构造任何伪造的前后值。
 */
export function buildComparisonRows(
  activity: Activity,
  target: ActivityTargetState | null
): readonly ComparisonRow[] {
  if (target === null) {
    return [];
  }

  const timeBefore = `${activity.currentSlot.start} → ${activity.currentSlot.end}`;
  const timeAfter = `${target.slot.start} → ${target.slot.end}`;
  const attendanceBefore = String(activity.expectedAttendance);
  const attendanceAfter = String(target.attendance);
  const capacityBefore = String(activity.expectedAttendance);
  const capacityAfter = String(target.requiredCapacity);
  const venueBefore = activity.currentVenueId;
  const venueAfter = target.candidateVenueIds.join('、');
  const equipmentBeforeText = activity.requiredEquipmentIds.join('、') || '（无）';
  const equipmentAfterText = target.requiredEquipmentIds.join('、') || '（无）';
  const resourcesBeforeText =
    Object.entries(activity.resourceNeeds)
      .sort(([left], [right]) => (left < right ? -1 : left === right ? 0 : 1))
      .map(([id, amount]) => `${id} × ${amount}`)
      .join('；') || '（无）';
  const resourcesAfterText =
    Object.entries(target.resourceNeeds)
      .sort(([left], [right]) => (left < right ? -1 : left === right ? 0 : 1))
      .map(([id, amount]) => `${id} × ${amount}`)
      .join('；') || '（无）';

  const equipmentIds = [...new Set<EquipmentId>([
    ...activity.requiredEquipmentIds,
    ...target.requiredEquipmentIds
  ])].sort();
  const equipmentDeltas: ComparisonDelta[] = equipmentIds.map((id) => {
    const inBefore = activity.requiredEquipmentIds.includes(id);
    const inAfter = target.requiredEquipmentIds.includes(id);
    const change: ComparisonDelta['change'] =
      inBefore && inAfter ? 'unchanged' : inBefore ? 'removed' : 'added';
    // 设备无数量字段：before / after 均为 null，不编造库存数量。
    return { id, change, before: null, after: null };
  });

  const resourceIds = [
    ...new Set(
      [...Object.keys(activity.resourceNeeds), ...Object.keys(target.resourceNeeds)].filter(
        isResourceId
      )
    )
  ].sort();
  const resourceDeltas: ComparisonDelta[] = resourceIds.map((id) => {
    const before = activity.resourceNeeds[id] ?? null;
    const after = target.resourceNeeds[id] ?? null;
    let change: ComparisonDelta['change'];
    if (before === null && after === null) {
      change = 'unchanged';
    } else if (before === null) {
      change = 'added';
    } else if (after === null) {
      change = 'removed';
    } else {
      change = before === after ? 'unchanged' : 'updated';
    }
    return { id, change, before, after };
  });

  return [
    {
      key: 'time',
      label: '时间段',
      beforeText: timeBefore,
      afterText: timeAfter,
      changed: timeBefore !== timeAfter,
      note: '',
      deltas: []
    },
    {
      key: 'venue',
      label: '场地',
      beforeText: venueBefore,
      afterText: venueAfter,
      changed: venueAfter !== venueBefore,
      note:
        target.candidateVenueIds.length > 1
          ? 'after 为引擎生成的候选场地集合；最终场地以选中候选为准。'
          : '',
      deltas: []
    },
    {
      key: 'attendance',
      label: '预计参与人数（人）',
      beforeText: attendanceBefore,
      afterText: attendanceAfter,
      changed: attendanceBefore !== attendanceAfter,
      note: '',
      deltas: []
    },
    {
      key: 'capacity',
      label: '容量需求（人）',
      beforeText: capacityBefore,
      afterText: capacityAfter,
      changed: capacityBefore !== capacityAfter,
      note: '',
      deltas: []
    },
    {
      key: 'equipment',
      label: '设备种类',
      beforeText: equipmentBeforeText,
      afterText: equipmentAfterText,
      changed: equipmentDeltas.some((delta) => delta.change !== 'unchanged'),
      note: '模型仅表达设备种类，不含数量。',
      deltas: equipmentDeltas
    },
    {
      key: 'resources',
      label: '资源需求',
      beforeText: resourcesBeforeText,
      afterText: resourcesAfterText,
      changed: resourceDeltas.some((delta) => delta.change !== 'unchanged'),
      note: '',
      deltas: resourceDeltas
    }
  ];
}

/**
 * 读取可行候选集合的统一评分口径。
 * 引擎保证整个可行集合使用同一口径；空集合或候选无评分（排除候选）时返回 null，
 * 由展示层不显示口径，绝不逐行混排暗示不同口径。
 */
export function resolveScoringMode(candidates: readonly Candidate[]): ScoringMode | null {
  const first = candidates.at(0);
  if (first === undefined || first.score === null) {
    return null;
  }
  return first.score.weightMode;
}

export function formatScoringModeLabel(mode: ScoringMode): string {
  return mode === 'capacity-and-distance' ? '容量 + 距离' : '仅容量适配度';
}
