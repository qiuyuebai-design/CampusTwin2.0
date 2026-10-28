import { describe, expect, it } from 'vitest';
import type { Candidate, CandidateScore } from '../engine/candidates';
import type { ConstraintCheck, ConstraintCode } from '../engine/constraints';
import type { Activity } from '../types/activity';
import type { CampusDataset } from '../types/campus';
import type { VenueId } from '../types/ids';
import {
  buildExclusionOverview,
  explainRankDeltas,
  resolveConflictActivities,
  summarizeExclusions
} from './explain';

const SLOT = { start: '2026-11-05T10:00', end: '2026-11-05T12:00' };

/** 引擎 constraints.ts 中的固定 label（逐字一致，测试夹具不新增文案）。 */
const LABELS: Readonly<Record<ConstraintCode, string>> = {
  'venue-exists': '候选场地已定义',
  'slot-valid': '时间段合法',
  'slot-within-opening-hours': '场地开放时段',
  'slot-conflict-free': '同场地时间冲突',
  'capacity-sufficient': '场地容量',
  'equipment-available': '设备种类匹配',
  'resources-sufficient': '资源数量'
};

/** findSlotConflicts 的真实 detail 后缀（constraints.ts:276，含字面量 start, end）。 */
const CONFLICT_SUFFIX_TEXT = ' 的时间段重叠（半开区间 [start, end)）';

function conflictDetail(idsText: string): string {
  return `与同场地活动 ${idsText}${CONFLICT_SUFFIX_TEXT}`;
}

function makeScore(
  total: number,
  capacityFitScore: number,
  distanceScore: number | null
): CandidateScore {
  return {
    capacityFitScore,
    distanceMeters: distanceScore === null ? null : 300,
    distanceScore,
    total,
    weightMode: distanceScore === null ? 'capacity-only' : 'capacity-and-distance',
    explanation: []
  };
}

function failedCheck(code: ConstraintCode, detail = '引擎原文原因'): ConstraintCheck {
  return { code, label: LABELS[code], status: 'failed', detail };
}

function passedCheck(code: ConstraintCode, detail = '通过'): ConstraintCheck {
  return { code, label: LABELS[code], status: 'passed', detail };
}

function makeCandidate(
  venueId: VenueId,
  score: CandidateScore | null,
  checks: readonly ConstraintCheck[] = [],
  failureReasons: readonly string[] = []
): Candidate {
  return {
    candidateKey: `${venueId}@${SLOT.start}~${SLOT.end}`,
    venueId,
    venueName: `模拟·${venueId}`,
    isCurrentVenue: false,
    slot: SLOT,
    evaluation: {
      venueId,
      slot: SLOT,
      passed: checks.every((check) => check.status !== 'failed'),
      checks,
      failureReasons
    },
    score
  };
}

const ACT_002: Activity = {
  id: 'act-002',
  name: '模拟·社团招新宣讲会',
  expectedAttendance: 90,
  currentVenueId: 'venue-003',
  currentSlot: { start: '2026-10-22T14:00', end: '2026-10-22T16:00' },
  requiredEquipmentIds: [],
  resourceNeeds: {}
};

const ACT_003: Activity = {
  id: 'act-003',
  name: '模拟·教育技术学术讲座',
  expectedAttendance: 60,
  currentVenueId: 'venue-004',
  currentSlot: { start: '2026-10-23T15:00', end: '2026-10-23T17:00' },
  requiredEquipmentIds: [],
  resourceNeeds: {}
};

const DATASET: Pick<CampusDataset, 'activities'> = { activities: [ACT_002, ACT_003] };

/* ---------- 排名差值（部分解释） ---------- */

