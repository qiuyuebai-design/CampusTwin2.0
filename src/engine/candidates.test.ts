import { describe, expect, it } from 'vitest';
import type { Activity } from '../types/activity';
import type { CampusDataset } from '../types/campus';
import type { ActivityChange } from '../types/change';
import type { ActivityId, VenueId } from '../types/ids';
import type { Venue } from '../types/resource';
import type { TimeSlot } from '../types/time';
import { campusDataset } from '../data/campus';
import {
  buildTargetState,
  evaluateCandidates,
  isUsableDistance,
  rankCandidates,
  scoreCandidate,
  type Candidate,
  type CandidateScore,
  type ScoringMode
} from './candidates';

function activityOf(dataset: CampusDataset, id: ActivityId): Activity {
  const activity = dataset.activities.find((item) => item.id === id);
  if (activity === undefined) {
    throw new Error(`测试夹具缺少活动 ${id}`);
  }
  return activity;
}

function changeOf(dataset: CampusDataset, id: string): ActivityChange {
  const change = dataset.changes.find((item) => item.id === id);
  if (change === undefined) {
    throw new Error(`测试夹具缺少变更 ${id}`);
  }
  return change;
}

function makeCandidate(venueId: VenueId, score: CandidateScore | null): Candidate {
  const slot: TimeSlot = { start: '2026-10-20T09:00', end: '2026-10-20T10:00' };
  return {
    candidateKey: `${venueId}@${slot.start}~${slot.end}`,
    venueId,
    venueName: `模拟·${venueId}`,
    isCurrentVenue: false,
    slot,
    evaluation: { venueId, slot, passed: true, checks: [], failureReasons: [] },
    score
  };
}

/** 距离缺失与距离非法并存的夹具集合，用于验证评分口径统一。 */
const mixedDistanceDataset: CampusDataset = {
  equipment: [],
  venues: [
    {
      id: 'venue-001',
      name: '模拟·甲场地',
      capacity: 100,
      openFrom: '08:00',
      openTo: '22:00',
      equipmentIds: [],
      distanceToCenterMeters: 100
    },
    {
      id: 'venue-002',
      name: '模拟·乙场地（距离缺失）',
      capacity: 200,
      openFrom: '08:00',
      openTo: '22:00',
      equipmentIds: []
    },
    {
      id: 'venue-003',
      name: '模拟·丙场地（距离非法）',
      capacity: 300,
      openFrom: '08:00',
      openTo: '22:00',
      equipmentIds: [],
      distanceToCenterMeters: Number.POSITIVE_INFINITY
    }
  ],
  resources: [],
  activities: [
    {
      id: 'act-020',
      name: '模拟·活动壬',
      expectedAttendance: 50,
      currentVenueId: 'venue-001',
      currentSlot: { start: '2026-10-20T09:00', end: '2026-10-20T10:00' },
      requiredEquipmentIds: [],
      resourceNeeds: {}
    }
  ],
  changes: [
    {
      id: 'chg-020',
      activityId: 'act-020',
      kind: 'venue',
      description: '演练：候选中存在距离缺失与距离非法的场地。',
      requestedAt: '2026-10-16T10:10',
      requestedBy: 'role-venue-admin-01',
      payload: { before: 'venue-001', minCapacity: 50, requiredEquipmentIds: [] }
    }
  ]
};

