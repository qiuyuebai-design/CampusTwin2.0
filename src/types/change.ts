import type { ActivityId, ChangeId, EquipmentId, ResourceId, VenueId } from './ids';
import type { LocalDateTime, TimeSlot } from './time';

/**
 * 需求数量调整项。
 *
 * 语义约定：
 * 1. `after` 是"变更后目标数量"，不是增量。
 * 2. `before` 是变更前数量，用于与活动当前状态做一致性校验；
 *    缺省表示"此前没有这项需求"（数量视为 0）。
 */
export interface DemandAdjustment<Id> {
  /** 被调整项 ID：设备为 EquipmentId，资源为 ResourceId，绝不使用名称充当 ID */
  readonly id: Id;
  /** 变更前数量，可选 */
  readonly before?: number;
  /** 变更后目标数量 */
  readonly after: number;
}

/** time 变更载荷：表达时间段调整。 */
export interface TimeChangePayload {
  /** 变更前时间段，可选；若给出必须与 Activity.currentSlot 一致 */
  readonly before?: TimeSlot;
  /** 变更后时间段 */
  readonly after: TimeSlot;
}

/**
 * venue 变更载荷：表达目标场地要求。
 * 中文描述只用于展示与追溯，算法输入一律来自本结构。
 */
export interface VenueChangePayload {
  /** 变更前场地 ID，可选；若给出必须与 Activity.currentVenueId 一致 */
  readonly before?: VenueId;
  /** 目标场地 ID，可选；若指定必须是数据集中已定义的场地 */
  readonly targetVenueId?: VenueId;
  /** 目标容量下限，正整数，单位：人 */
  readonly minCapacity: number;
  /** 目标场地必须具备的设备 ID 列表 */
  readonly requiredEquipmentIds: readonly EquipmentId[];
}

/** scale 变更载荷：表达预计参与人数调整。 */
export interface ScaleChangePayload {
  /** 变更前人数，可选；若给出必须与 Activity.expectedAttendance 一致 */
  readonly before?: number;
  /** 变更后人数，非负整数 */
  readonly after: number;
}

/** resource 变更载荷：表达设备需求与资源数量需求的新增或调整。 */
export interface ResourceChangePayload {
  /** 设备需求调整：仅列出本次变更涉及的设备 */
  readonly equipmentAdjustments: readonly DemandAdjustment<EquipmentId>[];
  /** 资源需求调整：仅列出本次变更涉及的资源 */
  readonly resourceAdjustments: readonly DemandAdjustment<ResourceId>[];
}

/** 所有变更记录共有的标识与追溯字段。 */
export interface ActivityChangeBase {
  /** 变更记录 ID */
  readonly id: ChangeId;
  /** 关联活动 ID（指向变更前的活动当前状态） */
  readonly activityId: ActivityId;
  /** 变更描述，仅用于展示与人工追溯，不作为算法输入 */
  readonly description: string;
  /** 请求时间 */
  readonly requestedAt: LocalDateTime;
  /** 请求人或角色的模拟标识，约定形如 `role-organizer-01` */
  readonly requestedBy: string;
}

/** 时间变更。 */
export interface TimeChange extends ActivityChangeBase {
  readonly kind: 'time';
  readonly payload: TimeChangePayload;
}

/** 场地变更。 */
export interface VenueChange extends ActivityChangeBase {
  readonly kind: 'venue';
  readonly payload: VenueChangePayload;
}

/** 规模（人数）变更。 */
export interface ScaleChange extends ActivityChangeBase {
  readonly kind: 'scale';
  readonly payload: ScaleChangePayload;
}

/** 资源/设备变更。 */
export interface ResourceChange extends ActivityChangeBase {
  readonly kind: 'resource';
  readonly payload: ResourceChangePayload;
}

/**
 * 活动变更事件：以 `kind` 为判别标签的联合类型。
 * `kind` 与 `payload` 在编译期严格对应：`kind: 'scale'` 时不可能传入 time 载荷。
 */
export type ActivityChange = TimeChange | VenueChange | ScaleChange | ResourceChange;

/** 变更类型：时间变更、场地变更、规模（人数）变更、资源/设备变更。 */
export type ChangeKind = ActivityChange['kind'];