describe('explainRankDeltas', () => {
  it('空数组返回空结果', () => {
    expect(explainRankDeltas([])).toEqual([]);
  });

  it('单候选：位次 1，无上位比较，delta 全 null，partialExplain 恒 true', () => {
    const only = makeCandidate('venue-001', makeScore(60, 60, 50));
    const [row] = explainRankDeltas([only]);

    expect(row?.rank).toBe(1);
    expect(row?.vsRank).toBeNull();
    expect(row?.vsCandidateKey).toBeNull();
    expect(row?.totalDelta).toBeNull();
    expect(row?.capacityDelta).toBeNull();
    expect(row?.distanceDelta).toBeNull();
    expect(row?.partialExplain).toBe(true);
    expect(row?.reason).toBe('tie');
  });

  it('并列分数：reason = tie，三项 delta 均为 0', () => {
    const first = makeCandidate('venue-001', makeScore(50, 40, 60));
    const second = makeCandidate('venue-002', makeScore(50, 40, 60));
    const rows = explainRankDeltas([first, second]);

    expect(rows[1]?.reason).toBe('tie');
    expect(rows[1]?.totalDelta).toBe(0);
    expect(rows[1]?.capacityDelta).toBe(0);
    expect(rows[1]?.distanceDelta).toBe(0);
    expect(rows[1]?.partialExplain).toBe(true);
  });

  it('总分差异：reason = total，delta 方向为「上位 − 当前」并保留两位', () => {
    const above = makeCandidate('venue-001', makeScore(50.6, 73.33, 86));
    const current = makeCandidate('venue-002', makeScore(47.6, 70, 80));
    const rows = explainRankDeltas([above, current]);

    expect(rows[1]?.reason).toBe('total');
    expect(rows[1]?.totalDelta).toBe(3);
    expect(rows[1]?.capacityDelta).toBe(3.33);
    expect(rows[1]?.distanceDelta).toBe(6);
  });

  it('总分相同、容量分不同：reason = capacityFitScore，totalDelta 为 0', () => {
    const above = makeCandidate('venue-001', makeScore(50, 50, 55));
    const current = makeCandidate('venue-002', makeScore(50, 45, 55));
    const rows = explainRankDeltas([above, current]);

    expect(rows[1]?.reason).toBe('capacityFitScore');
    expect(rows[1]?.totalDelta).toBe(0);
    expect(rows[1]?.capacityDelta).toBe(5);
    expect(rows[1]?.distanceDelta).toBe(0);
  });

  it('任一距离分为 null（含 capacity-only 口径）：distanceDelta 为 null，不编造', () => {
    const withoutDistance = makeCandidate('venue-001', makeScore(50, 40, null));
    const alsoWithout = makeCandidate('venue-002', makeScore(50, 40, null));
    const tieRows = explainRankDeltas([withoutDistance, alsoWithout]);
    expect(tieRows[1]?.distanceDelta).toBeNull();
    expect(tieRows[1]?.reason).toBe('tie');

    const withDistance = makeCandidate('venue-003', makeScore(50, 40, 60));
    const mixedRows = explainRankDeltas([withoutDistance, withDistance]);
    expect(mixedRows[1]?.reason).toBe('tie');
    expect(mixedRows[1]?.distanceDelta).toBeNull();
  });

  it('不重新排序、不修改输入：乱序入参按原位置编号，差值方向不变', () => {
    const low = makeCandidate('venue-001', makeScore(40, 40, 30));
    const high = makeCandidate('venue-002', makeScore(50, 50, 30));
    const input = [low, high];
    const before = JSON.stringify(input);

    const rows = explainRankDeltas(input);

    expect(JSON.stringify(input)).toBe(before);
    expect(rows.map((row) => row.rank)).toEqual([1, 2]);
    expect(rows[0]?.candidateKey).toBe(low.candidateKey);
    expect(rows[1]?.candidateKey).toBe(high.candidateKey);
    expect(rows[1]?.totalDelta).toBe(-10);
    expect(rows[1]?.reason).toBe('total');
  });

  it('score 为 null（类型允许）时不伪造差值与原因，但仍保留真实位置关系', () => {
    const scored = makeCandidate('venue-001', makeScore(60, 60, 50));
    const unscored = makeCandidate('venue-002', null);

    const after = explainRankDeltas([scored, unscored]);
    expect(after[1]?.vsRank).toBe(1);
    expect(after[1]?.vsCandidateKey).toBe(scored.candidateKey);
    expect(after[1]?.totalDelta).toBeNull();
    expect(after[1]?.capacityDelta).toBeNull();
    expect(after[1]?.distanceDelta).toBeNull();
    expect(after[1]?.reason).toBe('tie');
    expect(after[1]?.partialExplain).toBe(true);

    const before = explainRankDeltas([unscored, scored]);
    expect(before[0]?.vsRank).toBeNull();
    expect(before[1]?.vsCandidateKey).toBe(unscored.candidateKey);
    expect(before[1]?.totalDelta).toBeNull();
    expect(before[1]?.reason).toBe('tie');
  });
});