describe('目标状态构建（buildTargetState）', () => {
  it('time 变更使用 payload.after 作为目标时间段（chg-001）', () => {
    const outcome = buildTargetState(
      campusDataset,
      changeOf(campusDataset, 'chg-001'),
      activityOf(campusDataset, 'act-001')
    );

    expect(outcome.errors).toEqual([]);
    expect(outcome.target?.slot).toEqual({
      start: '2026-10-20T08:30',
      end: '2026-10-20T12:00'
    });
    expect(outcome.target?.attendance).toBe(220);
    expect(outcome.target?.requiredCapacity).toBe(220);
    expect(outcome.target?.candidateVenueIds).toEqual(['venue-002']);
    expect(outcome.target?.resourceNeeds).toEqual({
      'res-001': 12,
      'res-002': 30,
      'res-003': 8,
      'res-004': 20
    });
    expect(outcome.warnings.join('；')).toContain('不擅自迁移场地');
  });

  it('venue 变更合并容量下限与设备要求，并只评估指定目标场地（chg-002）', () => {
    const outcome = buildTargetState(
      campusDataset,
      changeOf(campusDataset, 'chg-002'),
      activityOf(campusDataset, 'act-003')
    );

    expect(outcome.target?.requiredCapacity).toBe(90);
    expect(outcome.target?.requiredEquipmentIds).toEqual(['eq-001', 'eq-002']);
    expect(outcome.target?.candidateVenueIds).toEqual(['venue-004']);
    expect(outcome.target?.slot).toEqual({
      start: '2026-10-22T14:00',
      end: '2026-10-22T16:00'
    });
    expect(outcome.target?.attendance).toBe(90);
  });

  it('scale 变更使用 after 人数重新核算容量（chg-003）', () => {
    const outcome = buildTargetState(
      campusDataset,
      changeOf(campusDataset, 'chg-003'),
      activityOf(campusDataset, 'act-002')
    );

    expect(outcome.target?.attendance).toBe(560);
    expect(outcome.target?.requiredCapacity).toBe(560);
    expect(outcome.target?.candidateVenueIds).toEqual(['venue-005']);
    expect(outcome.target?.slot).toEqual({
      start: '2026-10-21T18:30',
      end: '2026-10-21T21:30'
    });
  });

  it('resource 变更按 after 目标数量生成设备与资源需求（chg-004）', () => {
    const outcome = buildTargetState(
      campusDataset,
      changeOf(campusDataset, 'chg-004'),
      activityOf(campusDataset, 'act-004')
    );

    expect(outcome.errors).toEqual([]);
    expect(outcome.target?.requiredEquipmentIds).toEqual(['eq-003', 'eq-005', 'eq-004']);
    expect(outcome.target?.resourceNeeds).toEqual({ 'res-001': 6, 'res-004': 10 });
    expect(outcome.warnings.join('；')).toContain('设备数量无法验证');
    expect(outcome.warnings.join('；')).toContain('不做增量扣减');
  });

  it('venue 变更未指定目标场地时枚举除当前场地外的全部场地', () => {
    const venueChange: ActivityChange = {
      id: 'chg-901',
      activityId: 'act-003',
      kind: 'venue',
      description: '演练：场地变更未指定目标场地。',
      requestedAt: '2026-10-16T10:05',
      requestedBy: 'role-venue-admin-01',
      payload: {
        before: 'venue-001',
        minCapacity: 90,
        requiredEquipmentIds: ['eq-001', 'eq-002']
      }
    };

    const outcome = buildTargetState(campusDataset, venueChange, activityOf(campusDataset, 'act-003'));
    expect(outcome.target?.candidateVenueIds).toEqual([
      'venue-002',
      'venue-003',
      'venue-004',
      'venue-005',
      'venue-006'
    ]);
    expect(outcome.warnings.join('；')).toContain('未指定目标场地');
  });

  it('未知设备 ID 明确报错', () => {
    const badChange: ActivityChange = {
      id: 'chg-904',
      activityId: 'act-004',
      kind: 'resource',
      description: '演练：未知设备 ID。',
      requestedAt: '2026-10-16T14:15',
      requestedBy: 'role-student-union-01',
      payload: {
        equipmentAdjustments: [{ id: 'eq-999', after: 1 }],
        resourceAdjustments: []
      }
    };

    const outcome = buildTargetState(campusDataset, badChange, activityOf(campusDataset, 'act-004'));
    expect(outcome.target).toBeNull();
    expect(outcome.errors).toEqual(['设备 eq-999 未在数据集中定义']);
  });

  it('未知资源 ID 明确报错', () => {
    const badChange: ActivityChange = {
      id: 'chg-905',
      activityId: 'act-004',
      kind: 'resource',
      description: '演练：未知资源 ID。',
      requestedAt: '2026-10-16T14:15',
      requestedBy: 'role-student-union-01',
      payload: {
        equipmentAdjustments: [],
        resourceAdjustments: [{ id: 'res-999', after: 2 }]
      }
    };

    const outcome = buildTargetState(campusDataset, badChange, activityOf(campusDataset, 'act-004'));
    expect(outcome.target).toBeNull();
    expect(outcome.errors).toEqual(['资源 res-999 未在数据集中定义']);
  });

  it('resource 变更不再假定每种设备当前数量为 1，只映射目标设备种类', () => {
    const change: ActivityChange = {
      id: 'chg-911',
      activityId: 'act-004',
      kind: 'resource',
      description: '演练：设备数量调整不产生数量假设。',
      requestedAt: '2026-10-16T14:20',
      requestedBy: 'role-student-union-01',
      payload: {
        equipmentAdjustments: [
          { id: 'eq-003', before: 1, after: 4 },
          { id: 'eq-004', after: 2 }
        ],
        resourceAdjustments: []
      }
    };

    const outcome = buildTargetState(campusDataset, change, activityOf(campusDataset, 'act-004'));
    expect(outcome.errors).toEqual([]);
    expect(outcome.target?.requiredEquipmentIds).toEqual(['eq-003', 'eq-005', 'eq-004']);
    expect(outcome.target?.requiredEquipmentIds).toHaveLength(3);
    expect(outcome.warnings.join('；')).toContain('不假定每种设备当前数量为 1');
    expect(outcome.warnings.join('；')).toContain('不检查数量');
    expect(outcome.warnings.join('；')).toContain('设备 eq-003 的 before=1 无法验证');
  });

  it('设备 after=0 时从目标需求种类中移除，并明确说明数量未验证', () => {
    const change: ActivityChange = {
      id: 'chg-912',
      activityId: 'act-004',
      kind: 'resource',
      description: '演练：目标状态不再请求某设备种类。',
      requestedAt: '2026-10-16T14:25',
      requestedBy: 'role-student-union-01',
      payload: {
        equipmentAdjustments: [{ id: 'eq-005', before: 1, after: 0 }],
        resourceAdjustments: []
      }
    };

    const outcome = buildTargetState(campusDataset, change, activityOf(campusDataset, 'act-004'));
    expect(outcome.errors).toEqual([]);
    expect(outcome.target?.requiredEquipmentIds).toEqual(['eq-003']);
    expect(outcome.warnings.join('；')).toContain('after=0');
    expect(outcome.warnings.join('；')).toContain('种类映射');
    expect(outcome.warnings.join('；')).toContain('不代表真实设备数量');
    expect(outcome.warnings.join('；')).toContain('设备 eq-005 的 before=1 无法验证');
  });

  it('未知设备 ID 配合 after: 0 时同样被拒绝，并给出具体原因', () => {
    const change: ActivityChange = {
      id: 'chg-913',
      activityId: 'act-004',
      kind: 'resource',
      description: '演练：未知设备 ID 且 after 为 0，不得静默忽略。',
      requestedAt: '2026-10-16T14:30',
      requestedBy: 'role-student-union-01',
      payload: {
        equipmentAdjustments: [{ id: 'eq-999', after: 0 }],
        resourceAdjustments: []
      }
    };

    const outcome = buildTargetState(campusDataset, change, activityOf(campusDataset, 'act-004'));
    expect(outcome.target).toBeNull();
    expect(outcome.errors).toEqual(['设备 eq-999 未在数据集中定义']);
    expect(outcome.errors.join('；')).toContain('eq-999');
    expect(outcome.errors.join('；')).toContain('未在数据集中定义');
  });

  it('同一设备 ID 在 equipmentAdjustments 中重复出现时拒绝，两种顺序都拒绝（消除顺序依赖）', () => {
    const forward: ActivityChange = {
      id: 'chg-914',
      activityId: 'act-004',
      kind: 'resource',
      description: '演练：同一设备 ID 重复调整（after 先 1 后 0）。',
      requestedAt: '2026-10-16T14:35',
      requestedBy: 'role-student-union-01',
      payload: {
        equipmentAdjustments: [
          { id: 'eq-004', after: 1 },
          { id: 'eq-004', after: 0 }
        ],
        resourceAdjustments: []
      }
    };
    const backward: ActivityChange = {
      id: 'chg-916',
      activityId: 'act-004',
      kind: 'resource',
      description: '演练：同一设备 ID 重复调整（after 先 0 后 1）。',
      requestedAt: '2026-10-16T14:36',
      requestedBy: 'role-student-union-01',
      payload: {
        equipmentAdjustments: [
          { id: 'eq-004', after: 0 },
          { id: 'eq-004', after: 1 }
        ],
        resourceAdjustments: []
      }
    };

    const activity = activityOf(campusDataset, 'act-004');
    const expectedErrors = [
      '设备 eq-004 在 equipmentAdjustments 中重复出现：重复调整会引入顺序依赖，已拒绝'
    ];

    const forwardOutcome = buildTargetState(campusDataset, forward, activity);
    expect(forwardOutcome.target).toBeNull();
    expect(forwardOutcome.errors).toEqual(expectedErrors);

    const backwardOutcome = buildTargetState(campusDataset, backward, activity);
    expect(backwardOutcome.target).toBeNull();
    expect(backwardOutcome.errors).toEqual(expectedErrors);
  });

  it('同一资源 ID 在 resourceAdjustments 中重复出现时按同一规则拒绝', () => {
    const change: ActivityChange = {
      id: 'chg-915',
      activityId: 'act-004',
      kind: 'resource',
      description: '演练：同一资源 ID 重复调整（after 先 7 后 8）。',
      requestedAt: '2026-10-16T14:40',
      requestedBy: 'role-student-union-01',
      payload: {
        equipmentAdjustments: [],
        resourceAdjustments: [
          { id: 'res-001', after: 7 },
          { id: 'res-001', after: 8 }
        ]
      }
    };

    const outcome = buildTargetState(campusDataset, change, activityOf(campusDataset, 'act-004'));
    expect(outcome.target).toBeNull();
    expect(outcome.errors).toEqual([
      '资源 res-001 在 resourceAdjustments 中重复出现：重复调整会引入顺序依赖，已拒绝'
    ]);
    expect(outcome.errors.join('；')).toContain('顺序依赖');
  });
});

