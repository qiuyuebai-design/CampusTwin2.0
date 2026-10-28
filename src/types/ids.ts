/**
 * 领域 ID 统一命名规范：`<前缀>-<三位序号>`，全小写，序号在各自集合内唯一且稳定。
 *
 * | 实体 | 前缀 | 示例 |
 * | --- | --- | --- |
 * | 活动 Activity | act | act-001 |
 * | 场地 Venue | venue | venue-001 |
 * | 设备 Equipment | eq | eq-001 |
 * | 资源 ResourceUnit | res | res-001 |
 * | 变更 ActivityChange | chg | chg-001 |
 *
 * 模板字面量类型在编译期锁定前缀，"三位序号"这一半由
 * `src/data/campus.test.ts` 的正则校验保证（避免引入类型断言）。
 */

/** 活动 ID，形如 `act-001`。 */
export type ActivityId = `act-${string}`;

/** 场地 ID，形如 `venue-001`。 */
export type VenueId = `venue-${string}`;

/** 设备 ID，形如 `eq-001`。 */
export type EquipmentId = `eq-${string}`;

/** 资源 ID，形如 `res-001`。 */
export type ResourceId = `res-${string}`;

/** 变更记录 ID，形如 `chg-001`。 */
export type ChangeId = `chg-${string}`;