/* ---------- 排除原因聚合 ---------- */

describe('summarizeExclusions', () => {
  it('空输入返回稳定空结构', () => {
    expect(summarizeExclusions([])).toEqual({
      totalCandidates: 0,
      groups: []
    });
  });

  it('同一候选多重失败：各 code 独立成组，各计 1/1；skipped 检查不计入', () => {
    const candidate = makeCandidate('venue-003', null, [
      failedCheck('capacity-sufficient', '容量 80 人 < 需求 90 人'),
      failedCheck('equipment-available', '候选场地缺少设备种类：eq-001 投影仪'),
      { code: 'slot-within-opening-hours', label: LABELS['slot-within-opening-hours'], status: 'skipped', detail: '时间段非法，未评估开放时段' }
    ]);

    const summary = summarizeExclusions([candidate]);

    expect(summary.totalCandidates).toBe(1);
    expect(summary.groups.map((group) => group.code)).toEqual([
      'capacity-sufficient',
      'equipment-available'
    ]);
    for (const group of summary.groups) {
      expect(group.candidateCount).toBe(1);
      expect(group.failureCount).toBe(1);
      expect(group.candidateKeys).toEqual([candidate.candidateKey]);
    }
    expect(summary.groups[0]?.label).toBe('场地容量');
  });

  it('同一 code 跨多个候选：candidateCount 与 failureCount 分别为 3/3，key 保序', () => {
    const candidates = [
      makeCandidate('venue-001', null, [failedCheck('capacity-sufficient')]),
      makeCandidate('venue-002', null, [failedCheck('capacity-sufficient')]),
      makeCandidate('venue-003', null, [failedCheck('capacity-sufficient')]),
      makeCandidate('venue-004', null, [failedCheck('equipment-available')])
    ];

    const summary = summarizeExclusions(candidates);

    expect(summary.totalCandidates).toBe(4);
    expect(summary.groups.map((group) => group.code)).toEqual([
      'capacity-sufficient',
      'equipment-available'
    ]);
    expect(summary.groups[0]?.candidateCount).toBe(3);
    expect(summary.groups[0]?.failureCount).toBe(3);
    expect(summary.groups[0]?.candidateKeys).toEqual([
      `venue-001@${SLOT.start}~${SLOT.end}`,
      `venue-002@${SLOT.start}~${SLOT.end}`,
      `venue-003@${SLOT.start}~${SLOT.end}`
    ]);
  });

  it('同一候选同一 code 出现两次：candidateCount=1 与 failureCount=2 独立计数', () => {
    const candidate = makeCandidate('venue-001', null, [
      failedCheck('capacity-sufficient', '第一次'),
      failedCheck('capacity-sufficient', '第二次')
    ]);

    const summary = summarizeExclusions([candidate]);

    expect(summary.groups).toHaveLength(1);
    expect(summary.groups[0]?.candidateCount).toBe(1);
    expect(summary.groups[0]?.failureCount).toBe(2);
    expect(summary.groups[0]?.candidateKeys).toHaveLength(1);
  });

  it('分组顺序确定：failureCount DESC → code ASC', () => {
    const candidates = [
      makeCandidate('venue-001', null, [
        failedCheck('capacity-sufficient'),
        failedCheck('venue-exists')
      ]),
      makeCandidate('venue-002', null, [
        failedCheck('capacity-sufficient'),
        failedCheck('equipment-available')
      ]),
      makeCandidate('venue-003', null, [failedCheck('resources-sufficient')])
    ];

    const summary = summarizeExclusions(candidates);

    expect(summary.groups.map((group) => [group.code, group.failureCount])).toEqual([
      ['capacity-sufficient', 2],
      ['equipment-available', 1],
      ['resources-sufficient', 1],
      ['venue-exists', 1]
    ]);
  });

  it('不读取、不复制 failureReasons 文案，且不修改输入', () => {
    const sentinel = 'SENTINEL：既有排除文案不得进入聚合输出';
    const candidate = makeCandidate(
      'venue-001',
      null,
      [failedCheck('capacity-sufficient')],
      [sentinel]
    );
    const before = JSON.stringify(candidate);

    const summary = summarizeExclusions([candidate]);

    expect(JSON.stringify(candidate)).toBe(before);
    expect(JSON.stringify(summary)).not.toContain(sentinel);
    expect(summary.groups[0]?.candidateCount).toBe(1);
  });
});