describe('数据集不可变性', () => {
  it('构建目标状态不修改原始 campusDataset', () => {
    const before = JSON.stringify(campusDataset);
    buildTargetState(
      campusDataset,
      changeOf(campusDataset, 'chg-004'),
      activityOf(campusDataset, 'act-004')
    );
    expect(JSON.stringify(campusDataset)).toBe(before);
  });

  it('构建目标状态时复制时间段对象，不与输入时间对象共享引用', () => {
    const activity = activityOf(campusDataset, 'act-002');
    const scaleChange = changeOf(campusDataset, 'chg-003');
    const outcome = buildTargetState(campusDataset, scaleChange, activity);
    const target = outcome.target;
    if (target === null) {
      throw new Error('测试夹具未生成目标状态');
    }

    expect(target.slot).not.toBe(activity.currentSlot);
    expect(target.slot).toEqual(activity.currentSlot);

    const box: { start: string; end: string } = target.slot;
    box.start = '2026-01-01T00:00';
    expect(activity.currentSlot.start).toBe('2026-10-21T18:30');

    const timeChange = changeOf(campusDataset, 'chg-001');
    if (timeChange.kind !== 'time') {
      throw new Error('chg-001 应为 time 变更');
    }
    const timeOutcome = buildTargetState(
      campusDataset,
      timeChange,
      activityOf(campusDataset, 'act-001')
    );
    expect(timeOutcome.target?.slot).not.toBe(timeChange.payload.after);
    expect(timeOutcome.target?.slot).toEqual(timeChange.payload.after);
  });
});

