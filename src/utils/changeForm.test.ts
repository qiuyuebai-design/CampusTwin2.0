import { describe, expect, it } from 'vitest';
import type { ActivityTargetState, Candidate } from '../engine/candidates';
import type { Activity } from '../types/activity';
import type { ActivityChange } from '../types/change';
import {
  SCORING_DISCLAIMER,
  buildComparisonRows,
  buildCustomChange,
  defaultForm,
  formatChangeStatus,
  formatLocalDateTime,
  formatScoringModeLabel,
  isActivityId,
  isChangeId,
  isEquipmentId,
  isResourceId,
  isVenueId,
  resolveScoringMode,
  toPresetOptions,
  validateForm,
  type ComparisonRow,
  type ComparisonRowKey
} from './changeForm';

const activity: Activity = {
  id: 'act-901',
  name: '测试·模拟活动',
  expectedAttendance: 100,
  currentVenueId: 'venue-901',
  currentSlot: { start: '2026-11-01T10:00', end: '2026-11-01T12:00' },
  requiredEquipmentIds: ['eq-001'],
  resourceNeeds: { 'res-001': 4 }
};

const REQUESTED_AT = '2026-10-17T10:00';

describe('formatLocalDateTime', () => {
  it('月日时分补零为两位', () => {
    const date = new Date(2026, 0, 5, 7, 8);
    expect(formatLocalDateTime(date)).toBe('2026-01-05T07:08');
  });

  it('双位时间原样保留', () => {
    const date = new Date(2026, 11, 31, 23, 59);
    expect(formatLocalDateTime(date)).toBe('2026-12-31T23:59');
  });
});

describe('defaultForm', () => {
  it('时间与人数字段预填活动当前值', () => {
    const form = defaultForm(activity);
    expect(form.activityId).toBe('act-901');
    expect(form.kind).toBe('time');
    expect(form.start).toBe('2026-11-01T10:00');
    expect(form.end).toBe('2026-11-01T12:00');
    expect(form.minCapacity).toBe('100');
    expect(form.after).toBe('100');
    expect(form.targetVenueId).toBe('');
    expect(form.requiredEquipmentIds).toEqual([]);
    expect(form.equipmentId).toBe('');
    expect(form.resourceId).toBe('');
  });
});

