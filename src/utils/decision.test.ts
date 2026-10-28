import { describe, expect, it } from 'vitest';
import type { ActivityTargetState, Candidate } from '../engine/candidates';
import type { Activity } from '../types/activity';
import type { CampusDataset } from '../types/campus';
import type { VenueId } from '../types/ids';
import type { ResultView } from '../components/ResultPanel';
import {
  SIMULATION_NOTICE,
  analysisSignature,
  buildChecklistItems,
  buildConfirmationSummary,
  findSelectedCandidate,
  isSelectionValid,
  toggleChecklistItem,
  withCheckedState
} from './decision';

/* ---------- 固定测试数据（全部为测试构造，不依赖 src/data） ---------- */

const activity: Activity = {
  id: 'act-901',
  name: '测试·模拟活动',
  expectedAttendance: 100,
  currentVenueId: 'venue-901',
  currentSlot: { start: '2026-11-01T10:00', end: '2026-11-01T12:00' },
  requiredEquipmentIds: ['eq-001'],
  resourceNeeds: { 'res-001': 4 }
};

const target: ActivityTargetState = {
  changeId: 'chg-901',
  activityId: 'act-901',
  changeKind: 'venue',
  slot: { start: '2026-11-01T10:00', end: '2026-11-01T12:00' },
  attendance: 100,
  requiredCapacity: 120,
  requiredEquipmentIds: ['eq-001', 'eq-004'],
  resourceNeeds: { 'res-001': 6, 'res-002': 3 },
  candidateVenueIds: ['venue-902', 'venue-903']
};

function makeCandidate(venueId: VenueId, name: string, total = 70): Candidate {
  const slot = { start: '2026-11-01T10:00', end: '2026-11-01T12:00' };
  return {
    candidateKey: `${venueId}@${slot.start}~${slot.end}`,
    venueId,
    venueName: name,
    isCurrentVenue: venueId === 'venue-901',
    slot,
    evaluation: {
      venueId,
      slot,
      passed: true,
      checks: [
        { code: 'venue-exists', label: '候选场地已定义', status: 'passed', detail: '' },
        { code: 'slot-valid', label: '时间段合法', status: 'passed', detail: '' },
        { code: 'capacity-sufficient', label: '场地容量', status: 'passed', detail: '' }
      ],
      failureReasons: []
    },
    score: {
      capacityFitScore: 80,
      distanceMeters: 200,
      distanceScore: 80,
      total,
      weightMode: 'capacity-and-distance',
      explanation: []
    }
  };
}

const fullDataset: CampusDataset = {
  equipment: [
    { id: 'eq-001', name: '投影仪' },
    { id: 'eq-004', name: '无线话筒' }
  ],
  venues: [
    {
      id: 'venue-902',
      name: '模拟·测试厅',
      capacity: 200,
      openFrom: '08:00',
      openTo: '22:00',
      equipmentIds: ['eq-001', 'eq-004'],
      distanceToCenterMeters: 150
    },
    {
      id: 'venue-903',
      name: '模拟·备用厅',
      capacity: 150,
      openFrom: '08:00',
      openTo: '22:00',
      equipmentIds: ['eq-001', 'eq-004']
    }
  ],
  resources: [
    { id: 'res-001', name: '工作人员（人）', total: 60, available: 42 },
    { id: 'res-002', name: '桌椅（套）', total: 200, available: 150 }
  ],
  activities: [activity],
  changes: []
};

const candidateA = makeCandidate('venue-902', '模拟·测试厅', 70);
const candidateB = makeCandidate('venue-903', '模拟·备用厅', 55);

function makeResult(overrides: Partial<ResultView> = {}): ResultView {
  return {
    source: 'preset',
    changeId: 'chg-901',
    summary: '汇总',
    status: 'scheduled',
    statusLabel: '存在可行方案',
    feasible: [candidateA, candidateB],
    excluded: [],
    warnings: [],
    limitations: [],
    target,
    activity,
    ...overrides
  };
}

/* ---------- 1. 无可行候选 ---------- */

describe('无可行候选', () => {
  it('feasible 为空时不可建立有效选择', () => {
    const result = makeResult({ feasible: [] });
    expect(isSelectionValid(result, candidateA.candidateKey)).toBe(false);
    expect(findSelectedCandidate(result, candidateA.candidateKey)).toBeNull();
  });

  it('result 为 null 时不可选择', () => {
    expect(isSelectionValid(null, candidateA.candidateKey)).toBe(false);
    expect(findSelectedCandidate(null, candidateA.candidateKey)).toBeNull();
  });
});