describe('评分（scoreCandidate）', () => {
  const venue: Venue = {
    id: 'venue-004',
    name: '模拟·图书馆报告厅',
    capacity: 200,
    openFrom: '09:00',
    openTo: '20:30',
    equipmentIds: ['eq-001'],
    distanceToCenterMeters: 410
  };

  it('容量适配度与距离按固定权重合成，并给出算式解释', () => {
    const score = scoreCandidate(venue, 90, true);
    expect(score.capacityFitScore).toBe(45);
    expect(score.distanceScore).toBe(59);
    expect(score.total).toBe(50.6);
    expect(score.weightMode).toBe('capacity-and-distance');
    expect(score.explanation[0]).toContain('容量适配度 45.00');
    expect(score.explanation[1]).toContain('距离评分 59.00');
    expect(score.explanation[2]).toContain('0.6 × 容量适配度 + 0.4 × 距离评分');
  });

  it('距离缺失时不编造距离，降级为仅容量适配度', () => {
    const noDistance: Venue = {
      id: 'venue-006',
      name: '模拟·露天广场',
      capacity: 1000,
      openFrom: '06:00',
      openTo: '22:00',
      equipmentIds: []
    };

    const missing = scoreCandidate(noDistance, 100, true);
    expect(missing.distanceMeters).toBeNull();
    expect(missing.distanceScore).toBeNull();
    expect(missing.weightMode).toBe('capacity-only');
    expect(missing.total).toBe(10);
    expect(missing.explanation.join('；')).toContain('不编造距离');

    const downgrade = scoreCandidate(venue, 90, false);
    expect(downgrade.weightMode).toBe('capacity-only');
    expect(downgrade.total).toBe(45);
    expect(downgrade.explanation.join('；')).toContain('公平比较');
    expect(downgrade.explanation.join('；')).toContain('不编造距离');
  });

  it('距离为 Infinity 或负数时视为不可用，同样降级为仅容量适配度', () => {
    const infinite: Venue = {
      id: 'venue-007',
      name: '模拟·距离无穷',
      capacity: 100,
      openFrom: '08:00',
      openTo: '20:00',
      equipmentIds: [],
      distanceToCenterMeters: Number.POSITIVE_INFINITY
    };
    const negative: Venue = {
      id: 'venue-008',
      name: '模拟·距离为负',
      capacity: 100,
      openFrom: '08:00',
      openTo: '20:00',
      equipmentIds: [],
      distanceToCenterMeters: -5
    };

    expect(isUsableDistance(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isUsableDistance(Number.NaN)).toBe(false);
    expect(isUsableDistance(-5)).toBe(false);
    expect(isUsableDistance(0)).toBe(true);
    expect(isUsableDistance(410)).toBe(true);
    expect(isUsableDistance(undefined)).toBe(false);

    const infiniteScore = scoreCandidate(infinite, 50, true);
    expect(infiniteScore.distanceMeters).toBeNull();
    expect(infiniteScore.distanceScore).toBeNull();
    expect(infiniteScore.weightMode).toBe('capacity-only');
    expect(infiniteScore.total).toBe(50);
    expect(infiniteScore.explanation.join('；')).toContain('不编造距离');

    const negativeScore = scoreCandidate(negative, 50, true);
    expect(negativeScore.weightMode).toBe('capacity-only');
    expect(negativeScore.distanceScore).toBeNull();
    expect(negativeScore.total).toBe(50);
  });
});

describe('排序（rankCandidates）', () => {
  it('总分降序，平分时按 venueId 升序，且与输入顺序无关、重复运行一致', () => {
    const venueA: Venue = {
      id: 'venue-002',
      name: '模拟·乙场地',
      capacity: 200,
      openFrom: '08:00',
      openTo: '20:00',
      equipmentIds: [],
      distanceToCenterMeters: 300
    };
    const venueB: Venue = {
      id: 'venue-009',
      name: '模拟·壬场地',
      capacity: 200,
      openFrom: '08:00',
      openTo: '20:00',
      equipmentIds: [],
      distanceToCenterMeters: 300
    };
    const venueC: Venue = {
      id: 'venue-003',
      name: '模拟·丙场地',
      capacity: 100,
      openFrom: '08:00',
      openTo: '20:00',
      equipmentIds: [],
      distanceToCenterMeters: 300
    };

    const scoreTie = scoreCandidate(venueA, 100, true);
    const scoreTwin = scoreCandidate(venueB, 100, true);
    const scoreBetter = scoreCandidate(venueC, 100, true);

    expect(scoreTie.total).toBe(scoreTwin.total);
    expect(scoreBetter.total).toBeGreaterThan(scoreTie.total);

    const input = [
      makeCandidate('venue-009', scoreTwin),
      makeCandidate('venue-002', scoreTie),
      makeCandidate('venue-003', scoreBetter)
    ];

    const first = rankCandidates(input).map((item) => item.venueId);
    const second = rankCandidates([...input].reverse()).map((item) => item.venueId);

    expect(first).toEqual(['venue-003', 'venue-002', 'venue-009']);
    expect(second).toEqual(first);
  });
});

describe('候选集评估（evaluateCandidates）', () => {
  it('硬约束过滤后可行与被排除分流，被排除保留原因', () => {
    const venueChange: ActivityChange = {
      id: 'chg-901',
      activityId: 'act-003',
      kind: 'venue',
      description: '演练：场地变更未指定目标场地。',
      requestedAt: '2026-10-16T10:05',
      requestedBy: 'role-venue-admin-01',
      payload: {
        before: 'venue-001',
        minCapacity: 90,
        requiredEquipmentIds: ['eq-001', 'eq-002']
      }
    };

    const activity = activityOf(campusDataset, 'act-003');
    const outcome = buildTargetState(campusDataset, venueChange, activity);
    expect(outcome.target).not.toBeNull();
    if (outcome.target === null) {
      return;
    }

    const set = evaluateCandidates(campusDataset, outcome.target, activity);
    expect(set.scoringMode).toBe('capacity-and-distance');

    expect(set.feasible.map((item) => item.venueId)).toEqual(['venue-004', 'venue-002']);
    expect(set.feasible.map((item) => item.score?.total)).toEqual([50.6, 47.6]);
    expect(set.feasible[0]?.score?.explanation.join('；')).toContain('0.6 × 容量适配度');

    expect(set.excluded.map((item) => item.venueId)).toEqual(['venue-003', 'venue-005', 'venue-006']);

    const venue3 = set.excluded.find((item) => item.venueId === 'venue-003');
    expect(venue3?.evaluation.failureReasons.join('；')).toContain('容量 80 人 < 需求 90 人');
    expect(venue3?.evaluation.failureReasons.join('；')).toContain('缺少设备种类');

    const venue5 = set.excluded.find((item) => item.venueId === 'venue-005');
    expect(venue5?.evaluation.failureReasons.join('；')).toContain('eq-001 投影仪');
    expect(venue5?.evaluation.failureReasons.join('；')).not.toContain('场地容量');
  });

  it('候选集合存在缺失或非法距离时统一使用 capacity-only，禁止混合评分口径', () => {
    const activity = activityOf(mixedDistanceDataset, 'act-020');
    const outcome = buildTargetState(
      mixedDistanceDataset,
      changeOf(mixedDistanceDataset, 'chg-020'),
      activity
    );
    const target = outcome.target;
    if (target === null) {
      throw new Error('测试夹具未生成目标状态');
    }

    const set = evaluateCandidates(mixedDistanceDataset, target, activity);
    expect(set.scoringMode).toBe('capacity-only');
    expect(set.feasible.map((item) => item.venueId)).toEqual(['venue-002', 'venue-003']);
    expect(set.warnings.join('；')).toContain('禁止混合评分口径');

    for (const candidate of set.feasible) {
      expect(candidate.score?.weightMode).toBe('capacity-only');
      expect(candidate.score?.distanceScore).toBeNull();
      expect(candidate.score?.total).toBe(candidate.score?.capacityFitScore);
    }
  });

  it('scoringMode 与全部可行候选的 weightMode 保持一致', () => {
    const campusActivity = activityOf(campusDataset, 'act-003');
    const campusOutcome = buildTargetState(
      campusDataset,
      changeOf(campusDataset, 'chg-002'),
      campusActivity
    );
    const mixedActivity = activityOf(mixedDistanceDataset, 'act-020');
    const mixedOutcome = buildTargetState(
      mixedDistanceDataset,
      changeOf(mixedDistanceDataset, 'chg-020'),
      mixedActivity
    );

    const campusTarget = campusOutcome.target;
    const mixedTarget = mixedOutcome.target;
    if (campusTarget === null || mixedTarget === null) {
      throw new Error('测试夹具未生成目标状态');
    }

    const sets = [
      evaluateCandidates(campusDataset, campusTarget, campusActivity),
      evaluateCandidates(mixedDistanceDataset, mixedTarget, mixedActivity)
    ];

    expect(sets.map((set) => set.scoringMode)).toEqual([
      'capacity-and-distance',
      'capacity-only'
    ]);

    for (const set of sets) {
      const modes = new Set<ScoringMode | undefined>(
        set.feasible.map((item) => item.score?.weightMode)
      );
      expect(modes.size).toBeLessThanOrEqual(1);
      for (const candidate of set.feasible) {
        expect(candidate.score?.weightMode).toBe(set.scoringMode);
      }
      for (const candidate of set.excluded) {
        expect(candidate.score).toBeNull();
      }
    }
  });
});

/* ---------- F3-A：场地 × 时段 组合候选（方案 B：时段来源为 campusDataset.slotCatalog 显式模拟目录） ---------- */

function venueChangeFixture(minCapacity: number): ActivityChange {
  return {
    id: 'chg-930',
    activityId: 'act-003',
    kind: 'venue',
    description: '演练：场地 × 时段组合候选。',
    requestedAt: '2026-10-16T10:05',
    requestedBy: 'role-venue-admin-01',
    payload: {
      before: 'venue-001',
      minCapacity,
      requiredEquipmentIds: ['eq-001', 'eq-002']
    }
  };
}

describe('F3-A 组合候选（场地 × 时段）', () => {
  const activity = activityOf(campusDataset, 'act-003');

  function enumeratedSet(minCapacity = 90) {
    const outcome = buildTargetState(campusDataset, venueChangeFixture(minCapacity), activity);
    if (outcome.target === null) {
      throw new Error('测试夹具未生成目标状态');
    }
    return evaluateCandidates(campusDataset, outcome.target, activity, { enumerateSlots: true });
  }

  it('同一场地产生多个时段、多个场地组合出 ≥3 个可辨别候选，candidateKey 全局唯一', () => {
    const set = enumeratedSet();
    const all = [...set.feasible, ...set.excluded];
    expect(all.length).toBeGreaterThanOrEqual(3);
    const keys = all.map((item) => item.candidateKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(set.feasible.map((item) => item.venueId)).size).toBeGreaterThanOrEqual(2);
    expect(new Set(set.feasible.map((item) => item.slot.start)).size).toBeGreaterThanOrEqual(2);
    for (const item of all) {
      expect(item.candidateKey).toBe(`${item.venueId}@${item.slot.start}~${item.slot.end}`);
    }
  });

  it('默认不枚举时候选 slot 与目标 slot 完全一致（预置/单时段语义不变）', () => {
    const outcome = buildTargetState(campusDataset, venueChangeFixture(90), activity);
    if (outcome.target === null) {
      throw new Error('测试夹具未生成目标状态');
    }
    const set = evaluateCandidates(campusDataset, outcome.target, activity);
    expect(set.feasible.map((item) => item.venueId)).toEqual(['venue-004', 'venue-002']);
    for (const item of [...set.feasible, ...set.excluded]) {
      expect(item.slot).toEqual(outcome.target.slot);
    }
  });

  it('重复 venueId 不重复生成候选', () => {
    const outcome = buildTargetState(campusDataset, venueChangeFixture(90), activity);
    if (outcome.target === null) {
      throw new Error('测试夹具未生成目标状态');
    }
    const plain = evaluateCandidates(campusDataset, outcome.target, activity);
    const dupTarget = {
      ...outcome.target,
      candidateVenueIds: [
        ...outcome.target.candidateVenueIds,
        ...outcome.target.candidateVenueIds
      ]
    };
    const dup = evaluateCandidates(campusDataset, dupTarget, activity);
    expect(dup.feasible.length + dup.excluded.length).toBe(
      plain.feasible.length + plain.excluded.length
    );
  });

  it('硬约束逐候选生效：同一场地前段时段可行、后段超出开放时段单独被排除', () => {
    const set = enumeratedSet();
    const feasibleKeys = set.feasible.map((item) => item.candidateKey);
    const excludedVenue004 = set.excluded.filter((item) => item.venueId === 'venue-004');

    expect(feasibleKeys).toContain('venue-004@2026-10-22T14:00~2026-10-22T16:00');
    expect(excludedVenue004.length).toBeGreaterThan(0);
    for (const item of excludedVenue004) {
      expect(item.evaluation.failureReasons.join('；')).toContain('开放时段');
    }
    expect(feasibleKeys).not.toContain('venue-004@2026-10-22T19:00~2026-10-22T21:00');
    expect(excludedVenue004.map((item) => item.slot.start)).toContain('2026-10-22T19:00');
  });

  it('容量不足只影响对应候选：全部场地×时段被排除且逐条带容量原因', () => {
    const set = enumeratedSet(1200);
    expect(set.feasible).toEqual([]);
    expect(set.excluded.length).toBeGreaterThanOrEqual(3);
    for (const item of set.excluded) {
      expect(item.score).toBeNull();
      expect(item.evaluation.failureReasons.join('；')).toMatch(/容量 \d+ 人 < 需求 1200 人/);
    }
  });

  it('跨日基准 + 枚举：退回基准评估并给出警告，跨日原因仍被报告', () => {
    const outcome = buildTargetState(
      campusDataset,
      {
        id: 'chg-931',
        activityId: 'act-003',
        kind: 'time',
        description: '演练：跨日基准。',
        requestedAt: '2026-10-16T10:05',
        requestedBy: 'role-organizer-01',
        payload: { after: { start: '2026-10-22T23:00', end: '2026-10-23T01:00' } }
      },
      activity
    );
    if (outcome.target === null) {
      throw new Error('测试夹具未生成目标状态');
    }
    const set = evaluateCandidates(campusDataset, outcome.target, activity, {
      enumerateSlots: true
    });
    expect(set.warnings.join('；')).toContain('可选时段枚举结果为空');
    expect(set.feasible).toEqual([]);
    expect(set.excluded[0]?.evaluation.failureReasons.join('；')).toContain('跨午夜');
  });

  it('枚举结果重复运行完全一致（确定性）', () => {
    const first = JSON.stringify(enumeratedSet());
    const second = JSON.stringify(enumeratedSet());
    expect(first).toBe(second);
  });
});

/* ---------- F3-A 方案 B：显式模拟时段目录（slotCatalog）行为专项 ---------- */

describe('F3-A 方案 B 显式模拟时段目录', () => {
  const activity = activityOf(campusDataset, 'act-003');

  /** 以 act-003 场地变更（无目标场地）+ 枚举开关评估指定数据集。 */
  function enumerateOn(dataset: CampusDataset, minCapacity = 90): ReturnType<typeof evaluateCandidates> {
    const outcome = buildTargetState(dataset, venueChangeFixture(minCapacity), activity);
    if (outcome.target === null) {
      throw new Error('测试夹具未生成目标状态');
    }
    return evaluateCandidates(dataset, outcome.target, activity, { enumerateSlots: true });
  }

  function allCandidates(set: ReturnType<typeof evaluateCandidates>): readonly Candidate[] {
    return [...set.feasible, ...set.excluded];
  }

  it('目录缺失（slotCatalog 缺省）：回退基准时段并产生枚举结果为空的 warning', () => {
    const noCatalog: CampusDataset = { ...campusDataset, slotCatalog: undefined };
    const outcome = buildTargetState(noCatalog, venueChangeFixture(90), activity);
    if (outcome.target === null) {
      throw new Error('测试夹具未生成目标状态');
    }
    const set = evaluateCandidates(noCatalog, outcome.target, activity, { enumerateSlots: true });

    expect(set.warnings.join('；')).toContain('可选时段枚举结果为空');
    for (const candidate of allCandidates(set)) {
      expect(candidate.slot).toEqual(outcome.target.slot);
      expect(candidate.candidateKey).toBe(
        `${candidate.venueId}@${outcome.target.slot.start}~${outcome.target.slot.end}`
      );
    }
  });

  it('目录中只有其他活动的条目：过滤后为空，回退基准时段并提示', () => {
    const onlyOther: CampusDataset = {
      ...campusDataset,
      slotCatalog: (campusDataset.slotCatalog ?? []).filter(
        (item) => item.activityId !== 'act-003'
      )
    };
    expect((onlyOther.slotCatalog ?? []).length).toBeGreaterThan(0);
    const outcome = buildTargetState(onlyOther, venueChangeFixture(90), activity);
    if (outcome.target === null) {
      throw new Error('测试夹具未生成目标状态');
    }
    const set = evaluateCandidates(onlyOther, outcome.target, activity, { enumerateSlots: true });

    expect(set.warnings.join('；')).toContain('可选时段枚举结果为空');
    for (const candidate of allCandidates(set)) {
      expect(candidate.slot).toEqual(outcome.target.slot);
    }
  });

  it('时长不匹配的条目不进入候选集，并在 warnings 中说明处理方式', () => {
    const act003Entries = (campusDataset.slotCatalog ?? []).filter(
      (item) => item.activityId === 'act-003'
    );
    const mismatched: CampusDataset = {
      ...campusDataset,
      slotCatalog: [
        ...act003Entries.slice(0, 1),
        // 1 小时 ≠ act-003 目标时长 2 小时 → 过滤期剔除
        { activityId: 'act-003', slot: { start: '2026-10-22T20:00', end: '2026-10-22T21:00' } }
      ]
    };
    const set = enumerateOn(mismatched);
    const keys = allCandidates(set).map((item) => item.candidateKey);

    expect(set.warnings.join('；')).toContain('时长不一致');
    expect(set.warnings.join('；')).not.toContain('可选时段枚举结果为空');
    expect(keys.some((key) => key.includes('2026-10-22T14:00~2026-10-22T16:00'))).toBe(true);
    expect(keys.some((key) => key.includes('2026-10-22T20:00~2026-10-22T21:00'))).toBe(false);
  });

  it('重复目录条目经 candidateKey 去重，候选数与单份条目一致且 key 唯一', () => {
    const base = (campusDataset.slotCatalog ?? []).filter(
      (item) => item.activityId === 'act-003'
    );
    const single = enumerateOn({ ...campusDataset, slotCatalog: base });
    const doubled = enumerateOn({ ...campusDataset, slotCatalog: [...base, ...base] });

    const singleKeys = allCandidates(single).map((item) => item.candidateKey);
    const doubledKeys = allCandidates(doubled).map((item) => item.candidateKey);
    expect(doubledKeys).toHaveLength(singleKeys.length);
    expect(new Set(doubledKeys).size).toBe(doubledKeys.length);
  });

  it('非法时间条目进入候选后由 slot-valid 硬约束排除（score=null，不进可行集，也不回退）', () => {
    const invalid: CampusDataset = {
      ...campusDataset,
      slotCatalog: [
        { activityId: 'act-003', slot: { start: '2026-10-22T16:00', end: '2026-10-22T16:00' } },
        { activityId: 'act-003', slot: { start: '2026-10-22T9:0', end: '2026-10-22T11:00' } }
      ]
    };
    const set = enumerateOn(invalid);

    expect(set.feasible).toEqual([]);
    expect(set.excluded.length).toBeGreaterThan(0);
    expect(set.warnings.join('；')).not.toContain('可选时段枚举结果为空');
    for (const candidate of set.excluded) {
      expect(candidate.score).toBeNull();
      expect(candidate.evaluation.failureReasons.join('；')).toContain('时间段合法');
    }
    const joined = set.excluded.map((item) => item.evaluation.failureReasons.join('；')).join('；');
    expect(joined).toContain('start 早于 end');
    expect(joined).toContain('YYYY-MM-DDTHH:mm');
  });

  it('跨日目录条目由 slot-valid 硬约束排除并说明跨午夜，不进入可行候选', () => {
    const crossDay: CampusDataset = {
      ...campusDataset,
      slotCatalog: [
        {
          activityId: 'act-003',
          slot: { start: '2026-10-22T23:00', end: '2026-10-23T01:00' }
        }
      ]
    };
    const set = enumerateOn(crossDay);

    expect(set.feasible).toEqual([]);
    expect(set.excluded.length).toBeGreaterThan(0);
    expect(set.warnings.join('；')).not.toContain('可选时段枚举结果为空');
    for (const candidate of set.excluded) {
      expect(candidate.score).toBeNull();
      expect(candidate.evaluation.failureReasons.join('；')).toContain('跨午夜');
    }
  });

  it('组合独立性：同一场地各时段独立评估，venue-004 五可行一开放时段排除、venue-002 六可行', () => {
    const set = enumerateOn(campusDataset);
    const feasibleV4 = set.feasible
      .filter((item) => item.venueId === 'venue-004')
      .map((item) => item.slot.start);
    const excludedV4 = set.excluded
      .filter((item) => item.venueId === 'venue-004')
      .map((item) => item.slot.start);
    const feasibleV2 = set.feasible.filter((item) => item.venueId === 'venue-002');

    expect(feasibleV4).toEqual([
      '2026-10-22T14:00',
      '2026-10-22T15:00',
      '2026-10-22T16:00',
      '2026-10-22T17:00',
      '2026-10-22T18:00'
    ]);
    expect(excludedV4).toEqual(['2026-10-22T19:00']);
    expect(feasibleV2.map((item) => item.slot.start)).toEqual([
      '2026-10-22T14:00',
      '2026-10-22T15:00',
      '2026-10-22T16:00',
      '2026-10-22T17:00',
      '2026-10-22T18:00',
      '2026-10-22T19:00'
    ]);
    expect(set.excluded.filter((item) => item.venueId === 'venue-002')).toEqual([]);
  });

  it('目录条目指定 venueId 时只与该场地组合（act-001 → venue-004）', () => {
    const act001Change: ActivityChange = {
      id: 'chg-940',
      activityId: 'act-001',
      kind: 'venue',
      description: '演练：显式目录 venueId 限定组合。',
      requestedAt: '2026-10-16T10:05',
      requestedBy: 'role-venue-admin-01',
      payload: {
        before: 'venue-002',
        minCapacity: 220,
        requiredEquipmentIds: ['eq-001', 'eq-002', 'eq-003']
      }
    };
    const act001 = activityOf(campusDataset, 'act-001');
    const outcome = buildTargetState(campusDataset, act001Change, act001);
    if (outcome.target === null) {
      throw new Error('测试夹具未生成目标状态');
    }
    expect(outcome.target.candidateVenueIds).toContain('venue-004');
    const set = evaluateCandidates(campusDataset, outcome.target, act001, {
      enumerateSlots: true
    });
    const all = allCandidates(set);

    expect(set.warnings.join('；')).not.toContain('可选时段枚举结果为空');
    expect(all).toHaveLength(2);
    expect(all.every((item) => item.venueId === 'venue-004')).toBe(true);
    expect(all.map((item) => item.slot.start).sort()).toEqual([
      '2026-10-20T14:00',
      '2026-10-20T15:00'
    ]);
    // 条目为模拟时段，可行性仍由硬约束裁决（venue-004 容量 200 < 220，且缺 eq-003）
    expect(set.feasible).toEqual([]);
    for (const candidate of set.excluded) {
      expect(candidate.score).toBeNull();
    }
  });

  it('预置兼容：不传枚举选项时忽略目录，仅评估 target.slot 且无枚举 warning', () => {
    const act001 = activityOf(campusDataset, 'act-001');
    const outcome = buildTargetState(campusDataset, changeOf(campusDataset, 'chg-001'), act001);
    if (outcome.target === null) {
      throw new Error('测试夹具未生成目标状态');
    }
    // 目录中存在 act-001 条目，但默认路径（预置调度同款调用）不得读取
    expect(
      (campusDataset.slotCatalog ?? []).some((item) => item.activityId === 'act-001')
    ).toBe(true);

    const set = evaluateCandidates(campusDataset, outcome.target, act001);
    expect(set.feasible).toHaveLength(1);
    expect(set.feasible[0]?.slot).toEqual({
      start: '2026-10-20T08:30',
      end: '2026-10-20T12:00'
    });
    expect(set.feasible[0]?.candidateKey).toBe(
      'venue-002@2026-10-20T08:30~2026-10-20T12:00'
    );
    expect(set.warnings.join('；')).not.toContain('可选时段枚举');
  });
});

describe('F3-A 排序末级键（同场地多时段并列）', () => {
  it('同场地同时分时按时段 start 升序，与输入顺序无关', () => {
    const slotEarly = { start: '2026-11-01T09:00', end: '2026-11-01T11:00' };
    const slotLate = { start: '2026-11-01T14:00', end: '2026-11-01T16:00' };
    const tie: CandidateScore = {
      capacityFitScore: 70,
      distanceMeters: 100,
      distanceScore: 90,
      total: 78,
      weightMode: 'capacity-and-distance',
      explanation: []
    };
    const base = makeCandidate('venue-002', tie);
    const early: Candidate = {
      ...base,
      candidateKey: `venue-002@${slotEarly.start}~${slotEarly.end}`,
      slot: slotEarly,
      evaluation: { ...base.evaluation, slot: slotEarly }
    };
    const late: Candidate = {
      ...base,
      candidateKey: `venue-002@${slotLate.start}~${slotLate.end}`,
      slot: slotLate,
      evaluation: { ...base.evaluation, slot: slotLate }
    };

    const first = rankCandidates([late, early]).map((item) => item.slot.start);
    const second = rankCandidates([early, late]).map((item) => item.slot.start);
    expect(first).toEqual(['2026-11-01T09:00', '2026-11-01T14:00']);
    expect(second).toEqual(first);
  });
});

describe('2.0 审计修复回归', () => {
  it('仅容量模式同分时按 ID 稳定排序，不让已知距离压过缺失距离', () => {
    const noDistance: Venue = { id: 'venue-001', name: '无距离', capacity: 100, openFrom: '08:00', openTo: '22:00', equipmentIds: [] };
    const near: Venue = { ...noDistance, id: 'venue-002', name: '近场地', distanceToCenterMeters: 10 };
    const a = makeCandidate(noDistance.id, scoreCandidate(noDistance, 50, false));
    const b = makeCandidate(near.id, scoreCandidate(near, 50, false));
    expect(b.score?.distanceMeters).toBe(10);
    expect(b.score?.distanceScore).toBeNull();
    expect(rankCandidates([b, a]).map(item => item.venueId)).toEqual(['venue-001', 'venue-002']);
  });
  it('即使外部候选在容量口径保留旧距离分，比较器也跳过距离', () => {
    const score: CandidateScore = { total: 50, capacityFitScore: 50, distanceMeters: 500, distanceScore: 50, weightMode: 'capacity-only', explanation: [] };
    const a = makeCandidate('venue-001', { ...score, distanceScore: 10 });
    const b = makeCandidate('venue-002', { ...score, distanceScore: 99 });
    expect(rankCandidates([b, a]).map(item => item.venueId)).toEqual(['venue-001', 'venue-002']);
  });
  it('合法基准的目录缺失、无匹配和全时长不符各自说明原因', () => {
    const activity = activityOf(campusDataset, 'act-003');
    const change = changeOf(campusDataset, 'chg-002');
    const outcome = buildTargetState(campusDataset, change, activity);
    if (!outcome.target) throw new Error('夹具无效');
    const variants: readonly [CampusDataset, string][] = [
      [{ ...campusDataset, slotCatalog: undefined }, '目录缺失'],
      [{ ...campusDataset, slotCatalog: [] }, '目录为空'],
      [{ ...campusDataset, slotCatalog: [{ activityId: 'act-001', slot: activity.currentSlot }] }, '没有匹配'],
      [{ ...campusDataset, slotCatalog: [{ activityId: 'act-003', slot: { start: '2026-10-22T14:00', end: '2026-10-22T15:00' } }] }, '时长均']
    ];
    for (const [dataset, reason] of variants) {
      const set = evaluateCandidates(dataset, outcome.target, activity, { enumerateSlots: true });
      expect(set.warnings.join('；')).toContain(reason);
      expect(set.warnings.join('；')).not.toContain('基准时段非法或跨日');
    }
  });
});
