import type { PhaseStatus } from '../types/project';

/** 把阶段状态映射为中文标签。 */
export function formatPhaseStatus(status: PhaseStatus): string {
  switch (status) {
    case 'done':
      return '已完成';
    case 'current':
      return '进行中';
    case 'planned':
      return '规划中';
    default: {
      const unexpected: never = status;
      throw new Error(`未知的阶段状态：${String(unexpected)}`);
    }
  }
}

/** 步骤序号格式化：个位数补零为两位，两位及以上原样返回。 */
export function formatStepIndex(index: number): string {
  if (!Number.isInteger(index) || index < 1) {
    throw new RangeError(`步骤序号必须是不小于 1 的整数，收到：${index}`);
  }
  return index < 10 ? `0${index}` : String(index);
}
