import { describe, expect, it } from 'vitest';
import type { Activity } from '../types/activity';
import type { CampusDataset } from '../types/campus';
import type { ActivityChange } from '../types/change';
import type { ActivityId } from '../types/ids';
import type { TimeSlot } from '../types/time';
import { campusDataset } from '../data/campus';
import {
  checkResourceRequirements,
  evaluateCandidate,
  findSlotConflicts,
  isWithinOpeningHours,
  isValidClockTime,
  isValidLocalDateTime,
  slotsOverlap,
  validateChangePayload,
  validatePayloadShape,
  validateTimeSlot,
  type CandidateEvaluation,
  type CandidateSpec,
  type ConstraintCode
} from './constraints';

const fixture: CampusDataset = {
  equipment: [
    { id: 'eq-001', name: '投影仪' },
    { id: 'eq-004', name: '无线话筒' }
  ],
  venues: [
    {
      id: 'venue-001',
      name: '模拟·甲场地',
      capacity: 100,
      openFrom: '08:00',
      openTo: '20:00',
      equipmentIds: ['eq-001'],
      distanceToCenterMeters: 100
    },
    {
      id: 'venue-002',
      name: '模拟·乙场地',
      capacity: 200,
      openFrom: '09:00',
      openTo: '18:00',
      equipmentIds: ['eq-001', 'eq-004'],
      distanceToCenterMeters: 500
    }
  ],
  resources: [{ id: 'res-001', name: '现场工作人员（人）', total: 20, available: 5 }],
  activities: [
    {
      id: 'act-001',
      name: '模拟·活动甲',
      expectedAttendance: 50,
      currentVenueId: 'venue-001',
      currentSlot: { start: '2026-10-20T09:00', end: '2026-10-20T11:00' },
      requiredEquipmentIds: ['eq-001'],
      resourceNeeds: { 'res-001': 2 }
    },
    {
      id: 'act-002',
      name: '模拟·活动乙',
      expectedAttendance: 40,
      currentVenueId: 'venue-001',
      currentSlot: { start: '2026-10-20T11:00', end: '2026-10-20T12:00' },
      requiredEquipmentIds: [],
      resourceNeeds: {}
    },
    {
      id: 'act-003',
      name: '模拟·活动丙',
      expectedAttendance: 30,
      currentVenueId: 'venue-002',
      currentSlot: { start: '2026-10-20T09:00', end: '2026-10-20T10:00' },
      requiredEquipmentIds: [],
      resourceNeeds: {}
    }
  ],
  changes: []
};

function activityOf(dataset: CampusDataset, id: ActivityId): Activity {
  const activity = dataset.activities.find((item) => item.id === id);
  if (activity === undefined) {
    throw new Error(`测试夹具缺少活动 ${id}`);
  }
  return activity;
}

function checkOf(evaluation: CandidateEvaluation, code: ConstraintCode) {
  return evaluation.checks.find((check) => check.code === code);
}

