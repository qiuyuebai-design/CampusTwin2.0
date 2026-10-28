import { describe, expect, it } from 'vitest';
import type { CampusDataset } from '../types/campus';
import type { ActivityChange } from '../types/change';
import type { ChangeId } from '../types/ids';
import { campusDataset } from '../data/campus';
import { runScheduling, type ChangeSchedulingResult } from './runScheduling';

const timeFixture: CampusDataset = {
  equipment: [],
  venues: [
    {
      id: 'venue-001',
      name: '模拟·甲场地',
      capacity: 100,
      openFrom: '08:00',
      openTo: '20:00',
      equipmentIds: [],
      distanceToCenterMeters: 50
    }
  ],
  resources: [],
  activities: [
    {
      id: 'act-010',
      name: '模拟·活动甲',
      expectedAttendance: 40,
      currentVenueId: 'venue-001',
      currentSlot: { start: '2026-10-20T09:00', end: '2026-10-20T11:00' },
      requiredEquipmentIds: [],
      resourceNeeds: {}
    },
    {
      id: 'act-011',
      name: '模拟·活动乙',
      expectedAttendance: 30,
      currentVenueId: 'venue-001',
      currentSlot: { start: '2026-10-20T11:00', end: '2026-10-20T12:00' },
      requiredEquipmentIds: [],
      resourceNeeds: {}
    }
  ],
  changes: [
    {
      id: 'chg-010',
      activityId: 'act-010',
      kind: 'time',
      description: '演练：紧邻已有活动，不构成冲突。',
      requestedAt: '2026-10-16T09:00',
      requestedBy: 'role-organizer-01',
      payload: {
        before: { start: '2026-10-20T09:00', end: '2026-10-20T11:00' },
        after: { start: '2026-10-20T12:00', end: '2026-10-20T13:00' }
      }
    },
    {
      id: 'chg-011',
      activityId: 'act-010',
      kind: 'time',
      description: '演练：与已有活动重叠。',
      requestedAt: '2026-10-16T09:05',
      requestedBy: 'role-organizer-01',
      payload: {
        before: { start: '2026-10-20T09:00', end: '2026-10-20T11:00' },
        after: { start: '2026-10-20T11:30', end: '2026-10-20T12:30' }
      }
    },
    {
      id: 'chg-012',
      activityId: 'act-010',
      kind: 'time',
      description: '演练：跨午夜活动。',
      requestedAt: '2026-10-16T09:10',
      requestedBy: 'role-organizer-01',
      payload: {
        before: { start: '2026-10-20T09:00', end: '2026-10-20T11:00' },
        after: { start: '2026-10-20T23:00', end: '2026-10-21T01:00' }
      }
    },
    {
      id: 'chg-013',
      activityId: 'act-010',
      kind: 'time',
      description: '演练：早于场地开放时间。',
      requestedAt: '2026-10-16T09:15',
      requestedBy: 'role-organizer-01',
      payload: {
        before: { start: '2026-10-20T09:00', end: '2026-10-20T11:00' },
        after: { start: '2026-10-20T07:00', end: '2026-10-20T08:00' }
      }
    },
    {
      id: 'chg-014',
      activityId: 'act-010',
      kind: 'time',
      description: '演练：非法时间取值。',
      requestedAt: '2026-10-16T09:20',
      requestedBy: 'role-organizer-01',
      payload: {
        before: { start: '2026-10-20T09:00', end: '2026-10-20T11:00' },
        after: { start: '2026-10-20T24:00', end: '2026-10-20T25:00' }
      }
    }
  ]
};

const resourceFixture: CampusDataset = {
  equipment: [{ id: 'eq-004', name: '无线话筒' }],
  venues: [
    {
      id: 'venue-001',
      name: '模拟·排练厅',
      capacity: 80,
      openFrom: '09:00',
      openTo: '21:00',
      equipmentIds: ['eq-004'],
      distanceToCenterMeters: 100
    }
  ],
  resources: [{ id: 'res-001', name: '现场工作人员（人）', total: 10, available: 6 }],
  activities: [
    {
      id: 'act-001',
      name: '模拟·讲座',
      expectedAttendance: 60,
      currentVenueId: 'venue-001',
      currentSlot: { start: '2026-10-23T15:00', end: '2026-10-23T17:00' },
      requiredEquipmentIds: ['eq-004'],
      resourceNeeds: { 'res-001': 4 }
    }
  ],
  changes: [
    {
      id: 'chg-001',
      activityId: 'act-001',
      kind: 'resource',
      description: '演练：工作人员目标需求调整为 6 人。',
      requestedAt: '2026-10-16T14:15',
      requestedBy: 'role-organizer-01',
      payload: {
        equipmentAdjustments: [],
        resourceAdjustments: [{ id: 'res-001', before: 4, after: 6 }]
      }
    },
    {
      id: 'chg-002',
      activityId: 'act-001',
      kind: 'resource',
      description: '演练：工作人员目标需求调整为 8 人，超出可用量。',
      requestedAt: '2026-10-16T14:20',
      requestedBy: 'role-organizer-01',
      payload: {
        equipmentAdjustments: [],
        resourceAdjustments: [{ id: 'res-001', before: 4, after: 8 }]
      }
    }
  ]
};