/* ---------- 2/3. 非法选择与空选择 ---------- */

describe('非法选择与空选择', () => {
  it('venueId 不在 feasible 中时无效', () => {
    const result = makeResult({ feasible: [candidateA] });
    expect(isSelectionValid(result, candidateB.candidateKey)).toBe(false);
    expect(findSelectedCandidate(result, candidateB.candidateKey)).toBeNull();
  });

  it('未选择（null）时无效', () => {
    expect(isSelectionValid(makeResult(), null)).toBe(false);
    expect(findSelectedCandidate(makeResult(), null)).toBeNull();
  });

  it('target 为 null（无效载荷）时不可选择，不产生决策数据', () => {
    const result = makeResult({ target: null });
    expect(isSelectionValid(result, candidateA.candidateKey)).toBe(false);
    expect(findSelectedCandidate(result, candidateA.candidateKey)).toBeNull();
  });

  it('activity 为 null（未知活动）时不可选择', () => {
    const result = makeResult({ activity: null });
    expect(isSelectionValid(result, candidateA.candidateKey)).toBe(false);
  });

  it('有效选择返回对应候选', () => {
    const found = findSelectedCandidate(makeResult(), candidateB.candidateKey);
    expect(found?.venueId).toBe('venue-903');
    expect(found?.venueName).toBe('模拟·备用厅');
  });
});

/* ---------- 4. 候选切换 ---------- */

describe('切换候选', () => {
  it('摘要随所选候选变化（场地行不同）', () => {
    const rowOf = (candidate: Candidate) =>
      buildConfirmationSummary(activity, target, candidate, fullDataset).find(
        (row) => row.label === '场地'
      );
    const rowA = rowOf(candidateA);
    const rowB = rowOf(candidateB);
    expect(rowA?.value).toContain('venue-902');
    expect(rowB?.value).toContain('venue-903');
    expect(rowA?.value).not.toBe(rowB?.value);
  });

  it('清单的候选场地图随候选变化', () => {
    const venueItem = (candidate: Candidate) =>
      buildChecklistItems(target, candidate, fullDataset).find((item) => item.id === 'sys-venue');
    expect(venueItem(candidateA)?.detail).toContain('venue-902');
    expect(venueItem(candidateB)?.detail).toContain('venue-903');
  });
});

/* ---------- 5. 同一候选重新运行（签名防复活） ---------- */

describe('分析签名', () => {
  it('同参数重跑签名一致', () => {
    expect(analysisSignature(makeResult())).toBe(analysisSignature(makeResult()));
  });

  it('可行候选集合变化 → 签名变化（旧选择不再绑定新分析）', () => {
    const reordered = makeResult({ feasible: [candidateB, candidateA] });
    expect(analysisSignature(reordered)).not.toBe(analysisSignature(makeResult()));
  });

  it('目标状态变化 → 签名变化', () => {
    const changed = makeResult({
      target: { ...target, requiredCapacity: 999 }
    });
    expect(analysisSignature(changed)).not.toBe(analysisSignature(makeResult()));
  });

  it('result 为 null 返回 no-result', () => {
    expect(analysisSignature(null)).toBe('no-result');
  });
});

/* ---------- 6. 活动切换 ---------- */

describe('活动切换', () => {
  it('关联活动变化 → 签名变化', () => {
    const other = makeResult({
      activity: { ...activity, id: 'act-902' as Activity['id'] }
    });
    expect(analysisSignature(other)).not.toBe(analysisSignature(makeResult()));
  });
});

/* ---------- 7. 状态清空 ---------- */

describe('状态清空语义', () => {
  it('target 为 null 的结果不产生摘要/清单所需选择', () => {
    const result = makeResult({ target: null });
    expect(isSelectionValid(result, candidateA.candidateKey)).toBe(false);
    expect(findSelectedCandidate(result, candidateA.candidateKey)).toBeNull();
  });
});

/* ---------- 8. 资源需求与可用量 ---------- */

describe('资源需求与可用量', () => {
  it('摘要与清单显示需求/可用量对照', () => {
    const rows = buildConfirmationSummary(activity, target, candidateA, fullDataset);
    const resourceRow = rows.find((row) => row.label === '资源需求');
    expect(resourceRow?.value).toContain('需求 6 / 可用 42');
    const items = buildChecklistItems(target, candidateA, fullDataset);
    const sysRes = items.find((item) => item.id === 'sys-resources');
    expect(sysRes?.detail).toContain('需求 6 / 可用 42');
  });

  it('资源元数据缺失时明确降级，不编造名称/可用量', () => {
    const emptyDataset: CampusDataset = { ...fullDataset, resources: [] };
    const rows = buildConfirmationSummary(activity, target, candidateA, emptyDataset);
    const resourceRow = rows.find((row) => row.label === '资源需求');
    expect(resourceRow?.value).toContain('资源名称缺失');
    const sysRes = buildChecklistItems(target, candidateA, emptyDataset).find(
      (item) => item.id === 'sys-resources'
    );
    expect(sysRes?.detail).toContain('可用量未知');
  });
});

