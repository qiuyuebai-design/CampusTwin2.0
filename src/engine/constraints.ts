/**
 * CampusTwin-DEMO · M1-B 调度引擎 —— 硬约束层
 *
 * 纯函数、无副作用、无 IO、无运行时依赖、不使用 any / as。
 * 时间统一按校园当地 YYYY-MM-DDTHH:mm 处理，不做浏览器时区转换。
 * 时间段统一使用半开区间 [start, end)。
 *
 * 修订说明（M1-B 三轮）：
 * - Equipment / Venue / ResourceUnit 统一从 types/resource.ts 导入；
 * - payload.before 与活动当前状态一致性校验；不一致的可验证 before 明确拒绝；
 * - 设备数量 before 在现有类型模型下不可验证，只报告、不确认、不伪造；
 * - 校验 ResourceUnit.available 为非负整数，拒绝 NaN / Infinity / 负数 / 小数；
 * - 载荷调整项改用下标遍历 + readDemandAdjustment 严格读取，
 *   数组中的 undefined / null / 原始值 / 缺字段项一律拒绝，不依赖 find 的 undefined 哨兵。
 */

import type { Activity } from '../types/activity';
import type { CampusDataset } from '../types/campus';
import type { ActivityChange, ChangeKind } from '../types/change';
import type { ActivityId, EquipmentId, ResourceId, VenueId } from '../types/ids';
import type { Equipment, ResourceUnit, Venue } from '../types/resource';
import type { TimeSlot } from '../types/time';