describe('validateForm · 时间变更', () => {
  it('必填项缺失时报错', () => {
    const form = { ...defaultForm(activity), start: '', end: '' };
    const result = validateForm(form);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('格式非法时报错', () => {
    const form = { ...defaultForm(activity), start: '2026/11/01 10:00' };
    const result = validateForm(form);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('格式非法');
  });

  it('时分超出 00:00–23:59 时报错', () => {
    const form = { ...defaultForm(activity), end: '2026-11-01T24:30' };
    const result = validateForm(form);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('00:00–23:59');
  });

  it('合法输入通过校验', () => {
    expect(validateForm(defaultForm(activity)).ok).toBe(true);
  });
});

describe('validateForm · 场地变更', () => {
  it('容量下限为 0 时报错', () => {
    const form = { ...defaultForm(activity), kind: 'venue' as const, minCapacity: '0' };
    const result = validateForm(form);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('正整数');
  });

  it('容量下限带小数时报错', () => {
    const form = { ...defaultForm(activity), kind: 'venue' as const, minCapacity: '120.5' };
    expect(validateForm(form).ok).toBe(false);
  });

  it('目标场地 ID 格式非法时报错', () => {
    const form = { ...defaultForm(activity), kind: 'venue' as const, targetVenueId: 'hall-1' };
    const result = validateForm(form);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('venue-001');
  });

  it('必需设备 ID 格式非法时报错', () => {
    const form = { ...defaultForm(activity), kind: 'venue' as const, requiredEquipmentIds: ['bad'] };
    expect(validateForm(form).ok).toBe(false);
  });

  it('合法输入通过校验（目标场地留空）', () => {
    const form = {
      ...defaultForm(activity),
      kind: 'venue' as const,
      minCapacity: '120',
      requiredEquipmentIds: ['eq-001']
    };
    expect(validateForm(form).ok).toBe(true);
  });
});

describe('validateForm · 规模变更', () => {
  it('人数为负数时报错', () => {
    const form = { ...defaultForm(activity), kind: 'scale' as const, after: '-10' };
    expect(validateForm(form).ok).toBe(false);
  });

  it('人数非整数时报错', () => {
    const form = { ...defaultForm(activity), kind: 'scale' as const, after: '12.5' };
    expect(validateForm(form).ok).toBe(false);
  });

  it('合法输入通过校验', () => {
    const form = { ...defaultForm(activity), kind: 'scale' as const, after: '150' };
    expect(validateForm(form).ok).toBe(true);
  });
});

describe('validateForm · 资源变更', () => {
  it('两项调整均为空时报错', () => {
    const form = { ...defaultForm(activity), kind: 'resource' as const };
    const result = validateForm(form);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('至少填写一项');
  });

  it('只填数量未选资源时报错', () => {
    const form = { ...defaultForm(activity), kind: 'resource' as const, resourceAfter: '6' };
    expect(validateForm(form).ok).toBe(false);
  });

  it('合法输入通过校验', () => {
    const form = {
      ...defaultForm(activity),
      kind: 'resource' as const,
      resourceId: 'res-001',
      resourceAfter: '6'
    };
    expect(validateForm(form).ok).toBe(true);
  });
});

describe('buildCustomChange', () => {
  it('校验不通过时返回错误且不构造变更', () => {
    const form = { ...defaultForm(activity), start: '' };
    const result = buildCustomChange(form, activity, REQUESTED_AT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('time 变更：before 取当前时段，after 取表单输入', () => {
    const form = {
      ...defaultForm(activity),
      start: '2026-11-01T08:30',
      end: '2026-11-01T12:00'
    };
    const result = buildCustomChange(form, activity, REQUESTED_AT);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const change = result.change;
    expect(change.kind).toBe('time');
    if (change.kind === 'time') {
      expect(change.payload.before).toEqual(activity.currentSlot);
      expect(change.payload.after).toEqual({ start: '2026-11-01T08:30', end: '2026-11-01T12:00' });
      expect(change.requestedBy).toBe('role-workbench-01');
      expect(change.requestedAt).toBe(REQUESTED_AT);
    }
  });

  it('venue 变更未指定目标场地时不写入 targetVenueId', () => {
    const form = {
      ...defaultForm(activity),
      kind: 'venue' as const,
      minCapacity: '120',
      requiredEquipmentIds: ['eq-001']
    };
    const result = buildCustomChange(form, activity, REQUESTED_AT);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const change = result.change;
    expect(change.kind).toBe('venue');
    if (change.kind === 'venue') {
      expect('targetVenueId' in change.payload).toBe(false);
      expect(change.payload.before).toBe('venue-901');
      expect(change.payload.minCapacity).toBe(120);
      expect(change.payload.requiredEquipmentIds).toEqual(['eq-001']);
    }
  });

  it('venue 变更指定目标场地时写入 targetVenueId', () => {
    const form = {
      ...defaultForm(activity),
      kind: 'venue' as const,
      minCapacity: '120',
      targetVenueId: 'venue-902',
      requiredEquipmentIds: []
    };
    const result = buildCustomChange(form, activity, REQUESTED_AT);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const change = result.change;
    if (change.kind === 'venue') {
      expect(change.payload.targetVenueId).toBe('venue-902');
    } else {
      throw new Error(`期望 venue 变更，实际 ${change.kind}`);
    }
  });

  it('scale 变更：before 取活动当前人数', () => {
    const form = { ...defaultForm(activity), kind: 'scale' as const, after: '150' };
    const result = buildCustomChange(form, activity, REQUESTED_AT);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const change = result.change;
    expect(change.kind).toBe('scale');
    if (change.kind === 'scale') {
      expect(change.payload.before).toBe(100);
      expect(change.payload.after).toBe(150);
    }
  });

  it('resource 变更：活动已有资源带 before，新增资源不带 before，设备不带 before', () => {
    const form = {
      ...defaultForm(activity),
      kind: 'resource' as const,
      equipmentId: 'eq-004',
      equipmentAfter: '1',
      resourceId: 'res-001',
      resourceAfter: '6'
    };
    const result = buildCustomChange(form, activity, REQUESTED_AT);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const change = result.change;
    expect(change.kind).toBe('resource');
    if (change.kind === 'resource') {
      const equipment = change.payload.equipmentAdjustments[0];
      expect(equipment.id).toBe('eq-004');
      expect('before' in equipment).toBe(false);
      const resource = change.payload.resourceAdjustments[0];
      expect(resource.id).toBe('res-001');
      expect(resource.before).toBe(4);
      expect(resource.after).toBe(6);
    }
  });

  it('resource 变更：活动当前没有的资源不携带 before', () => {
    const form = {
      ...defaultForm(activity),
      kind: 'resource' as const,
      resourceId: 'res-002',
      resourceAfter: '3'
    };
    const result = buildCustomChange(form, activity, REQUESTED_AT);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const change = result.change;
    if (change.kind === 'resource') {
      const resource = change.payload.resourceAdjustments[0];
      expect('before' in resource).toBe(false);
    } else {
      throw new Error(`期望 resource 变更，实际 ${change.kind}`);
    }
  });

  it('表单活动与传入活动不一致时拒绝构建', () => {
    const form = { ...defaultForm(activity), activityId: 'act-902' };
    const result = buildCustomChange(form, activity, REQUESTED_AT);
    expect(result.ok).toBe(false);
  });
});

describe('ID 形态判定', () => {
  it('合法 ID 通过，非法 ID 拒绝', () => {
    expect(isActivityId('act-001')).toBe(true);
    expect(isActivityId('act-1')).toBe(false);
    expect(isEquipmentId('eq-004')).toBe(true);
    expect(isEquipmentId('res-004')).toBe(false);
    expect(isResourceId('res-001')).toBe(true);
    expect(isResourceId('resource-1')).toBe(false);
    expect(isVenueId('venue-006')).toBe(true);
    expect(isVenueId('venue-6')).toBe(false);
    expect(isChangeId('chg-001')).toBe(true);
    expect(isChangeId('chg-form01')).toBe(false);
  });
});

describe('formatChangeStatus', () => {
  it('五种状态均映射为中文标签', () => {
    expect(formatChangeStatus('scheduled')).toBe('存在可行方案');
    expect(formatChangeStatus('infeasible')).toBe('无可行方案');
    expect(formatChangeStatus('invalid-change')).toBe('变更载荷无效');
    expect(formatChangeStatus('unknown-change')).toBe('未找到该变更');
    expect(formatChangeStatus('unknown-activity')).toBe('未找到关联活动');
  });
});

describe('toPresetOptions', () => {
  it('按变更列表生成下拉选项', () => {
    const changes: readonly ActivityChange[] = [
      {
        id: 'chg-001',
        activityId: 'act-901',
        kind: 'time',
        description: '测试变更',
        requestedAt: '2026-10-16T09:20',
        requestedBy: 'role-organizer-01',
        payload: { after: { start: '2026-11-01T09:00', end: '2026-11-01T12:00' } }
      }
    ];
    const options = toPresetOptions(changes);
    expect(options).toHaveLength(1);
    expect(options[0].id).toBe('chg-001');
    expect(options[0].kind).toBe('time');
    expect(options[0].activityId).toBe('act-901');
    expect(options[0].label).toBe('chg-001 · time → act-901');
    expect(options[0].description).toBe('测试变更');
  });
});

/* ---------- M1-D：buildComparisonRows / 评分口径纯函数 ---------- */

function makeTarget(overrides: Partial<ActivityTargetState> = {}): ActivityTargetState {
  return {
    changeId: 'chg-901',
    activityId: activity.id,
    changeKind: 'time',
    slot: { start: '2026-11-01T10:00', end: '2026-11-01T12:00' },
    attendance: activity.expectedAttendance,
    requiredCapacity: activity.expectedAttendance,
    requiredEquipmentIds: [...activity.requiredEquipmentIds],
    resourceNeeds: { ...activity.resourceNeeds },
    candidateVenueIds: [activity.currentVenueId],
    ...overrides
  };
}

function findRow(rows: readonly ComparisonRow[], key: ComparisonRowKey): ComparisonRow {
  const found = rows.find((row) => row.key === key);
  if (found === undefined) {
    throw new Error(`未找到对比行：${key}`);
  }
  return found;
}

describe('buildComparisonRows · target 为 null', () => {
  it('返回空数组，不崩溃、不伪造前后值', () => {
    expect(buildComparisonRows(activity, null)).toEqual([]);
  });
});

describe('buildComparisonRows · 字段映射', () => {
  it('time 变更：时间行变化，before 取 currentSlot、after 取 target.slot', () => {
    const target = makeTarget({
      changeKind: 'time',
      slot: { start: '2026-11-01T08:30', end: '2026-11-01T12:00' }
    });
    const rows = buildComparisonRows(activity, target);
    const timeRow = findRow(rows, 'time');
    expect(timeRow.beforeText).toBe('2026-11-01T10:00 → 2026-11-01T12:00');
    expect(timeRow.afterText).toBe('2026-11-01T08:30 → 2026-11-01T12:00');
    expect(timeRow.changed).toBe(true);
    expect(findRow(rows, 'attendance').changed).toBe(false);
    expect(rows).toHaveLength(6);
  });

  it('venue 变更：场地 before 为当前场地、after 为候选集合，多候选带说明', () => {
    const target = makeTarget({
      changeKind: 'venue',
      candidateVenueIds: ['venue-902', 'venue-903']
    });
    const venueRow = findRow(buildComparisonRows(activity, target), 'venue');
    expect(venueRow.beforeText).toBe('venue-901');
    expect(venueRow.afterText).toBe('venue-902、venue-903');
    expect(venueRow.changed).toBe(true);
    expect(venueRow.note).toContain('候选场地集合');
  });

  it('scale 变更：人数与容量需求行均变化且取真实数值', () => {
    const target = makeTarget({ changeKind: 'scale', attendance: 150, requiredCapacity: 150 });
    const rows = buildComparisonRows(activity, target);
    const attendanceRow = findRow(rows, 'attendance');
    const capacityRow = findRow(rows, 'capacity');
    expect(attendanceRow.beforeText).toBe('100');
    expect(attendanceRow.afterText).toBe('150');
    expect(attendanceRow.changed).toBe(true);
    expect(capacityRow.beforeText).toBe('100');
    expect(capacityRow.afterText).toBe('150');
    expect(capacityRow.changed).toBe(true);
    expect(findRow(rows, 'equipment').changed).toBe(false);
  });

  it('resource 变更：资源数量上调标记 updated，before/after 为真实数量', () => {
    const target = makeTarget({
      changeKind: 'resource',
      resourceNeeds: { 'res-001': 6 }
    });
    const resourceRow = findRow(buildComparisonRows(activity, target), 'resources');
    expect(resourceRow.changed).toBe(true);
    const delta = resourceRow.deltas.find((item) => item.id === 'res-001');
    expect(delta?.change).toBe('updated');
    expect(delta?.before).toBe(4);
    expect(delta?.after).toBe(6);
  });
});

describe('buildComparisonRows · 设备种类差异', () => {
  it('设备新增：change=added，before/after 均为 null（不编造数量）', () => {
    const target = makeTarget({ requiredEquipmentIds: ['eq-001', 'eq-004'] });
    const equipmentRow = findRow(buildComparisonRows(activity, target), 'equipment');
    expect(equipmentRow.changed).toBe(true);
    const delta = equipmentRow.deltas.find((item) => item.id === 'eq-004');
    expect(delta?.change).toBe('added');
    expect(delta?.before).toBeNull();
    expect(delta?.after).toBeNull();
    expect(equipmentRow.note).toContain('不含数量');
  });

  it('设备移除：change=removed', () => {
    const target = makeTarget({ requiredEquipmentIds: [] });
    const equipmentRow = findRow(buildComparisonRows(activity, target), 'equipment');
    const delta = equipmentRow.deltas.find((item) => item.id === 'eq-001');
    expect(delta?.change).toBe('removed');
    expect(equipmentRow.changed).toBe(true);
  });

  it('设备保持不变：change=unchanged，行标记无变化', () => {
    const target = makeTarget({ requiredEquipmentIds: ['eq-001'] });
    const equipmentRow = findRow(buildComparisonRows(activity, target), 'equipment');
    expect(equipmentRow.changed).toBe(false);
    expect(equipmentRow.deltas).toHaveLength(1);
    expect(equipmentRow.deltas[0].change).toBe('unchanged');
  });
});

describe('buildComparisonRows · 资源差异与"此前无此需求"', () => {
  it('资源新增：before 为 null（此前无此需求，不用 0 代替）', () => {
    const target = makeTarget({ resourceNeeds: { 'res-001': 4, 'res-002': 2 } });
    const resourceRow = findRow(buildComparisonRows(activity, target), 'resources');
    expect(resourceRow.changed).toBe(true);
    const delta = resourceRow.deltas.find((item) => item.id === 'res-002');
    expect(delta?.change).toBe('added');
    expect(delta?.before).toBeNull();
    expect(delta?.after).toBe(2);
  });

  it('资源移除：after 为 null', () => {
    const target = makeTarget({ resourceNeeds: {} });
    const resourceRow = findRow(buildComparisonRows(activity, target), 'resources');
    const delta = resourceRow.deltas.find((item) => item.id === 'res-001');
    expect(delta?.change).toBe('removed');
    expect(delta?.before).toBe(4);
    expect(delta?.after).toBeNull();
  });

  it('资源数量一致：change=unchanged，行标记无变化', () => {
    const target = makeTarget({ resourceNeeds: { 'res-001': 4 } });
    const resourceRow = findRow(buildComparisonRows(activity, target), 'resources');
    expect(resourceRow.changed).toBe(false);
    expect(resourceRow.deltas[0].change).toBe('unchanged');
  });
});

/* ---------- 评分口径统一展示 ---------- */

function makeCandidate(
  weightMode: 'capacity-only' | 'capacity-and-distance' | null,
  total = 60
): Candidate {
  const slot = { start: '2026-11-01T10:00', end: '2026-11-01T12:00' };
  return {
    candidateKey: `venue-902@${slot.start}~${slot.end}`,
    venueId: 'venue-902',
    venueName: '模拟·测试场地',
    isCurrentVenue: false,
    slot,
    evaluation: {
      venueId: 'venue-902',
      slot,
      passed: weightMode !== null,
      checks: [],
      failureReasons: weightMode === null ? ['场地容量：容量不足'] : []
    },
    score:
      weightMode === null
        ? null
        : {
            capacityFitScore: 60,
            distanceMeters: null,
            distanceScore: null,
            total,
            weightMode,
            explanation: []
          }
  };
}

describe('resolveScoringMode / 口径展示', () => {
  it('空可行候选集合返回 null（UI 不显示口径）', () => {
    expect(resolveScoringMode([])).toBeNull();
  });

  it('无评分候选（排除候选）返回 null，不伪造口径', () => {
    expect(resolveScoringMode([makeCandidate(null)])).toBeNull();
  });

  it('读取真实 weightMode 并映射中文标签', () => {
    expect(resolveScoringMode([makeCandidate('capacity-only')])).toBe('capacity-only');
    expect(resolveScoringMode([makeCandidate('capacity-and-distance')])).toBe('capacity-and-distance');
    expect(formatScoringModeLabel('capacity-only')).toBe('仅容量适配度');
    expect(formatScoringModeLabel('capacity-and-distance')).toBe('容量 + 距离');
  });

  it('评分声明明确不保证全局最优', () => {
    expect(SCORING_DISCLAIMER).toContain('启发式');
    expect(SCORING_DISCLAIMER).toContain('不保证全局最优');
    expect(SCORING_DISCLAIMER).not.toContain('全局最优解');
  });
});
