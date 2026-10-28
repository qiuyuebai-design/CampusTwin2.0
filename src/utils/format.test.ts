import { describe, expect, it } from 'vitest';
import { formatPhaseStatus, formatStepIndex } from './format';

describe('formatStepIndex', () => {
  it('个位数序号补零为两位', () => {
    expect(formatStepIndex(1)).toBe('01');
    expect(formatStepIndex(9)).toBe('09');
  });

  it('两位及以上序号原样返回', () => {
    expect(formatStepIndex(10)).toBe('10');
    expect(formatStepIndex(128)).toBe('128');
  });

  it('拒绝小于 1 的序号', () => {
    expect(() => formatStepIndex(0)).toThrow(RangeError);
  });

  it('拒绝非整数序号', () => {
    expect(() => formatStepIndex(1.5)).toThrow(RangeError);
  });
});

describe('formatPhaseStatus', () => {
  it('映射为中文阶段状态', () => {
    expect(formatPhaseStatus('done')).toBe('已完成');
    expect(formatPhaseStatus('current')).toBe('进行中');
    expect(formatPhaseStatus('planned')).toBe('规划中');
  });
});
