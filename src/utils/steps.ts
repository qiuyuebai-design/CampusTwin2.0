import type { WorkflowStep } from '../types/project';

/** 按 order 升序返回新数组，不修改入参。 */
export function sortByOrder(steps: readonly WorkflowStep[]): WorkflowStep[] {
  return [...steps].sort((left, right) => left.order - right.order);
}
