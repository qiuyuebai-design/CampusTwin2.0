import type { ReactElement } from 'react';
import type { Activity } from '../types/activity';
import type { ResourceUnit, Venue } from '../types/resource';

interface ActivityListProps {
  readonly activities: readonly Activity[];
  readonly venues: readonly Venue[];
  readonly resources: readonly ResourceUnit[];
  readonly selectedActivityId: string;
  readonly onSelect: (activityId: string) => void;
}

export default function ActivityList({
  activities,
  venues,
  resources,
  selectedActivityId,
  onSelect
}: ActivityListProps): ReactElement {
  const venueName = (id: string): string => venues.find((venue) => venue.id === id)?.name ?? id;
  const resourceName = (id: string): string =>
    resources.find((resource) => resource.id === id)?.name ?? id;

  return (
    <ul className="wb-activities">
      {activities.map((activity) => {
        const selected = activity.id === selectedActivityId;
        const needs = Object.entries(activity.resourceNeeds)
          .map(([resourceId, amount]) => `${resourceName(resourceId)} × ${amount}`)
          .join('；');

        return (
          <li key={activity.id}>
            <button
              type="button"
              className={`wb-activity${selected ? ' wb-activity--selected' : ''}`}
              aria-pressed={selected}
              onClick={() => onSelect(activity.id)}
            >
              <span className="wb-activity__head">
                <span className="wb-activity__name">{activity.name}</span>
                <span className="wb-activity__id">{activity.id}</span>
              </span>
              <span className="wb-activity__time">
                {activity.currentSlot.start} → {activity.currentSlot.end}
              </span>
              <span className="wb-activity__venue">
                {venueName(activity.currentVenueId)} · 预计 {activity.expectedAttendance} 人
              </span>
              <span className="wb-activity__needs">资源需求：{needs}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
