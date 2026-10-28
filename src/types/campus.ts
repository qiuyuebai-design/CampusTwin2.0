import type { Activity } from './activity';
import type { ActivityChange } from './change';
import type { Equipment, ResourceUnit, Venue } from './resource';
import type { SimulatedSlotOption } from './slot';

/**
 * 校园模拟数据集契约：后续 `runScheduling(change, dataset)` 的数据入口类型。
 *
 * 集合按"被引用方在前"排列：
 * equipment / venues / resources → activities → changes。
 */
export interface CampusDataset {
  /** 设备目录 */
  readonly equipment: readonly Equipment[];
  /** 场地集合 */
  readonly venues: readonly Venue[];
  /** 可计量资源集合 */
  readonly resources: readonly ResourceUnit[];
  /** 活动集合 */
  readonly activities: readonly Activity[];
  /** 活动变更记录集合 */
  readonly changes: readonly ActivityChange[];
  /**
   * 模拟可选时段目录（F3-A 方案 B，可选字段，不参与任何真实状态表达）。
   * 条目全部为编造的模拟候选时段，不代表真实空闲、真实预约或已获场地批准。
   * 仅当枚举开关（enumerateSlots）开启时由候选层读取；字段缺省或过滤后为空时
   * 候选层回退到基准时段评估。设为可选以兼容既有 CampusDataset 字面量测试夹具。
   */
  readonly slotCatalog?: readonly SimulatedSlotOption[];
}