/* ---------- 9. 设备无数量字段 ---------- */

describe('设备种类（无数量字段）', () => {
  it('设备清单仅列种类，不出现数量或库存语义', () => {
    const rows = buildConfirmationSummary(activity, target, candidateA, fullDataset);
    const equipmentRow = rows.find((row) => row.label === '设备种类');
    expect(equipmentRow?.value).toContain('投影仪');
    expect(equipmentRow?.value).toContain('无线话筒');
    expect(equipmentRow?.value).not.toMatch(/库存/);
    const sysEquip = buildChecklistItems(target, candidateA, fullDataset).find(
      (item) => item.id === 'sys-equipment'
    );
    expect(sysEquip?.label).toContain('无数量字段');
    expect(sysEquip?.detail).not.toMatch(/库存/);
  });
});

/* ---------- 10. 场地元数据缺失 ---------- */

describe('场地元数据缺失降级', () => {
  it('候选场地不在数据集时容量显示为信息缺失', () => {
    const emptyVenues: CampusDataset = { ...fullDataset, venues: [] };
    const rows = buildConfirmationSummary(activity, target, candidateA, emptyVenues);
    const capacityRow = rows.find((row) => row.label === '容量需求');
    expect(capacityRow?.value).toContain('场地容量信息缺失');
    const sysVenue = buildChecklistItems(target, candidateA, emptyVenues).find(
      (item) => item.id === 'sys-venue'
    );
    expect(sysVenue?.detail).toContain('场地容量信息缺失');
  });
});

/* ---------- 11/12. 清单勾选、取消与未知 ID ---------- */

describe('清单勾选更新', () => {
  const items = buildChecklistItems(target, candidateA, fullDataset);

  it('勾选与取消勾选（不可变：入参不被修改）', () => {
    const before = [...items];
    const checked = toggleChecklistItem(items, [], 'manual-venue-availability');
    expect(checked).toEqual(['manual-venue-availability']);
    expect(items).toEqual(before);
    const unchecked = toggleChecklistItem(items, checked, 'manual-venue-availability');
    expect(unchecked).toEqual([]);
    expect(unchecked).not.toBe(checked);
  });

  it('未知 itemId 返回原数组引用（不误改其他事项）', () => {
    const checkedIds = ['sys-target'];
    expect(toggleChecklistItem(items, checkedIds, 'manual-not-exist')).toBe(checkedIds);
    expect(toggleChecklistItem(items, checkedIds, '')).toBe(checkedIds);
  });

  it('withCheckedState 合并勾选状态且不修改入参', () => {
    const displayed = withCheckedState(items, ['sys-target', 'manual-final-approval']);
    expect(displayed.find((item) => item.id === 'sys-target')?.checked).toBe(true);
    expect(displayed.find((item) => item.id === 'sys-venue')?.checked).toBe(false);
    expect(items.every((item) => item.checked === false)).toBe(true);
  });

  it('清单 ID 稳定唯一，且分为系统/人工两组', () => {
    const ids = items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(items.filter((item) => item.kind === 'system').length).toBeGreaterThanOrEqual(5);
    expect(items.filter((item) => item.kind === 'manual').length).toBe(6);
    const manualLabels = items
      .filter((item) => item.kind === 'manual')
      .map((item) => item.label)
      .join(' ');
    expect(manualLabels).toContain('场地实际可用性');
    expect(manualLabels).toContain('设备到位');
    expect(manualLabels).toContain('资源准备');
    expect(manualLabels).toContain('相关人员知悉');
    expect(manualLabels).toContain('参与人员通知');
    expect(manualLabels).toContain('最终方案确认');
  });
});

/* ---------- 13. 模拟措辞（禁止已执行语义） ---------- */

