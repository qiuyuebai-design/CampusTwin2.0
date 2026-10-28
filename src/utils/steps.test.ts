import { describe, expect, it } from 'vitest';
import type { WorkflowStep } from '../types/project';
import { sortByOrder } from './steps';

const steps: readonly WorkflowStep[] = [
  {
    id: 'schedule-output',
    order: 4,
    title: '调度推荐',
    summary: '输出推荐方案、推荐理由与资源调度建议。',
    owner: 'src/services'
  },
  {
    id: 'change-input',
    order: 1,
    title: '变更输入',
    summary: '录入校园活动的变更事件。',
    owner: 'src/pages'
  },
  {
    id: 'plan-scoring',
    order: 3,
    title: '方案评分',
    summary: '按多维权重打分排序。',
    owner: 'src/engine'
  },
  {
    id: 'constraint-filter',
    order: 2,
    title: '约束过滤',
    summary: '剔除不满足硬约束的候选方案。',
    owner: 'src/engine'
  }
];

describe('sortByOrder', () => {
  it('按 order 升序返回', () => {
    expect(sortByOrder(steps).map((step) => step.id)).toEqual([
      'change-input',
      'constraint-filter',
      'plan-scoring',
      'schedule-output'
    ]);
  });

  it('不修改传入数组', () => {
    const originalIds = steps.map((step) => step.id);
    sortByOrder(steps);
    expect(steps.map((step) => step.id)).toEqual(originalIds);
  });

  it('空数组返回空数组', () => {
    expect(sortByOrder([])).toEqual([]);
  });
});