describe('时间值严格校验', () => {
  it('接受合法的 YYYY-MM-DDTHH:mm（含闰年 2 月 29 日）', () => {
    expect(isValidLocalDateTime('2026-10-16T09:00')).toBe(true);
    expect(isValidLocalDateTime('2026-02-28T00:00')).toBe(true);
    expect(isValidLocalDateTime('2024-02-29T23:59')).toBe(true);
  });

  it('拒绝仅形状正确但取值越界的日期时间', () => {
    expect(isValidLocalDateTime('2026-99-99T88:88')).toBe(false);
    expect(isValidLocalDateTime('2026-13-01T00:00')).toBe(false);
    expect(isValidLocalDateTime('2026-00-10T00:00')).toBe(false);
    expect(isValidLocalDateTime('2026-04-31T00:00')).toBe(false);
    expect(isValidLocalDateTime('2026-02-29T09:00')).toBe(false);
    expect(isValidLocalDateTime('2026-10-16T24:00')).toBe(false);
    expect(isValidLocalDateTime('2026-10-16T09:60')).toBe(false);
  });

  it('拒绝非字符串或非补零格式的日期时间', () => {
    expect(isValidLocalDateTime('2026-10-16 09:00')).toBe(false);
    expect(isValidLocalDateTime('2026-10-16T9:0')).toBe(false);
    expect(isValidLocalDateTime(undefined)).toBe(false);
    expect(isValidLocalDateTime(20261016)).toBe(false);
  });

  it('时钟值 HH:mm 严格校验', () => {
    expect(isValidClockTime('00:00')).toBe(true);
    expect(isValidClockTime('23:59')).toBe(true);
    expect(isValidClockTime('24:00')).toBe(false);
    expect(isValidClockTime('29:99')).toBe(false);
    expect(isValidClockTime('9:00')).toBe(false);
    expect(isValidClockTime('0900')).toBe(false);
    expect(isValidClockTime(undefined)).toBe(false);
  });
});

describe('时间段合法性与跨午夜处理', () => {
  it('接受单日且 start 早于 end 的时间段', () => {
    expect(
      validateTimeSlot({ start: '2026-10-20T09:00', end: '2026-10-20T12:00' })
    ).toEqual({ ok: true, reason: '' });
  });

  it('拒绝 start 等于或晚于 end 的时间段', () => {
    const same = validateTimeSlot({ start: '2026-10-20T09:00', end: '2026-10-20T09:00' });
    expect(same.ok).toBe(false);
    expect(same.reason).toContain('start 早于 end');

    const reversed = validateTimeSlot({ start: '2026-10-20T12:00', end: '2026-10-20T09:00' });
    expect(reversed.ok).toBe(false);
    expect(reversed.reason).toContain('start 早于 end');
  });

  it('跨午夜/跨日活动明确判为不支持并说明原因', () => {
    const crossDay = validateTimeSlot({ start: '2026-10-20T23:00', end: '2026-10-21T01:00' });
    expect(crossDay.ok).toBe(false);
    expect(crossDay.reason).toContain('跨午夜');
    expect(crossDay.reason).toContain('仅支持单日活动');
  });

  it('拒绝非法日期时间与非法形状', () => {
    const badValues = validateTimeSlot({ start: '2026-10-20T24:00', end: '2026-10-20T25:00' });
    expect(badValues.ok).toBe(false);
    expect(badValues.reason).toContain('YYYY-MM-DDTHH:mm');

    expect(validateTimeSlot(null).ok).toBe(false);
    expect(validateTimeSlot('2026-10-20T09:00').ok).toBe(false);
    expect(validateTimeSlot({ start: '2026-10-20T09:00' }).ok).toBe(false);
  });
});

describe('半开区间 [start, end) 与开放时段边界', () => {
  const slotA: TimeSlot = { start: '2026-10-20T09:00', end: '2026-10-20T11:00' };

  it('结束时刻等于另一活动开始时刻不算冲突', () => {
    expect(slotsOverlap(slotA, { start: '2026-10-20T11:00', end: '2026-10-20T12:00' })).toBe(false);
    expect(slotsOverlap({ start: '2026-10-20T11:00', end: '2026-10-20T12:00' }, slotA)).toBe(false);
    expect(slotsOverlap(slotA, { start: '2026-10-20T07:00', end: '2026-10-20T09:00' })).toBe(false);
  });

  it('重叠、包含与完全相同都算冲突', () => {
    expect(slotsOverlap(slotA, { start: '2026-10-20T10:30', end: '2026-10-20T11:30' })).toBe(true);
    expect(slotsOverlap(slotA, { start: '2026-10-20T09:30', end: '2026-10-20T10:00' })).toBe(true);
    expect(slotsOverlap(slotA, slotA)).toBe(true);
    expect(slotsOverlap(slotA, { start: '2026-10-20T08:00', end: '2026-10-20T12:00' })).toBe(true);
  });

  it('开放时段边界按闭区间接受，越界拒绝', () => {
    const venue = { openFrom: '08:00', openTo: '20:00' };
    expect(
      isWithinOpeningHours({ start: '2026-10-20T08:00', end: '2026-10-20T20:00' }, venue)
    ).toBe(true);
    expect(
      isWithinOpeningHours({ start: '2026-10-20T07:59', end: '2026-10-20T12:00' }, venue)
    ).toBe(false);
    expect(
      isWithinOpeningHours({ start: '2026-10-20T08:00', end: '2026-10-20T20:01' }, venue)
    ).toBe(false);
  });
});

