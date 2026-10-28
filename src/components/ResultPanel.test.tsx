import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  ActivityTargetState,
  Candidate,
  CandidateScore
} from '../engine/candidates';
import type { ConstraintCheck, ConstraintCode } from '../engine/constraints';
import type { Activity } from '../types/activity';
import type { CampusDataset } from '../types/campus';
import type { VenueId } from '../types/ids';
import ResultPanel, { type ResultView } from './ResultPanel';

const SLOT = { start: '2026-11-05T10:00', end: '2026-11-05T12:00' };
const CONFLICT_SLOT = { start: '2026-10-22T14:00', end: '2026-10-22T16:00' };

/** 引擎 constraints.ts 的固定 label（测试夹具不新增文案）。 */
const LABELS: Readonly<Record<ConstraintCode, string>> = {
  'venue-exists': '候选场地已定义',
  'slot-valid': '时间段合法',
  'slot-within-opening-hours': '场地开放时段',
  'slot-conflict-free': '同场地时间冲突',
  'capacity-sufficient': '场地容量',
  'equipment-available': '设备种类匹配',
  'resources-sufficient': '资源数量'
};

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

/** findSlotConflicts 真实 detail 格式（constraints.ts:276）。 */
function conflictDetail(idsText: string): string {
  return `与同场地活动 ${idsText} 的时间段重叠（半开区间 [start, end)）`;
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

const ACTIVITY: Activity = {
  id: 'act-901',
  name: '模拟·测试活动',
  expectedAttendance: 80,
  currentVenueId: 'venue-901',
  currentSlot: SLOT,
  requiredEquipmentIds: [],
  resourceNeeds: {}
};

const TARGET: ActivityTargetState = {
  changeId: 'chg-test01',
  activityId: 'act-901',
  changeKind: 'venue',
  slot: SLOT,
  attendance: 80,
  requiredCapacity: 80,
  requiredEquipmentIds: [],
  resourceNeeds: {},
  candidateVenueIds: ['venue-901']
};

const CONFLICT_ACTIVITY: Activity = {
  id: 'act-903',
  name: '模拟·社团招新宣讲会',
  expectedAttendance: 90,
  currentVenueId: 'venue-903',
  currentSlot: CONFLICT_SLOT,
  requiredEquipmentIds: [],
  resourceNeeds: {}
};

const DATASET: Pick<CampusDataset, 'activities'> = { activities: [CONFLICT_ACTIVITY] };

function makeView(overrides: Partial<ResultView>): ResultView {
  return {
    source: 'custom',
    changeId: 'chg-test01',
    summary: null,
    status: null,
    statusLabel: null,
    feasible: [],
    excluded: [],
    warnings: [],
    limitations: [],
    target: TARGET,
    activity: ACTIVITY,
    ...overrides
  };
}

function render(view: ResultView, dataset?: Pick<CampusDataset, 'activities'>): string {
  return renderToStaticMarkup(
    <ResultPanel
      result={view}
      errors={[]}
      selectedCandidateKey={null}
      onSelectCandidate={() => undefined}
      decision={null}
      dataset={dataset}
    />
  );
}

describe('ResultPanel · 排序差异块（F3-B）', () => {
  it('两个可行候选：展示差值，且仅第 2 位起标注“相对第 N-1 位”', () => {
    const view = makeView({
      feasible: [
        makeCandidate('venue-901', makeScore(60, 60, 50)),
        makeCandidate('venue-902', makeScore(55, 52, 50))
      ]
    });

    const html = render(view);

    expect(html).toContain('排序差异（相对上位候选）');
    expect(html).toContain('相对第 1');
    expect(html).toContain('总分差 +5.00');
    expect(html).toContain('差异键：总分');
    expect(html).toContain('部分解释');
    expect((html.match(/相对第 /g) ?? []).length).toBe(1);
  });

  it('单候选或空可行集：不渲染排序差异块', () => {
    const single = render(makeView({ feasible: [makeCandidate('venue-901', makeScore(60, 60, 50))] }));
    expect(single).not.toContain('排序差异（相对上位候选）');

    const empty = render(makeView({ feasible: [] }));
    expect(empty).not.toContain('排序差异（相对上位候选）');
  });

  it('仅容量适配度口径：距离评分差显示“不可比”，不以 0 代替', () => {
    const view = makeView({
      feasible: [
        makeCandidate('venue-901', makeScore(60, 60, null)),
        makeCandidate('venue-902', makeScore(55, 50, null))
      ]
    });

    const html = render(view);

    expect(html).toContain('距离评分差 不可比');
    expect(html).not.toContain('距离评分差 +0.00');
  });

  it('同分同分项：显示 tie 的稳定序说明', () => {
    const view = makeView({
      feasible: [
        makeCandidate('venue-901', makeScore(50, 40, 45)),
        makeCandidate('venue-902', makeScore(50, 40, 45))
      ]
    });

    expect(render(view)).toContain('差异键：同分同分项');
  });
});

describe('ResultPanel · 排除原因汇总块（F3-B）', () => {
  const capacity = failedCheck('capacity-sufficient', '容量 80 人 < 需求 90 人');
  const equipment = failedCheck('equipment-available', '候选场地缺少设备种类');

  function excludedFixture(): readonly Candidate[] {
    return [
      makeCandidate('venue-903', null, [capacity], ['场地容量：容量 80 人 < 需求 90 人']),
      makeCandidate('venue-904', null, [capacity, equipment]),
      makeCandidate('venue-905', null, [capacity])
    ];
  }

  it('双计数独立呈现：涉及候选数与失败检查数', () => {
    const html = render(makeView({ excluded: excludedFixture() }));

    expect(html).toContain('排除原因汇总（3 个候选）');
    expect(html).toContain('涉及候选 3 个 · 失败检查 3 次');
    expect(html).toContain('涉及候选 1 个 · 失败检查 1 次');
    expect(html).toContain('场地容量（capacity-sufficient）');
    expect(html).toContain('设备种类匹配（equipment-available）');
  });

  it('不复制、不改写逐卡 failureReasons 原文', () => {
    const html = render(makeView({ excluded: excludedFixture() }));
    // 静态渲染对 "<" 做 HTML 转义；转义后仍保留完整原文，说明文案未被改写。
    expect(html).toContain('场地容量：容量 80 人 &lt; 需求 90 人');
  });

  it('未提供 dataset：汇总仍展示，冲突区明确降级', () => {
    const html = render(makeView({ excluded: excludedFixture() }));

    expect(html).toContain('排除原因汇总（3 个候选）');
    expect(html).toContain('未提供活动数据，未做冲突活动补全');
  });

  it('提供 dataset 且可靠匹配：展示活动名称、当前场地与当前时段，不可靠 ID 不出现', () => {
    const conflictCandidate = makeCandidate('venue-903', null, [
      failedCheck('slot-conflict-free', conflictDetail('act-903、act-999'))
    ]);
    const html = render(makeView({ excluded: [conflictCandidate] }), DATASET);

    expect(html).toContain('冲突活动（仅展示可在数据集中可靠匹配的条目）');
    expect(html).toContain('模拟·社团招新宣讲会（act-903）');
    expect(html).toContain('当前场地 venue-903');
    expect(html).toContain('当前时段 2026-10-22T14:00 → 2026-10-22T16:00');
    expect(html).not.toContain('act-999');
  });

  it('无被排除候选：不渲染汇总块；既有区块标题保持', () => {
    const html = render(
      makeView({
        feasible: [
          makeCandidate('venue-901', makeScore(60, 60, 50)),
          makeCandidate('venue-902', makeScore(55, 52, 50))
        ]
      })
    );

    expect(html).not.toContain('排除原因汇总');
    expect(html).toContain('推荐方案');
    expect(html).toContain('变更前后关键字段对比');
    expect(html).toContain('可行候选方案对比（2 个）');
    expect(html).toContain('被排除候选（0 个）及原因');
    expect(html).toContain('警告（0 条）');
    expect(html).toContain('能力限制（0 条）');
  });
});

describe('ResultPanel · 措辞与确定性约束（F3-B）', () => {
  it('渲染结果不含已执行语义与绝对化最优表述', () => {
    const conflictCandidate = makeCandidate('venue-903', null, [
      failedCheck('capacity-sufficient', '容量 80 人 < 需求 90 人'),
      failedCheck('slot-conflict-free', conflictDetail('act-903'))
    ]);
    const html = render(
      makeView({
        feasible: [
          makeCandidate('venue-901', makeScore(60, 60, 50)),
          makeCandidate('venue-902', makeScore(55, 52, 50))
        ],
        excluded: [conflictCandidate]
      }),
      DATASET
    );

    expect(html).not.toMatch(/已预约|已通知|已分配/);
    expect(html).toContain('不代表全局最优');
    expect(html).not.toMatch(/已达到全局最优|全局最优方案/);
  });

  it('相同 ResultView 渲染结果逐字节一致（确定性）', () => {
    const view = makeView({
      feasible: [
        makeCandidate('venue-901', makeScore(60, 60, 50)),
        makeCandidate('venue-902', makeScore(55, 52, 50))
      ],
      excluded: [makeCandidate('venue-903', null, [failedCheck('capacity-sufficient')])]
    });

    expect(render(view, DATASET)).toBe(render(view, DATASET));
  });
});

describe('2.0 排除候选时段显示', () => {
  it('同一场地两个排除候选都显示对应起止时段', () => {
    const first = makeCandidate('venue-903', null, [failedCheck('slot-conflict-free')]);
    const slot = { start: '2026-11-05T19:00', end: '2026-11-05T21:00' };
    const second = { ...first, slot, candidateKey: `venue-903@${slot.start}~${slot.end}` };
    const html = render(makeView({ excluded: [first, second] }));
    expect(html).toContain(`时段 [${SLOT.start}, ${SLOT.end})`);
    expect(html).toContain(`时段 [${slot.start}, ${slot.end})`);
  });
});
