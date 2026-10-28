/**
 * 校园当地时间的日期时间字符串，格式固定为 `YYYY-MM-DDTHH:mm`。
 *
 * 约定：
 * 1. 一律为校园当地时间，不附加时区后缀（无 `Z`、无 `+08:00`）。
 * 2. 年四位、月日时分两位，不足补零。
 * 3. 格式由 `src/data/campus.test.ts` 的正则校验保证。
 */
export type LocalDateTime = string;

/** 每天的开放时刻，格式固定为 `HH:mm`，时与分补零到两位。 */
export type ClockTime = string;

/**
 * 时间段契约：统一采用半开区间 [start, end)。
 * 即 `end` 时刻本身不属于该时段，一个活动的结束时刻可以是下一个活动的开始时刻。
 *
 * 本阶段只定义类型与基本校验（start 早于 end），不实现时间冲突判定算法。
 */
export interface TimeSlot {
  readonly start: LocalDateTime;
  readonly end: LocalDateTime;
}