/* ---------- 冲突活动只读补全 ---------- */

describe('resolveConflictActivities', () => {
  it('活动缺失：保留原始 ID，resolved=false，其余字段为 null，不猜测', () => {
    expect(resolveConflictActivities(DATASET, ['act-404'])).toEqual([
      {
        activityId: 'act-404',
        resolved: false,
        name: null,
        currentVenueId: null,
        currentSlotText: null
      }
    ]);
  });

  it('命中活动：返回真实名称、当前场地与当前时段文案', () => {
    expect(resolveConflictActivities(DATASET, ['act-002'])).toEqual([
      {
        activityId: 'act-002',
        resolved: true,
        name: '模拟·社团招新宣讲会',
        currentVenueId: 'venue-003',
        currentSlotText: '2026-10-22T14:00 → 2026-10-22T16:00'
      }
    ]);
  });

  it('空 IDs 返回空数组', () => {
    expect(resolveConflictActivities(DATASET, [])).toEqual([]);
  });

  it('重复 ID 保序去重', () => {
    const refs = resolveConflictActivities(DATASET, ['act-002', 'act-003', 'act-002']);
    expect(refs.map((ref) => ref.activityId)).toEqual(['act-002', 'act-003']);
  });
});

/* ---------- 排除总览（聚合 + 冲突补全） ---------- */

describe('buildExclusionOverview', () => {
  it('空输入返回空摘要与空冲突列表', () => {
    expect(buildExclusionOverview([], DATASET)).toEqual({
      summary: { totalCandidates: 0, groups: [] },
      conflictRefs: []
    });
  });

  it('仅解析 slot-conflict-free 的失败检查：其他 code、passed 状态与不可解析格式均不产生补全，且不抛错', () => {
    const wrongCode = makeCandidate('venue-003', null, [
      failedCheck('capacity-sufficient', conflictDetail('act-002'))
    ]);
    const notFailed = makeCandidate('venue-003', null, [
      passedCheck('slot-conflict-free', conflictDetail('act-002'))
    ]);
    const badFormat = makeCandidate('venue-003', null, [
      failedCheck('slot-conflict-free', '格式不可识别的详情')
    ]);

    const overview = buildExclusionOverview([wrongCode, notFailed, badFormat], DATASET);

    expect(overview.conflictRefs).toEqual([]);
    expect(overview.summary.totalCandidates).toBe(3);
    expect(overview.summary.groups.map((group) => group.code)).toEqual([
      'capacity-sufficient',
      'slot-conflict-free'
    ]);
  });

  it('端到端：匹配成功、场地核验失败被丢弃、缺失 ID 被丢弃、跨候选去重', () => {
    const candVenue003 = makeCandidate('venue-003', null, [
      failedCheck('slot-conflict-free', conflictDetail('act-002、act-003'))
    ]);
    const candVenue004 = makeCandidate('venue-004', null, [
      failedCheck('slot-conflict-free', conflictDetail('act-003'))
    ]);
    const candVenue005 = makeCandidate('venue-005', null, [
      failedCheck('slot-conflict-free', conflictDetail('act-002'))
    ]);

    const overview = buildExclusionOverview(
      [candVenue003, candVenue004, candVenue005],
      DATASET
    );

    // act-002 在 venue-003：与 candVenue003 匹配成功；candVenue005 的同名条目因场地不符被丢弃
    // act-003 在 venue-004：candVenue003 中的同名条目因场地不符被丢弃，candVenue004 匹配成功
    expect(overview.conflictRefs.map((ref) => ref.activityId)).toEqual(['act-002', 'act-003']);
    expect(overview.conflictRefs.every((ref) => ref.resolved)).toBe(true);
    expect(overview.conflictRefs[0]?.currentVenueId).toBe('venue-003');
    expect(overview.conflictRefs[1]?.currentVenueId).toBe('venue-004');

    expect(overview.summary.groups).toHaveLength(1);
    expect(overview.summary.groups[0]?.code).toBe('slot-conflict-free');
    expect(overview.summary.groups[0]?.candidateCount).toBe(3);
    expect(overview.summary.groups[0]?.failureCount).toBe(3);
  });
});

