import type { ActivityId, VenueId } from './ids';
import type { TimeSlot } from './time';

/**
 * 模拟可选时段条目（F3-A 方案 B：显式模拟时段目录）。
 *
 * 重要声明：`slot` 仅为教学演练用的模拟候选时段，**不代表真实空闲状态、
 * 不代表真实预约记录、也不代表已获场地批准**；是否可行一律由引擎硬约束
 * （开放时段、同场地冲突、容量、设备、资源）逐候选评估决定。
 *
 * 关联语义：
 * - `activityId` 必填：条目只对同一活动的目标状态生效；
 * - `venueId` 可选：缺省表示与该活动的全部候选场地组合，指定表示只与该场地组合；
 * - `slot` 自带日期（YYYY-MM-DDTHH:mm），起止时间构成半开区间 [start, end)；
 * - 条目时长必须与 target.slot 时长一致，不一致的条目不进入候选集（由引擎报告）。
 *
 * 条目不定义独立 ID：唯一性由 `activityId + venueId + slot` 组合键表达，
 * 引擎侧由 candidateKey（`venueId@start~end`）与 seenKeys 去重保证。
 * 本文件只定义类型，不含任何运行时代码。
 */
export interface SimulatedSlotOption {
  /** 关联活动 ID（必填），必须与 target.activityId 匹配。 */
  readonly activityId: ActivityId;
  /** 关联场地 ID（可选）：缺省 = 与全部候选场地组合；指定 = 只与该场地组合。 */
  readonly venueId?: VenueId;
  /** 模拟可选时段：日期与起止时间由 TimeSlot 表达，不代表真实空闲或已预约状态。 */
  readonly slot: TimeSlot;
}
