import type { EquipmentId, ResourceId, VenueId } from './ids';
import type { ClockTime } from './time';

/**
 * 设备目录项：设备 ID 与设备名称严格分离。
 * ID 只用于引用（Venue.equipmentIds / Activity.requiredEquipmentIds），名称只用于展示。
 */
export interface Equipment {
  readonly id: EquipmentId;
  readonly name: string;
}

/** 场地。 */
export interface Venue {
  /** 场地 ID */
  readonly id: VenueId;
  /** 场地名称 */
  readonly name: string;
  /** 容量，正整数，单位：人 */
  readonly capacity: number;
  /** 每天开放时间起点，格式 HH:mm */
  readonly openFrom: ClockTime;
  /** 每天开放时间终点，格式 HH:mm */
  readonly openTo: ClockTime;
  /** 该场地具备的设备 ID 列表 */
  readonly equipmentIds: readonly EquipmentId[];
  /**
   * 可选：距校园中心的相对距离（米）。
   * 用途：后续候选方案排序时按距离/通达性做次要排序依据。
   * 为模拟相对值，不代表真实地理数据，不做地图坐标，避免过度设计。
   */
  readonly distanceToCenterMeters?: number;
}

/** 可计量资源（工作人员、桌椅、标识、饮用水等）。 */
export interface ResourceUnit {
  /** 资源 ID */
  readonly id: ResourceId;
  /** 资源名称（含计量单位说明） */
  readonly name: string;
  /** 资源总量，非负整数 */
  readonly total: number;
  /** 当前可用量，非负整数且不大于 total */
  readonly available: number;
}