/* ---------- 模块级：措辞与确定性 ---------- */

describe('模块级约束', () => {
  it('全部输出不含"已预约/已通知/已分配/全局最优"等已执行或绝对化措辞', () => {
    const feasible = [
      makeCandidate('venue-001', makeScore(50.6, 73.33, 86)),
      makeCandidate('venue-002', makeScore(47.6, 70, 80))
    ];
    const excluded = [
      makeCandidate('venue-003', null, [
        failedCheck('capacity-sufficient', '容量 80 人 < 需求 90 人'),
        failedCheck('slot-conflict-free', conflictDetail('act-002'))
      ])
    ];

    const json = JSON.stringify([
      explainRankDeltas(feasible),
      summarizeExclusions(excluded),
      resolveConflictActivities(DATASET, ['act-002', 'act-404']),
      buildExclusionOverview(excluded, DATASET)
    ]);

    expect(json).not.toMatch(/已预约|已通知|已分配|全局最优/);
  });

  it('同输入重复调用结果完全一致（确定性）', () => {
    const feasible = [
      makeCandidate('venue-001', makeScore(50, 50, 55)),
      makeCandidate('venue-002', makeScore(50, 45, 55)),
      makeCandidate('venue-003', makeScore(48, 45, 55))
    ];
    const excluded = [
      makeCandidate('venue-004', null, [
        failedCheck('capacity-sufficient'),
        failedCheck('equipment-available'),
        failedCheck('slot-conflict-free', conflictDetail('act-002'))
      ]),
      makeCandidate('venue-005', null, [failedCheck('capacity-sufficient')])
    ];

    const first = JSON.stringify([
      explainRankDeltas(feasible),
      summarizeExclusions(excluded),
      resolveConflictActivities(DATASET, ['act-002', 'act-003']),
      buildExclusionOverview(excluded, DATASET)
    ]);
    const second = JSON.stringify([
      explainRankDeltas(feasible),
      summarizeExclusions(excluded),
      resolveConflictActivities(DATASET, ['act-002', 'act-003']),
      buildExclusionOverview(excluded, DATASET)
    ]);

    expect(first).toBe(second);
  });
});

describe('2.0 容量口径解释', () => {
  it('容量口径的旧距离数值不会成为排名理由或距离差值', () => {
    const a = makeCandidate('venue-001', { ...makeScore(50, 50, 10), weightMode: 'capacity-only' });
    const b = makeCandidate('venue-002', { ...makeScore(50, 50, 99), weightMode: 'capacity-only' });
    const row = explainRankDeltas([a, b])[1];
    expect(row?.reason).toBe('tie'); expect(row?.distanceDelta).toBeNull();
  });
});