const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const CLOCK_TIME_PATTERN = /^(\d{2}):(\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTimeSlotShape(value: unknown): value is { start: string; end: string } {
  return isRecord(value) && typeof value.start === 'string' && typeof value.end === 'string';
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** 运行期数组读取：非数组一律视为空数组，避免 for...of 抛错。 */
function toUnknownArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function isStringList(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  const items = toUnknownArray(value);
  for (let index = 0; index < items.length; index += 1) {
    if (typeof items[index] !== 'string') {
      return false;
    }
  }
  return true;
}

/** 需求调整项的运行期读取结果。 */
export interface DemandAdjustment {
  readonly id: string;
  readonly before: number | undefined;
  readonly after: number;
}

/**
 * 严格读取一条需求调整项（设备数量 / 资源数量）。
 * 项本身为 undefined、null、原始值或字段非法时返回 null，绝不抛异常。
 */
export function readDemandAdjustment(value: unknown): DemandAdjustment | null {
  if (!isRecord(value)) {
    return null;
  }
  const id: unknown = value.id;
  const rawBefore: unknown = value.before;
  const rawAfter: unknown = value.after;

  if (typeof id !== 'string' || !isNonNegativeInteger(rawAfter)) {
    return null;
  }
  if (rawBefore === undefined) {
    return { id, before: undefined, after: rawAfter };
  }
  if (!isNonNegativeInteger(rawBefore)) {
    return null;
  }
  return { id, before: rawBefore, after: rawAfter };
}

function isDemandAdjustmentShape(value: unknown): boolean {
  return readDemandAdjustment(value) !== null;
}

/** 资源 ID 形状判定（运行期数据防御），同时作为类型收窄谓词。 */
export function isResourceId(value: string): value is ResourceId {
  return value.startsWith('res-');
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      return isLeapYear(year) ? 29 : 28;
    default:
      return 0;
  }
}

/** 严格校验 YYYY-MM-DDTHH:mm：形状 + 月/日/时/分有效范围 + 真实日历日（含闰年）。 */
export function isValidLocalDateTime(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  const parts = DATE_TIME_PATTERN.exec(value);
  if (parts === null) {
    return false;
  }

  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const hour = Number(parts[4]);
  const minute = Number(parts[5]);

  if (month < 1 || month > 12) {
    return false;
  }
  if (hour > 23 || minute > 59) {
    return false;
  }
  return day >= 1 && day <= daysInMonth(year, month);
}

/** 严格校验 HH:mm：形状 + 时/分有效范围。 */
export function isValidClockTime(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  const parts = CLOCK_TIME_PATTERN.exec(value);
  if (parts === null) {
    return false;
  }
  return Number(parts[1]) <= 23 && Number(parts[2]) <= 59;
}

export interface TimeSlotValidation {
  readonly ok: boolean;
  readonly reason: string;
}

/**
 * 时间段合法性：
 * 1. 形状与取值合法；
 * 2. start 早于 end（半开区间 [start, end)）；
 * 3. 仅支持单日活动，跨午夜/跨日明确判为不支持并说明原因。
 */
export function validateTimeSlot(value: unknown): TimeSlotValidation {
  if (!isTimeSlotShape(value)) {
    return {
      ok: false,
      reason: '时间段必须是包含字符串 start 与 end 的 { start, end } 对象'
    };
  }

  const start = value.start;
  const end = value.end;
  if (typeof start !== 'string' || typeof end !== 'string') {
    return { ok: false, reason: '时间段的 start / end 必须是字符串' };
  }

  if (!isValidLocalDateTime(start) || !isValidLocalDateTime(end)) {
    return {
      ok: false,
      reason: `时间段必须是合法的 YYYY-MM-DDTHH:mm（收到 ${start} ~ ${end}）`
    };
  }

  if (start >= end) {
    return {
      ok: false,
      reason: `时间段必须满足 start 早于 end（半开区间 [start, end)），收到 ${start} ~ ${end}`
    };
  }

  if (start.slice(0, 10) !== end.slice(0, 10)) {
    return {
      ok: false,
      reason: `跨午夜/跨日时间段不在本引擎支持范围（仅支持单日活动），已判为不可行：${start} ~ ${end}`
    };
  }

  return { ok: true, reason: '' };
}

/** 半开区间 [start, end)：结束时刻等于另一活动开始时刻时不算重叠。 */
export function slotsOverlap(a: TimeSlot, b: TimeSlot): boolean {
  return a.start < b.end && b.start < a.end;
}

/** 目标时间段是否处于场地每日开放时段内（时段为闭区间边界）。 */
export function isWithinOpeningHours(
  slot: TimeSlot,
  venue: Pick<Venue, 'openFrom' | 'openTo'>
): boolean {
  const validation = validateTimeSlot(slot);
  if (!validation.ok) {
    return false;
  }
  if (!isValidClockTime(venue.openFrom) || !isValidClockTime(venue.openTo)) {
    return false;
  }
  return slot.start.slice(11, 16) >= venue.openFrom && slot.end.slice(11, 16) <= venue.openTo;
}

export interface ConflictReport {
  readonly hasConflict: boolean;
  readonly conflictingActivityIds: readonly ActivityId[];
  readonly detail: string;
}

/**
 * 同场地冲突判断。
 * 规则：被调整活动自身的原占用必须从比较中排除，不能把活动自己与自己判为冲突。
 */
export function findSlotConflicts(
  dataset: CampusDataset,
  activityId: ActivityId,
  venueId: VenueId,
  slot: TimeSlot
): ConflictReport {
  const conflicting: ActivityId[] = [];

  for (const activity of dataset.activities) {
    if (activity.id === activityId) {
      continue;
    }
    if (activity.currentVenueId !== venueId) {
      continue;
    }
    if (slotsOverlap(slot, activity.currentSlot)) {
      conflicting.push(activity.id);
    }
  }

  if (conflicting.length === 0) {
    return {
      hasConflict: false,
      conflictingActivityIds: [],
      detail: `与其他活动在 ${venueId} 的占用不重叠（已排除活动 ${activityId} 自身的原占用）`
    };
  }

  return {
    hasConflict: true,
    conflictingActivityIds: conflicting,
    detail: `与同场地活动 ${conflicting.join('、')} 的时间段重叠（半开区间 [start, end)）`
  };
}

export interface PayloadValidation {
  readonly ok: boolean;
  readonly reason: string;
  /**
   * 无法在当前类型模型下验证的 before 项（典型：设备数量）。
   * 只报告、不确认、不伪造；放行时不得声称这些 before 已核对。
   */
  readonly unverified: readonly string[];
}

function payloadValid(unverified: readonly string[] = []): PayloadValidation {
  return { ok: true, reason: '', unverified };
}

function payloadInvalid(reason: string): PayloadValidation {
  return { ok: false, reason, unverified: [] };
}

/**
 * 运行期校验"载荷与 kind 是否匹配"（只做形状与取值域检查）。
 * 目的是防御外部数据（例如 JSON 导入）破坏编译期判别联合的假设。
 * 调整数组逐项按序号校验：数组中的 undefined / null / 原始值 / 缺字段项都会被点名拒绝。
 */
export function validatePayloadShape(kind: ChangeKind, payload: unknown): PayloadValidation {
  if (!isRecord(payload)) {
    return payloadInvalid(`变更载荷必须是对象（kind=${String(kind)}）`);
  }

  switch (kind) {
    case 'time': {
      if (!isTimeSlotShape(payload.after)) {
        return payloadInvalid("kind='time' 的载荷必须包含 payload.after: { start, end } 时间段");
      }
      if (payload.before !== undefined && !isTimeSlotShape(payload.before)) {
        return payloadInvalid("kind='time' 的 payload.before 若存在必须是 { start, end } 时间段");
      }
      return payloadValid();
    }
    case 'venue': {
      if (!isPositiveInteger(payload.minCapacity)) {
        return payloadInvalid("kind='venue' 的 payload.minCapacity 必须是正整数");
      }
      if (!isStringList(payload.requiredEquipmentIds)) {
        return payloadInvalid("kind='venue' 的 payload.requiredEquipmentIds 必须是设备 ID 字符串数组");
      }
      if (payload.targetVenueId !== undefined && typeof payload.targetVenueId !== 'string') {
        return payloadInvalid("kind='venue' 的 payload.targetVenueId 若存在必须是场地 ID 字符串");
      }
      if (payload.before !== undefined && typeof payload.before !== 'string') {
        return payloadInvalid("kind='venue' 的 payload.before 若存在必须是场地 ID 字符串");
      }
      return payloadValid();
    }
    case 'scale': {
      if (!isNonNegativeInteger(payload.after)) {
        return payloadInvalid("kind='scale' 的 payload.after 必须是非负整数人数");
      }
      if (payload.before !== undefined && !isNonNegativeInteger(payload.before)) {
        return payloadInvalid("kind='scale' 的 payload.before 若存在必须是非负整数人数");
      }
      return payloadValid();
    }
    case 'resource': {
      const rawEquipment: unknown = payload.equipmentAdjustments;
      const rawResource: unknown = payload.resourceAdjustments;
      if (!Array.isArray(rawEquipment) || !Array.isArray(rawResource)) {
        return payloadInvalid(
          "kind='resource' 的载荷必须同时包含 equipmentAdjustments 与 resourceAdjustments 数组"
        );
      }

      const equipmentItems = toUnknownArray(rawEquipment);
      for (let index = 0; index < equipmentItems.length; index += 1) {
        const item: unknown = equipmentItems[index];
        if (!isDemandAdjustmentShape(item)) {
          return payloadInvalid(
            `kind='resource' 的 equipmentAdjustments[${index}] 必须是 { id: 设备ID, before?: 非负整数, after: 非负整数 }（收到 ${String(item)}）`
          );
        }
      }

      const resourceItems = toUnknownArray(rawResource);
      for (let index = 0; index < resourceItems.length; index += 1) {
        const item: unknown = resourceItems[index];
        if (!isDemandAdjustmentShape(item)) {
          return payloadInvalid(
            `kind='resource' 的 resourceAdjustments[${index}] 必须是 { id: 资源ID, before?: 非负整数, after: 非负整数 }（收到 ${String(item)}）`
          );
        }
      }
      return payloadValid();
    }
    default:
      return payloadInvalid(`未知变更 kind：${String(kind)}`);
  }
}

/**
 * before 与活动当前状态的一致性校验。
 *
 * 可验证的 before（time / venue / scale / 已在活动需求中的资源）不一致时明确拒绝；
 * 不可验证的 before（设备数量、活动当前需求中不存在的资源）只报告为 unverified，
 * 不作确认、不伪造当前值。
 */
export function validateBeforeAgainstActivity(
  change: ActivityChange,
  activity: Activity
): PayloadValidation {
  const kind: ChangeKind = change.kind;
  const unverified: string[] = [];

  switch (change.kind) {
    case 'time': {
      const before: TimeSlot | undefined = change.payload.before;
      if (before === undefined) {
        return payloadValid(unverified);
      }
      const current = activity.currentSlot;
      if (before.start !== current.start || before.end !== current.end) {
        return payloadInvalid(
          `变更载荷 payload.before 与活动当前时间段不一致：before=[${before.start}, ${before.end})，活动 currentSlot=[${current.start}, ${current.end})`
        );
      }
      return payloadValid(unverified);
    }
    case 'venue': {
      const before: string | undefined = change.payload.before;
      if (before === undefined) {
        return payloadValid(unverified);
      }
      if (before !== activity.currentVenueId) {
        return payloadInvalid(
          `变更载荷 payload.before 与活动当前场地不一致：before=${before}，活动 currentVenueId=${activity.currentVenueId}`
        );
      }
      return payloadValid(unverified);
    }
    case 'scale': {
      const before: number | undefined = change.payload.before;
      if (before === undefined) {
        return payloadValid(unverified);
      }
      if (before !== activity.expectedAttendance) {
        return payloadInvalid(
          `变更载荷 payload.before 与活动当前参与人数不一致：before=${before}，活动 expectedAttendance=${activity.expectedAttendance}`
        );
      }
      return payloadValid(unverified);
    }
    case 'resource': {
      const equipmentItems = toUnknownArray(change.payload.equipmentAdjustments);
      const resourceItems = toUnknownArray(change.payload.resourceAdjustments);

      for (let index = 0; index < equipmentItems.length; index += 1) {
        const parsed = readDemandAdjustment(equipmentItems[index]);
        if (parsed === null) {
          return payloadInvalid(
            `kind='resource' 的 equipmentAdjustments[${index}] 项非法，无法核验 payload.before`
          );
        }
        if (parsed.before !== undefined) {
          unverified.push(
            `设备 ${parsed.id} 的 before=${parsed.before} 无法验证：Activity.requiredEquipmentIds 只表达设备种类、不含数量，不能伪造当前设备数量，也不作虚假确认`
          );
        }
      }

      for (let index = 0; index < resourceItems.length; index += 1) {
        const parsed = readDemandAdjustment(resourceItems[index]);
        if (parsed === null) {
          return payloadInvalid(
            `kind='resource' 的 resourceAdjustments[${index}] 项非法，无法核验 payload.before`
          );
        }

        const resourceId: string = parsed.id;
        if (!isResourceId(resourceId)) {
          return payloadInvalid(`资源 ${resourceId} 不是合法的资源 ID`);
        }

        const itemBefore: number | undefined = parsed.before;
        if (itemBefore === undefined) {
          continue;
        }

        const current: number | undefined = activity.resourceNeeds[resourceId];
        if (current === undefined) {
          unverified.push(
            `资源 ${resourceId} 的 before=${itemBefore} 无法验证：活动当前资源需求中没有该资源，无法比对`
          );
          continue;
        }
        if (itemBefore !== current) {
          return payloadInvalid(
            `变更载荷 payload.before 与活动当前资源需求不一致：资源 ${resourceId} before=${itemBefore}，活动当前需求=${current}`
          );
        }
      }
      return payloadValid(unverified);
    }
    default:
      return payloadInvalid(`未知变更 kind：${String(kind)}`);
  }
}

/** 载荷校验入口：形状 + 取值域 + （提供 activity 时的）before 一致性。 */
export function validateChangePayload(
  change: ActivityChange,
  activity: Activity | null = null
): PayloadValidation {
  const shape = validatePayloadShape(change.kind, change.payload);
  if (!shape.ok) {
    return shape;
  }
  if (activity === null) {
    return payloadValid();
  }
  return validateBeforeAgainstActivity(change, activity);
}

export interface ResourceCheckResult {
  readonly ok: boolean;
  readonly problems: readonly string[];
  readonly detail: string;
}

/**
 * 资源约束：
 * 1. ResourceUnit.available 必须是非负整数，拒绝 NaN / Infinity / 负数 / 小数；
 * 2. 目标需求数量必须是非负整数，且不超过 available。
 * 注意：比较的是"变更后的目标数量"，不是增量。
 */
export function checkResourceRequirements(
  requirements: Readonly<Record<ResourceId, number>>,
  resources: readonly ResourceUnit[]
): ResourceCheckResult {
  const problems: string[] = [];
  const details: string[] = [];

  for (const key of Object.keys(requirements)) {
    if (!isResourceId(key)) {
      problems.push(`资源需求键 ${key} 不是合法的资源 ID`);
      continue;
    }

    const amount: number | undefined = requirements[key];
    const unit = resources.find((item) => item.id === key);
    if (unit === undefined) {
      problems.push(`资源 ${key} 未在数据集中定义`);
      continue;
    }
    if (!isNonNegativeInteger(unit.available)) {
      problems.push(
        `资源 ${key} ${unit.name} 的库存值非法：available=${String(unit.available)} 必须是非负整数`
      );
      continue;
    }
    if (!isNonNegativeInteger(amount)) {
      problems.push(`资源 ${key} 的需求数量必须是非负整数（收到 ${amount}）`);
      continue;
    }

    details.push(`${key} ${unit.name}：目标需求 ${amount} / 可用 ${unit.available}`);
    if (amount > unit.available) {
      problems.push(`资源 ${key} ${unit.name} 不足：目标需求 ${amount} > 可用 ${unit.available}`);
    }
  }

  return {
    ok: problems.length === 0,
    problems,
    detail: problems.length === 0 ? details.join('；') : problems.join('；')
  };
}

export type ConstraintCode =
  | 'venue-exists'
  | 'slot-valid'
  | 'slot-within-opening-hours'
  | 'slot-conflict-free'
  | 'capacity-sufficient'
  | 'equipment-available'
  | 'resources-sufficient';

export type ConstraintStatus = 'passed' | 'failed' | 'skipped';

export interface ConstraintCheck {
  readonly code: ConstraintCode;
  readonly label: string;
  readonly status: ConstraintStatus;
  readonly detail: string;
}

export interface CandidateSpec {
  readonly venueId: VenueId;
  readonly slot: TimeSlot;
  readonly attendance: number;
  readonly requiredCapacity: number;
  readonly requiredEquipmentIds: readonly EquipmentId[];
  readonly resourceNeeds: Readonly<Record<ResourceId, number>>;
}

export interface CandidateEvaluation {
  readonly venueId: VenueId;
  readonly slot: TimeSlot;
  readonly passed: boolean;
  readonly checks: readonly ConstraintCheck[];
  readonly failureReasons: readonly string[];
}

function describeEquipment(
  equipment: readonly Equipment[],
  ids: readonly EquipmentId[]
): string {
  return ids
    .map((id) => {
      const unit = equipment.find((item) => item.id === id);
      return unit === undefined ? `${id}（未定义）` : `${id} ${unit.name}`;
    })
    .join('、');
}

function toEvaluation(spec: CandidateSpec, checks: readonly ConstraintCheck[]): CandidateEvaluation {
  const failureReasons = checks
    .filter((check) => check.status === 'failed')
    .map((check) => `${check.label}：${check.detail}`);

  return {
    venueId: spec.venueId,
    slot: spec.slot,
    passed: failureReasons.length === 0,
    checks,
    failureReasons
  };
}

/** 对单个候选（目标时间段 + 候选场地）执行全部硬约束检查。 */
export function evaluateCandidate(
  dataset: CampusDataset,
  spec: CandidateSpec,
  activityId: ActivityId
): CandidateEvaluation {
  const checks: ConstraintCheck[] = [];
  const venue = dataset.venues.find((item) => item.id === spec.venueId);

  if (venue === undefined) {
    checks.push({
      code: 'venue-exists',
      label: '候选场地已定义',
      status: 'failed',
      detail: `候选场地 ${spec.venueId} 未在数据集中定义`
    });
    return toEvaluation(spec, checks);
  }

  checks.push({
    code: 'venue-exists',
    label: '候选场地已定义',
    status: 'passed',
    detail: `${venue.id} ${venue.name}`
  });

  const slotValidation = validateTimeSlot(spec.slot);
  checks.push({
    code: 'slot-valid',
    label: '时间段合法',
    status: slotValidation.ok ? 'passed' : 'failed',
    detail: slotValidation.ok
      ? `半开区间 [${spec.slot.start}, ${spec.slot.end})`
      : slotValidation.reason
  });

  if (!slotValidation.ok) {
    checks.push({
      code: 'slot-within-opening-hours',
      label: '场地开放时段',
      status: 'skipped',
      detail: '时间段非法，未评估开放时段'
    });
    checks.push({
      code: 'slot-conflict-free',
      label: '同场地时间冲突',
      status: 'skipped',
      detail: '时间段非法，未评估冲突'
    });
  } else {
    const hoursOk = isValidClockTime(venue.openFrom) && isValidClockTime(venue.openTo);
    if (!hoursOk) {
      checks.push({
        code: 'slot-within-opening-hours',
        label: '场地开放时段',
        status: 'failed',
        detail: `场地开放时间非法：${String(venue.openFrom)} ~ ${String(venue.openTo)}`
      });
    } else {
      const startClock = spec.slot.start.slice(11, 16);
      const endClock = spec.slot.end.slice(11, 16);
      const within = startClock >= venue.openFrom && endClock <= venue.openTo;
      checks.push({
        code: 'slot-within-opening-hours',
        label: '场地开放时段',
        status: within ? 'passed' : 'failed',
        detail: within
          ? `${startClock}-${endClock} 处于开放时段 ${venue.openFrom}-${venue.openTo}`
          : `${startClock}-${endClock} 不在开放时段 ${venue.openFrom}-${venue.openTo}`
      });
    }

    const conflicts = findSlotConflicts(dataset, activityId, spec.venueId, spec.slot);
    checks.push({
      code: 'slot-conflict-free',
      label: '同场地时间冲突',
      status: conflicts.hasConflict ? 'failed' : 'passed',
      detail: conflicts.detail
    });
  }

  const capacityOk = venue.capacity >= spec.requiredCapacity;
  checks.push({
    code: 'capacity-sufficient',
    label: '场地容量',
    status: capacityOk ? 'passed' : 'failed',
    detail: capacityOk
      ? `容量 ${venue.capacity} 人 ≥ 需求 ${spec.requiredCapacity} 人（预计参与 ${spec.attendance} 人）`
      : `容量 ${venue.capacity} 人 < 需求 ${spec.requiredCapacity} 人（预计参与 ${spec.attendance} 人）`
  });

  const missingEquipment = spec.requiredEquipmentIds.filter(
    (id) => !venue.equipmentIds.includes(id)
  );
  checks.push({
    code: 'equipment-available',
    label: '设备种类匹配',
    status: missingEquipment.length === 0 ? 'passed' : 'failed',
    detail:
      missingEquipment.length === 0
        ? `候选场地具备所需设备种类：${describeEquipment(dataset.equipment, spec.requiredEquipmentIds)}`
        : `候选场地缺少设备种类：${describeEquipment(dataset.equipment, missingEquipment)}`
  });

  const resourceCheck = checkResourceRequirements(spec.resourceNeeds, dataset.resources);
  checks.push({
    code: 'resources-sufficient',
    label: '资源数量',
    status: resourceCheck.ok ? 'passed' : 'failed',
    detail: resourceCheck.detail === '' ? '无资源需求数量' : resourceCheck.detail
  });

  return toEvaluation(spec, checks);
}