describe('同场地冲突判断（排除活动自身占用）', () => {
  it('与同场地其他活动重叠时报告冲突并点名活动 ID', () => {
    const report = findSlotConflicts(fixture, 'act-001', 'venue-001', {
      start: '2026-10-20T10:30',
      end: '2026-10-20T11:30'
    });
    expect(report.hasConflict).toBe(true);
    expect(report.conflictingActivityIds).toEqual(['act-002']);
    expect(report.detail).toContain('act-002');
    expect(report.detail).toContain('半开区间');
  });

  it('半开区间边界：紧邻不重叠', () => {
    const report = findSlotConflicts(fixture, 'act-003', 'venue-001', {
      start: '2026-10-20T07:00',
      end: '2026-10-20T09:00'
    });
    expect(report.hasConflict).toBe(false);
    expect(report.conflictingActivityIds).toEqual([]);
  });

  it('不同场地不产生冲突', () => {
    const report = findSlotConflicts(fixture, 'act-001', 'venue-001', {
      start: '2026-10-20T12:00',
      end: '2026-10-20T13:00'
    });
    expect(report.hasConflict).toBe(false);
  });

  it('被调整活动自身的原占用被排除，不会自我冲突', () => {
    const report = findSlotConflicts(fixture, 'act-001', 'venue-001', {
      start: '2026-10-20T09:00',
      end: '2026-10-20T11:00'
    });
    expect(report.hasConflict).toBe(false);
    expect(report.detail).toContain('已排除活动 act-001 自身的原占用');
  });
});

