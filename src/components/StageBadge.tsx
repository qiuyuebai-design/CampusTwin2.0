import type { ReactElement } from 'react';
import type { PhaseMeta } from '../types/project';
import { formatPhaseStatus } from '../utils/format';

interface StageBadgeProps {
  phase: PhaseMeta;
}

export default function StageBadge({ phase }: StageBadgeProps): ReactElement {
  return (
    <article className="stage-card">
      <div className="stage-card__head">
        <span className="stage-card__id">{phase.id}</span>
        <span className={`stage-card__status stage-card__status--${phase.status}`}>
          {formatPhaseStatus(phase.status)}
        </span>
      </div>
      <h3 className="stage-card__label">{phase.label}</h3>
      <p className="stage-card__summary">{phase.summary}</p>
    </article>
  );
}
