import type { ReactElement } from 'react';
import type { WorkflowStep } from '../types/project';
import { formatStepIndex } from '../utils/format';
import { sortByOrder } from '../utils/steps';

interface WorkflowStripProps {
  steps: readonly WorkflowStep[];
}

export default function WorkflowStrip({ steps }: WorkflowStripProps): ReactElement {
  const orderedSteps = sortByOrder(steps);

  return (
    <ol className="workflow">
      {orderedSteps.map((step, index) => (
        <li className="workflow__item" key={step.id}>
          <span className="workflow__index">{formatStepIndex(index + 1)}</span>
          <h3 className="workflow__title">{step.title}</h3>
          <p className="workflow__summary">{step.summary}</p>
          <span className="workflow__owner">实现归属：{step.owner}</span>
        </li>
      ))}
    </ol>
  );
}