describe('载荷与 kind 匹配校验', () => {
  it('四种 kind 的合法载荷均通过', () => {
    expect(
      validatePayloadShape('time', {
        before: { start: '2026-10-20T09:00', end: '2026-10-20T12:00' },
        after: { start: '2026-10-20T08:30', end: '2026-10-20T12:00' }
      }).ok
    ).toBe(true);
    expect(
      validatePayloadShape('venue', {
        before: 'venue-001',
        targetVenueId: 'venue-004',
        minCapacity: 90,
        requiredEquipmentIds: ['eq-001', 'eq-002']
      }).ok
    ).toBe(true);
    expect(validatePayloadShape('scale', { before: 260, after: 560 }).ok).toBe(true);
    expect(
      validatePayloadShape('resource', {
        equipmentAdjustments: [{ id: 'eq-004', after: 1 }],
        resourceAdjustments: [{ id: 'res-001', before: 4, after: 6 }]
      }).ok
    ).toBe(true);
  });

  it('scale 误传 time 载荷时明确拒绝', () => {
    const result = validatePayloadShape('scale', {
      before: { start: '2026-10-20T09:00', end: '2026-10-20T12:00' },
      after: { start: '2026-10-20T08:30', end: '2026-10-20T12:00' }
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("kind='scale'");
    expect(result.reason).toContain('非负整数');
  });

  it('time 误传 scale 载荷时明确拒绝', () => {
    const result = validatePayloadShape('time', { before: 1, after: 2 });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("kind='time'");
  });

  it('拒绝越界数值与错误形状', () => {
    expect(validatePayloadShape('scale', { after: -1 }).ok).toBe(false);
    expect(validatePayloadShape('scale', { after: 2.5 }).ok).toBe(false);
    expect(validatePayloadShape('venue', { minCapacity: 0, requiredEquipmentIds: [] }).ok).toBe(
      false
    );
    expect(validatePayloadShape('venue', { minCapacity: 10, requiredEquipmentIds: 'eq-001' }).ok).toBe(
      false
    );
    expect(validatePayloadShape('resource', { after: 1 }).ok).toBe(false);
    expect(
      validatePayloadShape('resource', {
        equipmentAdjustments: [],
        resourceAdjustments: [{ id: 'res-001', after: -2 }]
      }).ok
    ).toBe(false);
    expect(validatePayloadShape('resource', null).ok).toBe(false);
  });

  it('调整数组中出现 undefined / null / 原始值 / 缺字段项时明确拒绝且不抛异常', () => {
    const undefinedItem = validatePayloadShape('resource', {
      equipmentAdjustments: [undefined],
      resourceAdjustments: []
    });
    expect(undefinedItem.ok).toBe(false);
    expect(undefinedItem.reason).toContain('equipmentAdjustments[0]');
    expect(undefinedItem.reason).toContain('收到 undefined');

    const nullItem = validatePayloadShape('resource', {
      equipmentAdjustments: [],
      resourceAdjustments: [null]
    });
    expect(nullItem.ok).toBe(false);
    expect(nullItem.reason).toContain('resourceAdjustments[0]');
    expect(nullItem.reason).toContain('收到 null');

    const laterItem = validatePayloadShape('resource', {
      equipmentAdjustments: [{ id: 'eq-004', after: 1 }, 42],
      resourceAdjustments: []
    });
    expect(laterItem.ok).toBe(false);
    expect(laterItem.reason).toContain('equipmentAdjustments[1]');

    const missingAfter = validatePayloadShape('resource', {
      equipmentAdjustments: [{ id: 'eq-004' }],
      resourceAdjustments: []
    });
    expect(missingAfter.ok).toBe(false);

    const missingBeforeType = validatePayloadShape('resource', {
      equipmentAdjustments: [],
      resourceAdjustments: [{ id: 'res-001', before: 'many', after: 2 }]
    });
    expect(missingBeforeType.ok).toBe(false);

    expect(
      validatePayloadShape('resource', {
        equipmentAdjustments: [{ id: 'eq-004', after: 1 }],
        resourceAdjustments: [{ id: 'res-001', after: 2 }]
      }).ok
    ).toBe(true);
  });

  it('真实数据集的四条变更载荷均与 kind 匹配', () => {
    const broken = campusDataset.changes.filter((change) => !validateChangePayload(change).ok);
    expect(broken.map((change) => change.id)).toEqual([]);
  });
});

describe('before 与活动当前状态一致性', () => {
  it('time 的 before 与活动当前时间段不一致时明确拒绝并给出两边取值', () => {
    const change: ActivityChange = {
      id: 'chg-801',
      activityId: 'act-001',
      kind: 'time',
      description: '演练：before 与活动当前时间段不一致。',
      requestedAt: '2026-10-16T09:00',
      requestedBy: 'role-organizer-01',
      payload: {
        before: { start: '2026-10-20T10:00', end: '2026-10-20T12:00' },
        after: { start: '2026-10-20T13:00', end: '2026-10-20T15:00' }
      }
    };

    const result = validateChangePayload(change, activityOf(fixture, 'act-001'));
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('不一致');
    expect(result.reason).toContain('before=[2026-10-20T10:00, 2026-10-20T12:00)');
    expect(result.reason).toContain('currentSlot=[2026-10-20T09:00, 2026-10-20T11:00)');
    expect(result.unverified).toEqual([]);
  });

  it('venue 的 before 与活动当前场地不一致时明确拒绝', () => {
    const change: ActivityChange = {
      id: 'chg-802',
      activityId: 'act-001',
      kind: 'venue',
      description: '演练：before 与活动当前场地不一致。',
      requestedAt: '2026-10-16T09:05',
      requestedBy: 'role-venue-admin-01',
      payload: {
        before: 'venue-002',
        targetVenueId: 'venue-002',
        minCapacity: 60,
        requiredEquipmentIds: ['eq-001']
      }
    };

    const result = validateChangePayload(change, activityOf(fixture, 'act-001'));
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('不一致');
    expect(result.reason).toContain('before=venue-002');
    expect(result.reason).toContain('currentVenueId=venue-001');
  });

  it('scale 的 before 与活动当前参与人数不一致时明确拒绝', () => {
    const change: ActivityChange = {
      id: 'chg-803',
      activityId: 'act-001',
      kind: 'scale',
      description: '演练：before 与活动当前人数不一致。',
      requestedAt: '2026-10-16T09:10',
      requestedBy: 'role-organizer-01',
      payload: { before: 60, after: 80 }
    };

    const result = validateChangePayload(change, activityOf(fixture, 'act-001'));
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('不一致');
    expect(result.reason).toContain('before=60');
    expect(result.reason).toContain('expectedAttendance=50');
  });

  it('resource 的 before 与活动当前资源需求不一致时明确拒绝', () => {
    const change: ActivityChange = {
      id: 'chg-804',
      activityId: 'act-001',
      kind: 'resource',
      description: '演练：before 与活动当前资源需求不一致。',
      requestedAt: '2026-10-16T09:15',
      requestedBy: 'role-student-union-01',
      payload: {
        equipmentAdjustments: [],
        resourceAdjustments: [{ id: 'res-001', before: 9, after: 4 }]
      }
    };

    const result = validateChangePayload(change, activityOf(fixture, 'act-001'));
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('不一致');
    expect(result.reason).toContain('res-001');
    expect(result.reason).toContain('before=9');
    expect(result.reason).toContain('当前需求=2');
  });

  it('四类 kind 的 before 与当前状态一致时全部通过', () => {
    const activity = activityOf(fixture, 'act-001');

    const timeChange: ActivityChange = {
      id: 'chg-811',
      activityId: 'act-001',
      kind: 'time',
      description: '演练：before 一致的时间变更。',
      requestedAt: '2026-10-16T09:20',
      requestedBy: 'role-organizer-01',
      payload: {
        before: { start: '2026-10-20T09:00', end: '2026-10-20T11:00' },
        after: { start: '2026-10-20T13:00', end: '2026-10-20T15:00' }
      }
    };
    const venueChange: ActivityChange = {
      id: 'chg-812',
      activityId: 'act-001',
      kind: 'venue',
      description: '演练：before 一致的场地变更。',
      requestedAt: '2026-10-16T09:25',
      requestedBy: 'role-venue-admin-01',
      payload: { before: 'venue-001', minCapacity: 50, requiredEquipmentIds: ['eq-001'] }
    };
    const scaleChange: ActivityChange = {
      id: 'chg-813',
      activityId: 'act-001',
      kind: 'scale',
      description: '演练：before 一致的规模变更。',
      requestedAt: '2026-10-16T09:30',
      requestedBy: 'role-organizer-01',
      payload: { before: 50, after: 70 }
    };
    const resourceChange: ActivityChange = {
      id: 'chg-814',
      activityId: 'act-001',
      kind: 'resource',
      description: '演练：before 一致的资源变更。',
      requestedAt: '2026-10-16T09:35',
      requestedBy: 'role-student-union-01',
      payload: {
        equipmentAdjustments: [],
        resourceAdjustments: [{ id: 'res-001', before: 2, after: 3 }]
      }
    };

    expect(validateChangePayload(timeChange, activity).ok).toBe(true);
    expect(validateChangePayload(venueChange, activity).ok).toBe(true);
    expect(validateChangePayload(scaleChange, activity).ok).toBe(true);
    expect(validateChangePayload(resourceChange, activity).ok).toBe(true);
    expect(validateChangePayload(timeChange, activity).unverified).toEqual([]);
  });

  it('设备 before 无法验证时不作确认，只报告 unverified', () => {
    const change: ActivityChange = {
      id: 'chg-821',
      activityId: 'act-001',
      kind: 'resource',
      description: '演练：设备数量 before 无法验证。',
      requestedAt: '2026-10-16T09:40',
      requestedBy: 'role-student-union-01',
      payload: {
        equipmentAdjustments: [{ id: 'eq-001', before: 2, after: 3 }],
        resourceAdjustments: []
      }
    };

    const result = validateChangePayload(change, activityOf(fixture, 'act-001'));
    expect(result.ok).toBe(true);
    expect(result.reason).toBe('');
    expect(result.unverified.length).toBeGreaterThan(0);
    expect(result.unverified.join('；')).toContain('设备 eq-001 的 before=2 无法验证');
    expect(result.unverified.join('；')).toContain('不作虚假确认');
  });

  it('资源 before 对应资源不在活动当前需求中时视为无法验证', () => {
    const change: ActivityChange = {
      id: 'chg-831',
      activityId: 'act-001',
      kind: 'resource',
      description: '演练：before 指向活动当前需求之外的资源。',
      requestedAt: '2026-10-16T09:45',
      requestedBy: 'role-student-union-01',
      payload: {
        equipmentAdjustments: [],
        resourceAdjustments: [{ id: 'res-002', before: 3, after: 5 }]
      }
    };

    const result = validateChangePayload(change, activityOf(fixture, 'act-001'));
    expect(result.ok).toBe(true);
    expect(result.unverified.join('；')).toContain('资源 res-002 的 before=3 无法验证');
    expect(result.unverified.join('；')).toContain('活动当前资源需求中没有该资源');
  });

  it('真实数据集四条变更的 before 均与活动当前状态一致（不一致会被拒绝）', () => {
    const mismatches: string[] = [];
    for (const change of campusDataset.changes) {
      const activity = campusDataset.activities.find((item) => item.id === change.activityId);
      if (activity === undefined) {
        mismatches.push(`${change.id}：活动 ${change.activityId} 未定义`);
        continue;
      }
      const result = validateChangePayload(change, activity);
      if (!result.ok) {
        mismatches.push(`${change.id}：${result.reason}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe('资源库存合法性', () => {
  it('available 为 NaN / Infinity / 负数 / 小数时资源检查明确失败', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1, 2.5]) {
      const result = checkResourceRequirements({ 'res-001': 1 }, [
        { id: 'res-001', name: '模拟·资源', total: 10, available: bad }
      ]);
      expect(result.ok).toBe(false);
      expect(result.problems.join('；')).toContain('库存值非法');
      expect(result.problems.join('；')).toContain('必须是非负整数');
    }
  });

  it('available 为合法非负整数时按目标需求比较', () => {
    const exact = checkResourceRequirements({ 'res-001': 0 }, [
      { id: 'res-001', name: '模拟·资源', total: 0, available: 0 }
    ]);
    expect(exact.ok).toBe(true);

    const over = checkResourceRequirements({ 'res-001': 1 }, [
      { id: 'res-001', name: '模拟·资源', total: 0, available: 0 }
    ]);
    expect(over.ok).toBe(false);
    expect(over.problems.join('；')).toContain('目标需求 1 > 可用 0');
  });
});

describe('候选硬约束评估', () => {
  const baseSpec: CandidateSpec = {
    venueId: 'venue-001',
    slot: { start: '2026-10-20T13:00', end: '2026-10-20T15:00' },
    attendance: 50,
    requiredCapacity: 50,
    requiredEquipmentIds: ['eq-001'],
    resourceNeeds: { 'res-001': 2 }
  };

  it('全部约束通过时评估通过', () => {
    const evaluation = evaluateCandidate(fixture, baseSpec, 'act-001');
    expect(evaluation.passed).toBe(true);
    expect(evaluation.failureReasons).toEqual([]);
    expect(evaluation.checks.every((check) => check.status === 'passed')).toBe(true);
  });

  it('容量不足时明确失败并给出数值', () => {
    const evaluation = evaluateCandidate(
      fixture,
      { ...baseSpec, attendance: 300, requiredCapacity: 300 },
      'act-001'
    );
    const check = checkOf(evaluation, 'capacity-sufficient');
    expect(check?.status).toBe('failed');
    expect(check?.detail).toBe('容量 100 人 < 需求 300 人（预计参与 300 人）');
    expect(evaluation.passed).toBe(false);
    expect(evaluation.failureReasons.join('；')).toContain('场地容量：容量 100 人 < 需求 300 人');
  });

  it('设备缺失时明确失败并点名设备', () => {
    const evaluation = evaluateCandidate(
      fixture,
      { ...baseSpec, requiredEquipmentIds: ['eq-001', 'eq-004'] },
      'act-001'
    );
    const check = checkOf(evaluation, 'equipment-available');
    expect(check?.status).toBe('failed');
    expect(check?.detail).toBe('候选场地缺少设备种类：eq-004 无线话筒');
  });

  it('资源不足时明确失败并给出需求数与可用数', () => {
    const evaluation = evaluateCandidate(
      fixture,
      { ...baseSpec, resourceNeeds: { 'res-001': 6 } },
      'act-001'
    );
    const check = checkOf(evaluation, 'resources-sufficient');
    expect(check?.status).toBe('failed');
    expect(check?.detail).toContain('目标需求 6 > 可用 5');
  });

  it('资源需求数量为负数或小数时明确失败', () => {
    const negative = checkResourceRequirements({ 'res-001': -1 }, fixture.resources);
    expect(negative.ok).toBe(false);
    expect(negative.problems.join('；')).toContain('非负整数');

    const fractional = checkResourceRequirements({ 'res-001': 2.5 }, fixture.resources);
    expect(fractional.ok).toBe(false);
  });

  it('资源未定义时明确报告', () => {
    const evaluation = evaluateCandidate(
      fixture,
      { ...baseSpec, resourceNeeds: { 'res-999': 1 } },
      'act-001'
    );
    const check = checkOf(evaluation, 'resources-sufficient');
    expect(check?.status).toBe('failed');
    expect(check?.detail).toContain('资源 res-999 未在数据集中定义');
  });

  it('候选场地未定义时直接失败', () => {
    const evaluation = evaluateCandidate(fixture, { ...baseSpec, venueId: 'venue-999' }, 'act-001');
    expect(evaluation.passed).toBe(false);
    expect(evaluation.checks).toHaveLength(1);
    expect(evaluation.checks[0]?.code).toBe('venue-exists');
    expect(evaluation.checks[0]?.detail).toBe('候选场地 venue-999 未在数据集中定义');
  });

  it('时间段非法时跳过开放时段与冲突评估，但整体判为失败', () => {
    const evaluation = evaluateCandidate(
      fixture,
      {
        ...baseSpec,
        slot: { start: '2026-10-20T24:00', end: '2026-10-20T25:00' }
      },
      'act-001'
    );
    expect(evaluation.passed).toBe(false);
    expect(checkOf(evaluation, 'slot-valid')?.status).toBe('failed');
    expect(checkOf(evaluation, 'slot-within-opening-hours')?.status).toBe('skipped');
    expect(checkOf(evaluation, 'slot-conflict-free')?.status).toBe('skipped');
    expect(evaluation.failureReasons.join('；')).toContain('YYYY-MM-DDTHH:mm');
  });
});