function resultOf(
  results: readonly ChangeSchedulingResult[],
  changeId: ChangeId
): ChangeSchedulingResult {
  const found = results.find((item) => item.changeId === changeId);
  if (found === undefined) {
    throw new Error(`结果缺少变更 ${changeId}`);
  }
  return found;
}

describe('真实模拟数据上的调度结果', () => {
  it('四条变更的状态总览符合数据语义', () => {
    const result = runScheduling(campusDataset);
    expect(
      result.results.map((item) => [item.changeId, item.status])
    ).toEqual([
      ['chg-001', 'scheduled'],
      ['chg-002', 'scheduled'],
      ['chg-003', 'infeasible'],
      ['chg-004', 'infeasible']
    ]);
    expect(result.limitations.join('；')).toContain('不检查数量');
    expect(result.limitations.join('；')).toContain('不代表真实校园路线');
  });

  it('chg-001 提前到 08:30 可行，给出推荐候选与评分解释', () => {
    const result = runScheduling(campusDataset, { changeIds: ['chg-001'] });
    const item = resultOf(result.results, 'chg-001');

    expect(item.status).toBe('scheduled');
    expect(item.feasibleCandidates).toHaveLength(1);

    const best = item.feasibleCandidates[0];
    expect(best?.venueId).toBe('venue-002');
    expect(best?.slot).toEqual({ start: '2026-10-20T08:30', end: '2026-10-20T12:00' });
    expect(best?.score?.capacityFitScore).toBe(73.33);
    expect(best?.score?.distanceScore).toBe(74);
    expect(best?.score?.total).toBe(73.6);
    expect(best?.score?.explanation.join('；')).toContain('容量适配度 73.33');
    expect(item.summary).toContain('推荐 venue-002');
  });

  it('chg-002 指定目标场地时只评估 venue-004', () => {
    const result = runScheduling(campusDataset, { changeIds: ['chg-002'] });
    const item = resultOf(result.results, 'chg-002');

    expect(item.status).toBe('scheduled');
    expect(item.feasibleCandidates.map((c) => c.venueId)).toEqual(['venue-004']);
    expect(item.excludedCandidates).toEqual([]);
    expect(item.target?.requiredCapacity).toBe(90);
  });

  it('chg-003 无可行候选时返回清晰原因（容量不足）', () => {
    const result = runScheduling(campusDataset, { changeIds: ['chg-003'] });
    const item = resultOf(result.results, 'chg-003');

    expect(item.status).toBe('infeasible');
    expect(item.feasibleCandidates).toEqual([]);
    expect(item.excludedCandidates.map((c) => c.venueId)).toEqual(['venue-005']);
    expect(item.excludedCandidates[0]?.evaluation.failureReasons.join('；')).toContain(
      '场地容量：容量 500 人 < 需求 560 人'
    );
    expect(item.summary).toContain('容量 500 人 < 需求 560 人');
  });

  it('chg-004 点名缺少无线话筒，报告设备数量限制，且活动未被修改', () => {
    const before = JSON.stringify(campusDataset);
    const result = runScheduling(campusDataset, { changeIds: ['chg-004'] });
    const item = resultOf(result.results, 'chg-004');

    expect(item.status).toBe('infeasible');
    expect(item.excludedCandidates.map((c) => c.venueId)).toEqual(['venue-003']);
    expect(item.excludedCandidates[0]?.evaluation.failureReasons.join('；')).toContain(
      'eq-004 无线话筒'
    );
    expect(item.warnings.join('；')).toContain('设备数量无法验证');
    expect(item.warnings.join('；')).toContain('不检查数量');

    const activity = campusDataset.activities.find((entry) => entry.id === 'act-004');
    expect(activity?.requiredEquipmentIds).toEqual(['eq-003', 'eq-005']);
    expect(JSON.stringify(campusDataset)).toBe(before);
  });
});

