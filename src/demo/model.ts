export type Role = "student" | "teacher" | "admin";
export type Status =
  "PENDING" | "APPROVED" | "RETURNED" | "REJECTED" | "WITHDRAWN";
export type Venue = {
  id: string;
  name: string;
  building: string;
  kind: string;
  capacity: number;
  equipment: string[];
  image: number;
  enabled: boolean;
  x: number;
  y: number;
};
export type Booking = {
  id: string;
  title: string;
  description: string;
  venueId: string;
  date: string;
  start: string;
  end: string;
  people: number;
  equipment: string[];
  status: Status;
  owner: string;
  revision: number;
  parentId?: string;
  history: { text: string; at: string }[];
};
export type Notice = { id: string; title: string; body: string; read: boolean };
export type Plan = {
  id: string;
  name: string;
  venueId: string;
  date: string;
  start: string;
  end: string;
  people: number;
  score: number;
  equipment: string[];
};
export type DemoState = {
  version: 1;
  venues: Venue[];
  bookings: Booking[];
  notices: Notice[];
  plans: Plan[];
};
export const statusNames: Record<Status, string> = {
  PENDING: "待审核",
  APPROVED: "已批准",
  RETURNED: "待修改",
  REJECTED: "已驳回",
  WITHDRAWN: "已撤回",
};
export const roles: Record<Role, string> = {
  student: "学生 / 活动组织者",
  teacher: "教师 / 审核人",
  admin: "资源管理员",
};
export const DAY = "2026-10-23";
export const now = () => new Date().toLocaleString("zh-CN", { hour12: false });
export const uid = () => crypto.randomUUID();
export const initialState = (): DemoState => ({
  version: 1,
  venues: [
    {
      id: "v1",
      name: "图书馆中心 · 学术报告厅",
      building: "图书馆中心",
      kind: "报告厅",
      capacity: 200,
      equipment: ["投影设备", "无线话筒", "音响"],
      image: 4,
      enabled: true,
      x: 460,
      y: 230,
    },
    {
      id: "v2",
      name: "教学楼 A · 阶梯教室",
      building: "教学楼 A",
      kind: "教室",
      capacity: 120,
      equipment: ["投影设备", "无线话筒"],
      image: 7,
      enabled: true,
      x: 270,
      y: 240,
    },
    {
      id: "v3",
      name: "艺术活动中心 · 多功能厅（演示）",
      building: "艺术活动中心",
      kind: "活动空间",
      capacity: 300,
      equipment: ["投影设备", "无线话筒", "音响", "舞台灯光"],
      image: 2,
      enabled: true,
      x: 540,
      y: 355,
    },
    {
      id: "v4",
      name: "综合体育馆 · 综合活动场",
      building: "综合体育馆",
      kind: "体育场地",
      capacity: 600,
      equipment: ["无线话筒", "音响"],
      image: 1,
      enabled: true,
      x: 200,
      y: 365,
    },
    {
      id: "v5",
      name: "中心广场 · 户外活动区",
      building: "中心广场",
      kind: "户外空间",
      capacity: 1000,
      equipment: ["音响"],
      image: 3,
      enabled: true,
      x: 390,
      y: 430,
    },
    {
      id: "v6",
      name: "研学中心 · 研讨空间",
      building: "研学中心",
      kind: "教室",
      capacity: 60,
      equipment: ["投影设备", "移动白板"],
      image: 8,
      enabled: false,
      x: 610,
      y: 180,
    },
  ],
  bookings: [
    {
      id: "event-ai",
      title: "AI × 青年：让灵感在校园发生",
      description:
        "一次关于人工智能、创意与未来的开放交流。带上你的想法，与不同专业的同学一起探索 AI 的无限可能。",
      venueId: "v1",
      date: DAY,
      start: "14:00",
      end: "16:00",
      people: 160,
      equipment: ["投影设备", "无线话筒"],
      status: "APPROVED",
      owner: "学生创新协会",
      revision: 1,
      history: [
        { text: "活动申请已提交", at: "2026/10/22 09:30" },
        { text: "审核老师批准申请，活动已发布", at: "2026/10/22 10:15" },
      ],
    },
    {
      id: "event-music",
      title: "草坪音乐会 · 秋日来信",
      description:
        "在秋天的校园里，用音乐收集一份温暖。欢迎同学们参与这场轻松的校园音乐交流。",
      venueId: "v5",
      date: DAY,
      start: "18:00",
      end: "20:00",
      people: 400,
      equipment: ["音响"],
      status: "APPROVED",
      owner: "大学生艺术团",
      revision: 1,
      history: [{ text: "审核老师批准申请，活动已发布", at: "2026/10/22 11:20" }],
    },
    {
      id: "book-design",
      title: "青年创想家 · 校园设计分享会",
      description: "面向全校同学的设计经验交流，分享从创意到作品的实践过程。",
      venueId: "v2",
      date: DAY,
      start: "14:00",
      end: "16:00",
      people: 100,
      equipment: ["投影设备"],
      status: "PENDING",
      owner: "学生 A",
      revision: 1,
      history: [{ text: "学生 A提交活动申请", at: "2026/10/23 09:20" }],
    },
    {
      id: "book-welcome",
      title: "迎新晚会 · 第一次联排",
      description: "迎新晚会节目联排与舞台设备调试。",
      venueId: "v3",
      date: "2026-10-24",
      start: "18:00",
      end: "20:00",
      people: 260,
      equipment: ["音响", "舞台灯光"],
      status: "RETURNED",
      owner: "学生 A",
      revision: 1,
      history: [
        { text: "申请已提交", at: "2026/10/22 14:00" },
        {
          text: "审核老师退回：请补充现场人员安排及应急方案。",
          at: "2026/10/22 16:30",
        },
      ],
    },
  ],
  notices: [
    {
      id: "n1",
      title: "有一份申请需要补充材料",
      body: "迎新晚会联排已退回，请补充现场人员安排及应急方案后重新提交。",
      read: false,
    },
    {
      id: "n2",
      title: "欢迎来到 CampusTwin",
      body: "这是可交互演示环境。场地容量、设备和日程均为模拟数据，操作保存在当前浏览器。",
      read: false,
    },
  ],
  plans: [],
});
export const STORAGE = "campustwin-public-demo-v1";
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validDemoState(value: unknown): value is DemoState {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.venues) || value.venues.length !== 6 || !Array.isArray(value.bookings) || !Array.isArray(value.notices) || !Array.isArray(value.plans) || value.plans.length > 20) return false;
  const ids = new Set(value.venues.map(v => record(v) ? v.id : undefined));
  if (['v1','v2','v3','v4','v5','v6'].some(id => !ids.has(id))) return false;
  const times = (b: Record<string, unknown>) => typeof b.date === 'string' && validDate(b.date) && typeof b.start === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(b.start) && typeof b.end === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(b.end) && b.start < b.end;
  return value.venues.every(v => record(v) && typeof v.name === 'string' && typeof v.building === 'string' && typeof v.kind === 'string' && typeof v.enabled === 'boolean' && Number.isInteger(v.capacity) && Number(v.capacity) > 0 && strings(v.equipment) && Number.isInteger(v.image) && Number(v.image) >= 1 && Number(v.image) <= 8 && Number.isFinite(v.x) && Number.isFinite(v.y)) &&
    value.bookings.every(b => record(b) && typeof b.id === 'string' && typeof b.title === 'string' && typeof b.description === 'string' && ids.has(b.venueId) && times(b) && Number.isInteger(b.people) && Number(b.people) > 0 && strings(b.equipment) && typeof b.status === 'string' && Object.keys(statusNames).includes(b.status) && typeof b.owner === 'string' && Number.isInteger(b.revision) && Array.isArray(b.history) && b.history.every(h => record(h) && typeof h.text === 'string' && typeof h.at === 'string')) &&
    value.notices.every(n => record(n) && typeof n.id === 'string' && typeof n.title === 'string' && typeof n.body === 'string' && typeof n.read === 'boolean') &&
    value.plans.every(p => record(p) && typeof p.id === 'string' && typeof p.name === 'string' && ids.has(p.venueId) && times(p) && strings(p.equipment) && Number.isFinite(p.score) && Number.isInteger(p.people) && Number(p.people) > 0);
}
export function loadState(): DemoState {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE) || "null");
    if (validDemoState(s)) {
      // Upgrade the untouched seed label while preserving user-edited venues.
      s.venues = s.venues.map(v => v.id === 'v3' && v.name === '大学生活动中心 · 多功能厅' && v.building === '大学生活动中心' ? {...v,name:'艺术活动中心 · 多功能厅（演示）',building:'艺术活动中心'} : v);
      return s;
    }
  } catch {
    /* damaged or unavailable storage falls back to demo */
  }
  return initialState();
}
export function checks(
  venues: Venue[],
  bookings: Booking[],
  input: Pick<
    Booking,
    "venueId" | "date" | "start" | "end" | "people" | "equipment"
  >,
  ignoreId?: string,
) {
  const v = venues.find((v) => v.id === input.venueId);
  const validTime =
    /^([01]\d|2[0-3]):[0-5]\d$/.test(input.start) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(input.end) &&
    input.start >= "08:00" &&
    input.end <= "22:00" &&
    input.start < input.end;
  const conflicts = bookings.filter(
    (b) =>
      b.status === "APPROVED" &&
      b.id !== ignoreId &&
      b.venueId === input.venueId &&
      b.date === input.date &&
      b.start < input.end &&
      input.start < b.end,
  );
  return [
    {
      label: "开放状态",
      pass: !!v?.enabled,
      detail: v?.enabled ? "场地正常开放" : "场地暂停开放",
    },
    {
      label: "人数容量",
      pass:
        Number.isInteger(input.people) &&
        input.people > 0 &&
        input.people <= (v?.capacity || 0),
      detail: `需求 ${input.people} 人 / 容量 ${v?.capacity || 0} 人`,
    },
    {
      label: "时间范围",
      pass: validTime && validDate(input.date),
      detail: "开放时间 08:00–22:00，限同日预约",
    },
    {
      label: "设备需求",
      pass: input.equipment.every((e) => v?.equipment.includes(e)),
      detail:
        input.equipment.filter((e) => !v?.equipment.includes(e)).join("、") ||
        "所需设备均已具备",
    },
    {
      label: "时段冲突",
      pass: conflicts.length === 0,
      detail: conflicts.length
        ? `与「${conflicts[0].title}」重叠`
        : "与已批准活动无重叠",
    },
  ];
}
export function candidates(
  state: DemoState,
  input: Pick<Booking, "date" | "start" | "end" | "people" | "equipment">,
  ignoreId?: string,
) {
  return state.venues
    .map((v) => {
      const result = checks(
        state.venues,
        state.bookings,
        { ...input, venueId: v.id },
        ignoreId,
      );
      return {
        venue: v,
        checks: result,
        feasible: result.every((c) => c.pass),
        score: Math.max(
          40,
          Math.round(100 - ((v.capacity - input.people) / v.capacity) * 20),
        ),
      };
    })
    .sort(
      (a, b) =>
        Number(b.feasible) - Number(a.feasible) ||
        b.score - a.score ||
        a.venue.id.localeCompare(b.venue.id),
    );
}
export function download(name: string, content: string, type = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