describe('模拟措辞', () => {
  it('固定声明包含本地模拟与未执行语义', () => {
    expect(SIMULATION_NOTICE).toContain('本地模拟');
    expect(SIMULATION_NOTICE).toContain('未执行真实预约');
    expect(SIMULATION_NOTICE).toContain('持久化');
  });

  it('所有生成文案不含"已预约/已通知/已分配"', () => {
    const rows = buildConfirmationSummary(activity, target, candidateA, fullDataset);
    const items = buildChecklistItems(target, candidateA, fullDataset);
    const corpus = [
      SIMULATION_NOTICE,
      ...rows.map((row) => `${row.label}:${row.value}`),
      ...items.map((item) => `${item.label}:${item.detail}`)
    ].join('\n');
    expect(corpus).not.toContain('已预约');
    expect(corpus).not.toContain('已通知');
    expect(corpus).not.toContain('已分配');
  });

  it('评分声明保留启发式与不保证全局最优', () => {
    const sysScoring = buildChecklistItems(target, candidateA, fullDataset).find(
      (item) => item.id === 'sys-scoring'
    );
    expect(sysScoring?.detail).toContain('不保证全局最优');
  });
});

/* ---------- F3-A：候选身份（场地 × 时段）与时段展示 ---------- */

function timedCandidate(slotStart: string, slotEnd: string, total = 70): Candidate {
  const slot = { start: slotStart, end: slotEnd };
  return {
    candidateKey: `venue-902@${slotStart}~${slotEnd}`,
    venueId: 'venue-902',
    venueName: '模拟·测试厅',
    isCurrentVenue: false,
    slot,
    evaluation: {
      venueId: 'venue-902',
      slot,
      passed: true,
      checks: [],
      failureReasons: []
    },
    score: {
      capacityFitScore: 75,
      distanceMeters: 120,
      distanceScore: 88,
      total,
      weightMode: 'capacity-and-distance',
      explanation: []
    }
  };
}

describe('F3-A 决策身份隔离（同场地不同时间）', () => {
  it('同场地不同时段是不同选择，各自可被选中', () => {
    const early = timedCandidate('2026-11-01T10:00', '2026-11-01T12:00');
    const late = timedCandidate('2026-11-01T14:00', '2026-11-01T16:00', 62);
    const result = makeResult({ feasible: [early, late] });

    expect(early.venueId).toBe(late.venueId);
    expect(early.candidateKey).not.toBe(late.candidateKey);
    expect(isSelectionValid(result, early.candidateKey)).toBe(true);
    expect(isSelectionValid(result, late.candidateKey)).toBe(true);
    expect(findSelectedCandidate(result, late.candidateKey)?.slot.start).toBe('2026-11-01T14:00');
    expect(findSelectedCandidate(result, 'venue-902')).toBeNull();
  });

  it('分析签名覆盖候选时段：同场地不同时间的分析签名不同，旧选择不跨时段复活', () => {
    const resultA = makeResult({
      feasible: [timedCandidate('2026-11-01T10:00', '2026-11-01T12:00')]
    });
    const resultB = makeResult({
      feasible: [timedCandidate('2026-11-01T14:00', '2026-11-01T16:00')]
    });
    expect(analysisSignature(resultA)).not.toBe(analysisSignature(resultB));
    expect(analysisSignature(resultA)).toContain('venue-902@2026-11-01T10:00');
  });
});

describe('F3-A 摘要与清单的时段展示', () => {
  it('摘要"目标时段"取所选候选时段，另列基准时段（取自 target.slot）', () => {
    const late = timedCandidate('2026-11-01T14:00', '2026-11-01T16:00');
    const rows = buildConfirmationSummary(activity, target, late, fullDataset);
    const chosen = rows.find((row) => row.label === '目标时段');
    const base = rows.find((row) => row.label === '基准时段（目标状态）');
    expect(chosen?.value).toBe('2026-11-01T14:00 → 2026-11-01T16:00');
    expect(base?.value).toBe('2026-11-01T10:00 → 2026-11-01T12:00');
    expect(changedChosenRows(rows)).toBe(true);
  });

  it('清单含"所选时段"系统项并显示候选 key；人工确认项仍为 6 项', () => {
    const late = timedCandidate('2026-11-01T14:00', '2026-11-01T16:00');
    const items = buildChecklistItems(target, late, fullDataset);
    const slotItem = items.find((item) => item.id === 'sys-slot');
    expect(slotItem?.kind).toBe('system');
    expect(slotItem?.detail).toContain('venue-902@2026-11-01T14:00');
    expect(slotItem?.detail).toContain('半开区间');
    expect(items.filter((item) => item.kind === 'system').length).toBe(6);
    expect(items.filter((item) => item.kind === 'manual').length).toBe(6);
    expect(items.every((item) => item.checked === false)).toBe(true);
  });
});

function changedChosenRows(rows: readonly { readonly label: string }[]): boolean {
  return rows.some((row) => row.label === '基准时段（目标状态）');
}