describe('时间约束与冲突', () => {
  it('半开区间边界：结束等于另一活动开始不算冲突', () => {
    const result = runScheduling(timeFixture, { changeIds: ['chg-010'] });
    const item = resultOf(result.results, 'chg-010');

    expect(item.status).toBe('scheduled');
    expect(item.feasibleCandidates[0]?.slot).toEqual({
      start: '2026-10-20T12:00',
      end: '2026-10-20T13:00'
    });
    expect(item.excludedCandidates).toEqual([]);
  });

  it('同场地时间冲突被排除并点名冲突活动', () => {
    const result = runScheduling(timeFixture, { changeIds: ['chg-011'] });
    const item = resultOf(result.results, 'chg-011');

    expect(item.status).toBe('infeasible');
    expect(item.excludedCandidates[0]?.evaluation.failureReasons.join('；')).toContain(
      '同场地时间冲突：与同场地活动 act-011 的时间段重叠'
    );
  });

  it('目标时间段超出场地开放时段被拒', () => {
    const result = runScheduling(timeFixture, { changeIds: ['chg-013'] });
    const item = resultOf(result.results, 'chg-013');

    expect(item.status).toBe('infeasible');
    expect(item.excludedCandidates[0]?.evaluation.failureReasons.join('；')).toContain(
      '场地开放时段：07:00-08:00 不在开放时段 08:00-20:00'
    );
  });

  it('跨午夜活动明确判为不可行并说明原因', () => {
    const result = runScheduling(timeFixture, { changeIds: ['chg-012'] });
    const item = resultOf(result.results, 'chg-012');

    expect(item.status).toBe('infeasible');
    expect(item.excludedCandidates[0]?.evaluation.failureReasons.join('；')).toContain('跨午夜');
    expect(item.excludedCandidates[0]?.evaluation.failureReasons.join('；')).toContain(
      '仅支持单日活动'
    );
  });

  it('非法时间取值被拒并说明格式要求', () => {
    const result = runScheduling(timeFixture, { changeIds: ['chg-014'] });
    const item = resultOf(result.results, 'chg-014');

    expect(item.status).toBe('infeasible');
    expect(item.excludedCandidates[0]?.evaluation.failureReasons.join('；')).toContain(
      '时间段合法：时间段必须是合法的 YYYY-MM-DDTHH:mm'
    );
  });
});

describe('异常输入', () => {
  it('请求数据集中不存在的变更 ID 时返回 unknown-change（不使用类型断言）', () => {
    const [first, ...rest] = campusDataset.changes;
    if (first === undefined) {
      throw new Error('测试夹具缺少变更');
    }
    // 用数据集中真实的 ChangeId 请求一个"已被移除"的变更，同样进入未知变更分支。
    const dataset: CampusDataset = { ...campusDataset, changes: rest };
    const result = runScheduling(dataset, { changeIds: [first.id] });
    const item = resultOf(result.results, first.id);

    expect(item.status).toBe('unknown-change');
    expect(item.summary).toContain(first.id);
    expect(item.summary).toContain('未在数据集中定义');
    expect(item.feasibleCandidates).toEqual([]);
    expect(item.excludedCandidates).toEqual([]);
  });

  it('未知活动 ID 返回 unknown-activity', () => {
    const orphan: ActivityChange = {
      id: 'chg-902',
      activityId: 'act-999',
      kind: 'scale',
      description: '演练：关联活动不存在。',
      requestedAt: '2026-10-16T12:00',
      requestedBy: 'role-organizer-01',
      payload: { after: 100 }
    };
    const dataset: CampusDataset = {
      ...campusDataset,
      changes: [...campusDataset.changes, orphan]
    };

    const result = runScheduling(dataset, { changeIds: ['chg-902'] });
    const item = resultOf(result.results, 'chg-902');

    expect(item.status).toBe('unknown-activity');
    expect(item.summary).toContain('act-999');
  });

  it('载荷语义非法（负数人数）返回 invalid-change', () => {
    const badChange: ActivityChange = {
      id: 'chg-903',
      activityId: 'act-001',
      kind: 'scale',
      description: '演练：负数人数。',
      requestedAt: '2026-10-16T12:00',
      requestedBy: 'role-organizer-01',
      payload: { after: -10 }
    };
    const dataset: CampusDataset = {
      ...campusDataset,
      changes: [...campusDataset.changes, badChange]
    };

    const result = runScheduling(dataset, { changeIds: ['chg-903'] });
    const item = resultOf(result.results, 'chg-903');

    expect(item.status).toBe('invalid-change');
    expect(item.summary).toContain('非负整数');
  });

  it('before 与活动当前状态不一致的变更返回 invalid-change 并说明原因', () => {
    const mismatched: ActivityChange = {
      id: 'chg-906',
      activityId: 'act-001',
      kind: 'time',
      description: '演练：before 与活动当前时间段不一致。',
      requestedAt: '2026-10-16T12:05',
      requestedBy: 'role-organizer-01',
      payload: {
        before: { start: '2026-10-23T10:00', end: '2026-10-23T12:00' },
        after: { start: '2026-10-23T16:00', end: '2026-10-23T18:00' }
      }
    };
    const dataset: CampusDataset = {
      ...campusDataset,
      changes: [...campusDataset.changes, mismatched]
    };

    const result = runScheduling(dataset, { changeIds: [mismatched.id] });
    const item = resultOf(result.results, mismatched.id);

    expect(item.status).toBe('invalid-change');
    expect(item.target).toBeNull();
    expect(item.summary).toContain('不一致');
    expect(item.summary).toContain('currentSlot');
  });

  it('资源库存非法时变更不可行并明确报告库存非法', () => {
    const dataset: CampusDataset = {
      ...resourceFixture,
      resources: [{ id: 'res-001', name: '现场工作人员（人）', total: 10, available: Number.NaN }]
    };

    const result = runScheduling(dataset, { changeIds: ['chg-001'] });
    const item = resultOf(result.results, 'chg-001');

    expect(item.status).toBe('infeasible');
    expect(item.excludedCandidates[0]?.evaluation.failureReasons.join('；')).toContain('库存值非法');
  });
});

