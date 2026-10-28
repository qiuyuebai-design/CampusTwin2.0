import { describe, expect, it } from 'vitest';
import { homePageModel } from './home';

describe('homePageModel', () => {
  it('工作流 order 从 1 连续递增且唯一', () => {
    const orders = homePageModel.workflow.map((step) => step.order).sort((left, right) => left - right);
    expect(orders).toEqual([1, 2, 3, 4]);
  });

  it('工作流步骤 id 唯一', () => {
    const ids = homePageModel.workflow.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每个步骤都指定了 src 下的实现归属目录', () => {
    for (const step of homePageModel.workflow) {
      expect(step.owner.startsWith('src/')).toBe(true);
    }
  });
});
