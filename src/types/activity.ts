import type { ActivityId, EquipmentId, ResourceId, VenueId } from './ids';
import type { TimeSlot } from './time';

/**
 * 资源需求映射：键为资源 ID（见 src/types/ids.ts），值为所需数量（非负整数）。
 * 例如 `{ 'res-001': 2 }` 表示需要 2 个单位的 res-001 资源。
 */
export type ResourceNeeds = Readonly<Record<ResourceId, number>>;

/** 活动的当前模拟状态。 */
export interface Activity {
  /** 活动 ID */
  readonly id: ActivityId;
  /** 活动名称 */
  readonly name: string;
  /** 预计参与人数，非负整数，单位：人 */
  readonly expectedAttendance: number;
  /** 当前占用场地 ID */
  readonly currentVenueId: VenueId;
  /** 当前时间段 */
  readonly currentSlot: TimeSlot;
  /** 必需设备 ID 列表 */
  readonly requiredEquipmentIds: readonly EquipmentId[];
  /** 所需资源数量映射 */
  readonly resourceNeeds: ResourceNeeds;
}
