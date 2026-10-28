import type { CampusDataset } from '../types/campus';

/**
 * CampusTwin-DEMO 模拟数据集。
 *
 * 重要声明：以下场地、活动、变更、资源与设备全部为编造的教学演练数据，
 * 不来自示例大学任何内部系统，也不对应任何真实场地的开放安排。
 * 请勿据此推断真实校园数据；如需扩充，保持 ID 命名规范与引用完整性即可。
 *
 * 数据约定：
 * - `activities` 表示变更前的活动当前状态；
 * - `changes[].payload` 表示待处理的变更请求（结构化目标值），二者互不覆盖。
 */
export const campusDataset: CampusDataset = {
  equipment: [
    { id: 'eq-001', name: '投影仪' },
    { id: 'eq-002', name: '投影幕布' },
    { id: 'eq-003', name: '扩声音响' },
    { id: 'eq-004', name: '无线话筒' },
    { id: 'eq-005', name: '移动白板' },
    { id: 'eq-006', name: '舞台灯光组' }
  ],

  venues: [
    {
      id: 'venue-001',
      name: '模拟·教学楼 A 阶梯教室',
      capacity: 120,
      openFrom: '08:00',
      openTo: '22:00',
      equipmentIds: ['eq-001', 'eq-002', 'eq-004'],
      distanceToCenterMeters: 120
    },
    {
      id: 'venue-002',
      name: '模拟·教学楼 B 多功能报告厅',
      capacity: 300,
      openFrom: '08:00',
      openTo: '22:00',
      equipmentIds: ['eq-001', 'eq-002', 'eq-003', 'eq-004', 'eq-006'],
      distanceToCenterMeters: 260
    },
    {
      id: 'venue-003',
      name: '模拟·学生活动中心排练厅',
      capacity: 80,
      openFrom: '09:00',
      openTo: '21:00',
      equipmentIds: ['eq-003', 'eq-005'],
      distanceToCenterMeters: 340
    },
    {
      id: 'venue-004',
      name: '模拟·图书馆报告厅',
      capacity: 200,
      openFrom: '09:00',
      openTo: '20:30',
      equipmentIds: ['eq-001', 'eq-002', 'eq-004'],
      distanceToCenterMeters: 410
    },
    {
      id: 'venue-005',
      name: '模拟·风雨操场',
      capacity: 500,
      openFrom: '07:00',
      openTo: '22:00',
      equipmentIds: ['eq-003', 'eq-004', 'eq-006'],
      distanceToCenterMeters: 520
    },
    {
      id: 'venue-006',
      name: '模拟·露天广场',
      capacity: 1000,
      openFrom: '06:00',
      openTo: '22:00',
      equipmentIds: [],
      distanceToCenterMeters: 600
    }
  ],

  resources: [
    { id: 'res-001', name: '现场工作人员（人）', total: 60, available: 42 },
    { id: 'res-002', name: '折叠桌椅（套）', total: 200, available: 150 },
    { id: 'res-003', name: '引导标识牌（块）', total: 40, available: 28 },
    { id: 'res-004', name: '饮用水（箱）', total: 80, available: 65 }
  ],

  activities: [
    {
      id: 'act-001',
      name: '模拟·秋季校园招聘会',
      expectedAttendance: 220,
      currentVenueId: 'venue-002',
      currentSlot: { start: '2026-10-20T09:00', end: '2026-10-20T12:00' },
      requiredEquipmentIds: ['eq-001', 'eq-002', 'eq-003'],
      resourceNeeds: { 'res-001': 12, 'res-002': 30, 'res-003': 8, 'res-004': 20 }
    },
    {
      id: 'act-002',
      name: '模拟·新生文艺汇演',
      expectedAttendance: 260,
      currentVenueId: 'venue-005',
      currentSlot: { start: '2026-10-21T18:30', end: '2026-10-21T21:30' },
      requiredEquipmentIds: ['eq-003', 'eq-004', 'eq-006'],
      resourceNeeds: { 'res-001': 18, 'res-002': 60, 'res-004': 30 }
    },
    {
      id: 'act-003',
      name: '模拟·社团招新宣讲会',
      expectedAttendance: 90,
      currentVenueId: 'venue-001',
      currentSlot: { start: '2026-10-22T14:00', end: '2026-10-22T16:00' },
      requiredEquipmentIds: ['eq-001', 'eq-002'],
      resourceNeeds: { 'res-001': 6, 'res-002': 20, 'res-003': 6 }
    },
    {
      id: 'act-004',
      name: '模拟·教育技术学术讲座',
      expectedAttendance: 60,
      currentVenueId: 'venue-003',
      currentSlot: { start: '2026-10-23T15:00', end: '2026-10-23T17:00' },
      requiredEquipmentIds: ['eq-003', 'eq-005'],
      resourceNeeds: { 'res-001': 4, 'res-004': 10 }
    },
    {
      id: 'act-005',
      name: '模拟·志愿服务总结大会',
      expectedAttendance: 180,
      currentVenueId: 'venue-004',
      currentSlot: { start: '2026-10-24T10:00', end: '2026-10-24T11:30' },
      requiredEquipmentIds: ['eq-001', 'eq-002', 'eq-004'],
      resourceNeeds: { 'res-001': 8, 'res-002': 24, 'res-003': 4 }
    }
  ],

  changes: [
    {
      id: 'chg-001',
      activityId: 'act-001',
      kind: 'time',
      description: '招聘会因用人单位行程调整，开始时间由 09:00 提前至 08:30，结束时间 12:00 保持不变。',
      requestedAt: '2026-10-16T09:20',
      requestedBy: 'role-organizer-01',
      payload: {
        before: { start: '2026-10-20T09:00', end: '2026-10-20T12:00' },
        after: { start: '2026-10-20T08:30', end: '2026-10-20T12:00' }
      }
    },
    {
      id: 'chg-002',
      activityId: 'act-003',
      kind: 'venue',
      description: '教学楼 A 阶梯教室临时维护，社团招新宣讲会需改至容量不少于 90 人且具备投影设备的场地；初步考虑图书馆报告厅，最终由调度确认。',
      requestedAt: '2026-10-16T10:05',
      requestedBy: 'role-venue-admin-01',
      payload: {
        before: 'venue-001',
        targetVenueId: 'venue-004',
        minCapacity: 90,
        requiredEquipmentIds: ['eq-001', 'eq-002']
      }
    },
    {
      id: 'chg-003',
      activityId: 'act-002',
      kind: 'scale',
      description: '新生文艺汇演预计参与人数由 260 人上调至 560 人，超出风雨操场 500 人容量，需重新评估场地与工作人员配置。',
      requestedAt: '2026-10-16T11:40',
      requestedBy: 'role-organizer-02',
      payload: {
        before: 260,
        after: 560
      }
    },
    {
      id: 'chg-004',
      activityId: 'act-004',
      kind: 'resource',
      description: '讲座新增移动白板 2 块（由 1 块增至 3 块）、无线话筒 1 支（此前无此需求），现场工作人员需求由 4 人增至 6 人。',
      requestedAt: '2026-10-16T14:15',
      requestedBy: 'role-student-union-01',
      payload: {
        equipmentAdjustments: [
          { id: 'eq-005', before: 1, after: 3 },
          { id: 'eq-004', after: 1 }
        ],
        resourceAdjustments: [{ id: 'res-001', before: 4, after: 6 }]
      }
    }
  ],

  /**
   * 显式模拟可选时段目录（F3-A 方案 B，仅追加，不改动上述五个集合）。
   *
   * 重要声明：以下条目全部为编造的教学演练数据，**不代表真实空闲状态、
   * 不代表真实预约记录、也不代表已获场地批准**；是否可行一律由引擎硬约束
   * 逐候选评估决定。目录仅在枚举开关（enumerateSlots）开启时被读取。
   *
   * 数据自洽性（由 src/data/campus.test.ts 完整性断言保证）：
   * - 条目 activityId 均指向已定义活动，venueId（若有）均指向已定义场地；
   * - 起止时间均为合法 YYYY-MM-DDTHH:mm、start 早于 end、不跨日；
   * - 每条时长与其活动 currentSlot 时长一致（不一致条目不会进入候选集）；
   * - activityId + venueId + slot 组合键唯一（重复条目由 candidateKey 去重）。
   *
   * 主要演示场景：act-003（模拟·社团招新宣讲会）多场地 × 多时段比较，
   * 时段缺省 venueId（与全部候选场地组合）。
   */
  slotCatalog: [
    // act-003 当日 2 小时时长（与 currentSlot 14:00–16:00 一致），起点 14:00–19:00。
    { activityId: 'act-003', slot: { start: '2026-10-22T14:00', end: '2026-10-22T16:00' } },
    { activityId: 'act-003', slot: { start: '2026-10-22T15:00', end: '2026-10-22T17:00' } },
    { activityId: 'act-003', slot: { start: '2026-10-22T16:00', end: '2026-10-22T18:00' } },
    { activityId: 'act-003', slot: { start: '2026-10-22T17:00', end: '2026-10-22T19:00' } },
    { activityId: 'act-003', slot: { start: '2026-10-22T18:00', end: '2026-10-22T20:00' } },
    // 19:00–21:00：对 venue-004（开放至 20:30）超出开放时段，对 venue-002（开放至 22:00）可行，
    // 用于演示"场地关闭/开放时段"硬约束逐候选排除。
    { activityId: 'act-003', slot: { start: '2026-10-22T19:00', end: '2026-10-22T21:00' } },
    // act-001 当日 3 小时时长（与 currentSlot 09:00–12:00 一致），指定 venueId 演示场地限定组合。
    {
      activityId: 'act-001',
      venueId: 'venue-004',
      slot: { start: '2026-10-20T14:00', end: '2026-10-20T17:00' }
    },
    {
      activityId: 'act-001',
      venueId: 'venue-004',
      slot: { start: '2026-10-20T15:00', end: '2026-10-20T18:00' }
    }
  ]
};