describe('资源目标数量语义（规则：目标值而非增量）', () => {
  it('after 目标数量与可用量比较，而不是与当前需求相加', () => {
    const result = runScheduling(resourceFixture, { changeIds: ['chg-001'] });
    const item = resultOf(result.results, 'chg-001');

    expect(item.status).toBe('scheduled');
    expect(item.target?.resourceNeeds).toEqual({ 'res-001': 6 });
    expect(item.feasibleCandidates[0]?.evaluation.checks.find(
      (check) => check.code === 'resources-sufficient'
    )?.detail).toContain('目标需求 6 / 可用 6');
  });

  it('目标需求超过可用量时明确失败', () => {
    const result = runScheduling(resourceFixture, { changeIds: ['chg-002'] });
    const item = resultOf(result.results, 'chg-002');

    expect(item.status).toBe('infeasible');
    expect(item.excludedCandidates[0]?.evaluation.failureReasons.join('；')).toContain(
      '资源数量：资源 res-001 现场工作人员（人） 不足：目标需求 8 > 可用 6'
    );
  });
});

describe('不可变性与确定性', () => {
  it('运行调度不修改原始数据集', () => {
    const before = JSON.stringify(campusDataset);
    runScheduling(campusDataset);
    runScheduling(timeFixture);
    expect(JSON.stringify(campusDataset)).toBe(before);
  });

  it('两次运行结果完全一致', () => {
    const first = runScheduling(campusDataset);
    const second = runScheduling(campusDataset);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe('F3-A 预置变更单时段兼容', () => {
  it('chg-001~004 每个候选 slot 与 target.slot 一致、candidateKey 格式正确、无枚举警告', () => {
    const result = runScheduling(campusDataset);
    expect(result.results).toHaveLength(4);
    for (const item of result.results) {
      expect(item.target).not.toBeNull();
      for (const candidate of [...item.feasibleCandidates, ...item.excludedCandidates]) {
        expect(candidate.slot).toEqual(item.target?.slot);
        expect(candidate.candidateKey).toBe(
          `${candidate.venueId}@${candidate.slot.start}~${candidate.slot.end}`
        );
      }
      expect(item.warnings.join('；')).not.toContain('可选时段枚举');
    }
  });

  it('chg-001 / chg-002 关键结果与 M1-E 记录一致（单时段、可行候选数不变）', () => {
    const result = runScheduling(campusDataset, { changeIds: ['chg-001', 'chg-002'] });

    const item1 = resultOf(result.results, 'chg-001');
    expect(item1.status).toBe('scheduled');
    expect(item1.feasibleCandidates).toHaveLength(1);
    expect(item1.feasibleCandidates[0]?.slot).toEqual({
      start: '2026-10-20T08:30',
      end: '2026-10-20T12:00'
    });
    expect(item1.feasibleCandidates[0]?.score?.total).toBe(73.6);

    const item2 = resultOf(result.results, 'chg-002');
    expect(item2.status).toBe('scheduled');
    expect(item2.feasibleCandidates.map((entry) => entry.venueId)).toEqual(['venue-004']);
    expect(item2.feasibleCandidates[0]?.slot.start).toBe('2026-10-22T14:00');
  });
});
