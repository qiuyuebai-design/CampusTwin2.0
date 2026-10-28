import { useState, useEffect, useRef, lazy, Suspense } from "react";
import Icon from "./Icon";
import CampusMap from "./CampusMap";
import {
  Button,
  Badge,
  Modal,
  Empty,
  CheckList,
  QR,
  BookingForm,
  equipment,
} from "./ui";
import {
  loadState,
  validDemoState,
  initialState,
  STORAGE,
  DAY,
  now,
  uid,
  statusNames,
  roles,
  checks,
  candidates,
  download,
} from "./model";
import type { Role, DemoState, Venue, Booking, Status } from "./model";
const SchedulingPage = lazy(() => import("../pages/SchedulingPage"));
const ExperienceStudio = lazy(() => import("./ExperienceStudio"));
type Page =
  | "studio"
  | "home"
  | "venues"
  | "bookings"
  | "approvals"
  | "simulator"
  | "resources"
  | "events"
  | "notices"
  | "settings"
  | "legacy";
const nav: { id: Page; label: string; icon: string; group?: string }[] = [
  { id: "home", label: "校园总览", icon: "grid", group: "工作空间" },
  { id: "studio", label: "3D 演示空间", icon: "layers" },
  { id: "venues", label: "场地探索", icon: "building" },
  { id: "bookings", label: "我的申请", icon: "calendar" },
  { id: "simulator", label: "智能预演", icon: "spark" },
  { id: "events", label: "校园活动", icon: "layers" },
  { id: "approvals", label: "审批中心", icon: "shield", group: "协同管理" },
  { id: "resources", label: "资源驾驶舱", icon: "layers" },
  { id: "notices", label: "消息通知", icon: "bell" },
];
const titles: Record<Page, [string, string]> = {
  studio: ["一座可以预演的校园", "探索空间，理解变化，让校园里的好想法从容发生。"],
  home: ["校园总览", "让每一份校园灵感，都有发生的空间。"],
  venues: [
    "发现校园里的好空间",
    "从课堂到舞台，为你的下一场活动找到合适的地方。",
  ],
  bookings: ["我的活动申请", "从一个想法，到一次精彩发生。"],
  approvals: ["审批中心", "把每一次决定，都建立在清晰的信息之上。"],
  simulator: ["先预演，再决定", "让变化有据可循，为活动找到更好的可能。"],
  resources: ["校园资源驾驶舱", "在时间与空间中，看见校园的每一种可能。"],
  events: ["正在校园发生", "相遇、探索、创造。找到属于你的校园时刻。"],
  notices: ["消息与动态", "你的申请进度与校园协作动态。"],
  settings: ["演示设置", "管理当前浏览器中的演示数据。"],
  legacy: ["经典调度工作台", "原有确定性调度引擎、方案库与报告工具。"],
};
const guideSteps = [
  {
    title: "01 / 找到一处好空间",
    body: "进入场地探索，查看容量、设备与可申请时段。点击场地卡片可以查看详情并发起申请。",
    p: "venues" as Page,
  },
  {
    title: "02 / 提交你的活动",
    body: "点击“创建申请”，完成活动详情、资源需求与冲突预检。提交后在“我的申请”跟踪进度。",
    p: "bookings" as Page,
  },
  {
    title: "03 / 教师审批",
    body: "本步骤会切换教师演示角色。选择待审申请，查看约束依据，再批准、退回或驳回。",
    p: "approvals" as Page,
  },
  {
    title: "04 / 预演与活动发布",
    body: "比较场地替代方案，在校园活动中查看已发布活动；同一链接会显示审批通过后的最新版本。",
    p: "simulator" as Page,
  },
];
export default function DemoApp() {
  const [state, setState] = useState(loadState);
  const [role, setRole] = useState<Role>("student");
  const [pitchRequest, setPitchRequest] = useState(0);
  const [page, setPage] = useState<Page>(() =>
    location.hash.startsWith("#events/") ? "events" : "home",
  );
  const [eventId, setEventId] = useState<string | null>(() =>
    location.hash.startsWith("#events/")
      ? decodeURIComponent(location.hash.slice(8))
      : null,
  );
  const [mobile, setMobile] = useState(false);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [guide, setGuide] = useState<number | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [booking, setBooking] = useState<{
    venue: Venue;
    existing?: Booking;
  } | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewAction, setReviewAction] = useState<Status | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    body: string;
    action: () => void;
  } | null>(null);
  const [error, setError] = useState("");
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null);
  const [date, setDate] = useState(DAY);
  const [start, setStart] = useState("14:00");
  const [end, setEnd] = useState("16:00");
  const [capacity, setCapacity] = useState(0);
  const [kind, setKind] = useState("全部场地");
  const [eq, setEq] = useState("全部设备");
  const [layout, setLayout] = useState("cards");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [selected, setSelected] = useState("v1");
  const [hour, setHour] = useState(14);
  const [adminView, setAdminView] = useState("map");
  const [simPeople, setSimPeople] = useState(180);
  const [simNeed, setSimNeed] = useState<string[]>(["投影设备", "无线话筒"]);
  const [simDate, setSimDate] = useState(DAY);
  const [simStart, setSimStart] = useState("14:00");
  const [simEnd, setSimEnd] = useState("16:00");
  const [simRun, setSimRun] = useState(false);
  const [simSelected, setSimSelected] = useState("");
  const [simTab, setSimTab] = useState("analysis");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const say = (s: string) => {
    setToast(s);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4000);
  };
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(state));
    } catch {
      setToast("浏览器存储不可用，当前更改将在关闭页面后丢失。");
    }
  }, [state]);
  useEffect(() => {
    const fn = () => {
      if (location.hash.startsWith("#events/")) {
        setPage("events");
        setEventId(decodeURIComponent(location.hash.slice(8)));
      } else {
        setEventId(null);
      }
    };
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  }, []);
  const go = (p: Page) => {
    if (p !== 'studio') setPitchRequest(0);
    setPage(p);
    setMobile(false);
    setSearch("");
    setEventId(null);
    setStatusFilter("全部");
    if (location.hash)
      history.replaceState(null, "", location.pathname + location.search);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const venueOf = (id: string) => state.venues.find((v) => v.id === id)!;
  const pending = state.bookings.filter((b) => b.status === "PENDING");
  const published = state.bookings.filter((b) => b.status === "APPROVED");
  const unread = state.notices.filter((n) => !n.read).length;
  const notification = (
    s: DemoState,
    title: string,
    body: string,
  ): DemoState => ({
    ...s,
    notices: [{ id: uid(), title, body, read: false }, ...s.notices],
  });
  const saveBooking = (b: Booking) => {
    setState((s) =>
      notification(
        { ...s, bookings: [b, ...s.bookings] },
        "新的申请等待审核",
        `「${b.title}」已提交，请切换教师角色进行审核。`,
      ),
    );
    setBooking(null);
    go("bookings");
    say("申请已提交，请切换教师角色演示审批。");
  };
  const withdraw = (b: Booking) =>
    setConfirm({
      title: "撤回这份申请？",
      body: "撤回后教师将无法批准该申请，操作记录会保留。",
      action: () => {
        setState((s) => ({
          ...s,
          bookings: s.bookings.map((x) =>
            x.id === b.id && x.status === "PENDING"
              ? {
                  ...x,
                  status: "WITHDRAWN",
                  history: [
                    ...x.history,
                    { text: "学生 A撤回申请", at: now() },
                  ],
                }
              : x,
          ),
        }));
        setReview(null);
        say("申请已撤回");
      },
    });
  const processReview = () => {
    const b = state.bookings.find((x) => x.id === review);
    if (!b || b.status !== "PENDING" || !reviewAction) return;
    if (role === "student") {
      setError("请先切换为教师或管理员角色。");
      return;
    }
    if (reviewAction !== "APPROVED" && !reviewNote.trim()) {
      setError("请填写退回或驳回的原因。");
      return;
    }
    if (
      reviewAction === "APPROVED" &&
      !checks(state.venues, state.bookings, b, b.parentId).every((c) => c.pass)
    ) {
      setError("当前申请存在冲突或资源不满足，无法批准。");
      return;
    }
    const action = reviewAction;
    setState((s) => {
      const fresh = s.bookings.find((x) => x.id === b.id);
      if (!fresh || fresh.status !== "PENDING") return s;
      if (
        action === "APPROVED" &&
        !checks(s.venues, s.bookings, fresh, fresh.parentId).every(
          (c) => c.pass,
        )
      )
        return s;
      let next = s.bookings.map((x) =>
        x.id === b.id
          ? {
              ...x,
              status: action,
              history: [
                ...x.history,
                {
                  text: `审核老师${action === 'RETURNED' ? '退回修改' : statusNames[action]}${reviewNote ? "：" + reviewNote : ""}`,
                  at: now(),
                },
              ],
            }
          : x,
      );
      if (action === "APPROVED" && b.parentId) {
        const parent = s.bookings.find((x) => x.id === b.parentId);
        if (parent?.status === "APPROVED") {
          next = next
            .filter((x) => x.id !== b.id)
            .map((x) =>
              x.id === parent.id
                ? {
                    ...b,
                    id: parent.id,
                    parentId: undefined,
                    status: "APPROVED" as Status,
                    history: [
                      ...b.history,
                      { text: "变更审批通过，公开信息已更新", at: now() },
                    ],
                  }
                : x,
            );
        } else
          next = next.map((x) =>
            x.id === b.parentId ? { ...x, status: "WITHDRAWN" as Status } : x,
          );
      }
      return notification(
        { ...s, bookings: next },
        `申请${statusNames[action]}`,
        `「${b.title}」${statusNames[action]}${reviewNote ? "：" + reviewNote : ""}`,
      );
    });
    setReview(null);
    setReviewAction(null);
    setReviewNote("");
    say(
      action === "APPROVED"
        ? "审批通过，资源占用和活动页已更新。"
        : "审核结果已保存。",
    );
  };
  const startBooking = (v: Venue, existing?: Booking) => {
    if (role !== "student") {
      say("已切换为学生演示角色");
      setRole("student");
    }
    const fromExplorer = page === 'venues' || detail !== null;
    const draft: Booking = {id:'',title:'',description:'',venueId:v.id,date:fromExplorer?date:DAY,start:fromExplorer?start:'10:00',end:fromExplorer?end:'12:00',people:capacity||Math.min(100,v.capacity),equipment:fromExplorer&&eq!=='全部设备'?[eq]:v.equipment.includes('投影设备')?['投影设备']:[],status:'RETURNED',owner:'学生 A',revision:0,history:[]};
    setDetail(null);
    setBooking({ venue: v, existing:existing || draft });
  };
  const openEvent = (b: Booking) => {
    setEventId(b.id);
    setPage("events");
    location.hash = "events/" + b.id;
  };
  const filtered = state.venues.filter(
    (v) =>
      (kind === "全部场地" || v.kind === kind) &&
      v.capacity >= capacity &&
      (eq === "全部设备" || v.equipment.includes(eq)) &&
      v.name.includes(search),
  );
  const simInput = {
    date: simDate,
    start: simStart,
    end: simEnd,
    people: simPeople,
    equipment: simNeed,
  };
  const simCandidates = candidates(state, simInput);
  const chosen = simCandidates.find((c) => c.venue.id === simSelected);
  const selectedVenue = venueOf(selected);
  const reviewBooking = state.bookings.find((b) => b.id === review);
  const detailVenue = state.venues.find((v) => v.id === detail);
  const event = published.find((b) => b.id === eventId);
  const updateSim = () => {
    setSimRun(false);
    setSimSelected("");
  };
  const bookingsTable = (list: Booking[], approval = false) => (
    <div className="booking-list">
      {list.length ? (
        list.map((b) => (
          <div className="booking-row" key={b.id}>
            <div className="date-tile">
              <span>{b.date.slice(5, 7)}月</span>
              <strong>{b.date.slice(8)}</strong>
            </div>
            <div className="booking-main">
              <div className="inline">
                <h3>{b.title}</h3>
                <Badge status={b.status} />
              </div>
              <p>{venueOf(b.venueId).name}</p>
              <span>
                {b.start}–{b.end} <i>·</i> {b.people} 人 <i>·</i> {b.owner}
                {b.parentId ? " · 修订申请" : ""}
              </span>
            </div>
            <div className="row-actions">
              <Button
                onClick={() => {
                  setReview(b.id);
                  setReviewAction(null);
                  setReviewNote("");
                  setError("");
                }}
              >
                {approval && b.status === "PENDING" ? "审核申请" : "查看详情"}
                <Icon name="chevron" size={14} />
              </Button>
              {!approval && b.status === "PENDING" && (
                <button className="text-btn muted" onClick={() => withdraw(b)}>
                  撤回
                </button>
              )}
              {!approval && ["RETURNED", "APPROVED"].includes(b.status) && (
                <button
                  className="text-btn"
                  onClick={() => startBooking(venueOf(b.venueId), b)}
                >
                  {b.status === "RETURNED" ? "修改重提" : "申请变更"}
                </button>
              )}
            </div>
          </div>
        ))
      ) : (
        <Empty text="这里暂时没有申请" />
      )}
    </div>
  );
  return (
    <div className="demo-app">
      <aside className={"sidebar " + (mobile ? "open" : "")}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("home");
          }}
        >
          <span className="brand-mark">
            <Icon name="layers" size={25} />
          </span>
          <div>
            CampusTwin<span>校园时空 · 智能协同</span>
          </div>
          <sup>2.0</sup>
        </a>
        <div className="campus-select">
          <span className="school-symbol">校</span>
          <div>
            示例大学<small>示例校区</small>
          </div>
          <Icon name="down" size={16} />
        </div>
        <nav>
          {nav.map((n) => (
            <div key={n.id}>
              {n.group && <p className="nav-group">{n.group}</p>}
              <button
                className={"nav-item " + (page === n.id ? "active" : "")}
                onClick={() => go(n.id)}
              >
                <Icon name={n.icon} size={19} />
                <span>{n.label}</span>
                {n.id === "approvals" && pending.length > 0 && (
                  <b>{pending.length}</b>
                )}
                {n.id === "notices" && unread > 0 && (
                  <i className="unread-dot" />
                )}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-card">
            <span>
              <i className="live-dot" /> 演示空间
            </span>
            <p>
              让校园的下一种可能
              <br />
              先在这里发生。
            </p>
            <button
              onClick={() => {
                setGuide(0);
                go("venues");
              }}
            >
              开始演示导览 <Icon name="arrow" size={15} />
            </button>
          </div>
          <button className="nav-item" onClick={() => go("settings")}>
            <Icon name="settings" size={19} />
            设置与帮助
          </button>
          <div className="sidebar-user">
            <span className="avatar">
              {role === "student" ? "学" : role === "teacher" ? "审" : "管"}
            </span>
            <div>
              {role === "student"
                ? "学生 A"
                : role === "teacher"
                  ? "审核老师"
                  : "管理员"}
              <small>
                {role === "student" ? "学生创新协会" : "校园协作团队"}
              </small>
            </div>
            <span className="online" />
          </div>
        </div>
      </aside>
      {mobile && (
        <div className="mobile-scrim" onClick={() => setMobile(false)} />
      )}
      <div className="app-main">
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            onClick={() => setMobile(!mobile)}
            aria-label="展开导航"
          >
            <Icon name="menu" />
          </button>
          <div className="breadcrumb">
            工作空间 <span>/</span>{" "}
            <strong>
              {nav.find((n) => n.id === page)?.label || titles[page][0]}
            </strong>
          </div>
          <div className="top-actions">
            <div className="global-search">
              <Icon name="search" size={17} />
              <input
                aria-label="搜索场地或活动"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索场地、活动…"
              />
              <kbd>⌕</kbd>
            </div>
            <button
              className="icon-btn notify-btn"
              onClick={() => go("notices")}
              aria-label="消息通知"
            >
              <Icon name="bell" />
              {unread > 0 && <i />}
            </button>
            <span className="top-separator" />
            <label className="role-switch">
              <Icon name="users" size={16} />
              <select
                aria-label="切换演示角色"
                value={role}
                onChange={(e) => {
                  setRole(e.target.value as Role);
                  say("已切换" + roles[e.target.value as Role] + "演示角色");
                }}
              >
                {Object.entries(roles).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>
        <main className={"content page-" + page}>
          {search && page !== "venues" && page !== "events" && (
            <div className="search-results">
              <h3>搜索结果</h3>
              {state.venues
                .filter((v) => v.name.includes(search))
                .map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      setDetail(v.id);
                      setSearch("");
                    }}
                  >
                    <Icon name="building" />
                    {v.name}
                    <Icon name="arrow" size={15} />
                  </button>
                ))}
              {published
                .filter((b) => b.title.includes(search))
                .map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      openEvent(b);
                      setSearch("");
                    }}
                  >
                    <Icon name="calendar" />
                    {b.title}
                    <Icon name="arrow" size={15} />
                  </button>
                ))}
              {!state.venues.some((v) => v.name.includes(search)) &&
                !published.some((b) => b.title.includes(search)) && (
                  <p>没有匹配结果</p>
                )}
            </div>
          )}
          <div className={"page-heading " + (page === "studio" ? "studio-page-heading" : "")}>
            <div>
              <div className="eyebrow">
                {page === "home"
                  ? "FRIDAY, OCTOBER 23 · 2026"
                  : "CAMPUSTWIN / " + page.toUpperCase()}
              </div>
              <h1>
                {page === "home"
                  ? "你好，" +
                    (role === "student"
                      ? "学生 A"
                      : role === "teacher"
                        ? "审核老师"
                        : "管理员") +
                    "。"
                  : titles[page][0]}
              </h1>
              <p>{titles[page][1]}</p>
            </div>
            <div className="heading-actions">
              {(page === 'home' || page === 'studio') && <Button icon="play" onClick={() => {go('studio'); setPitchRequest(n => n + 1);}}>一键答辩演示</Button>}
              {page === "home" && (
                <span className="weather">
                  <Icon name="sun" size={19} /> 秋日 · 示例校园
                </span>
              )}
              {["home", "venues", "bookings"].includes(page) && (
                <Button
                  kind="primary"
                  icon="plus"
                  onClick={() => startBooking(state.venues[1])}
                >
                  创建申请
                </Button>
              )}
              {page === "simulator" && (
                <Button icon="book" onClick={() => go("legacy")}>
                  经典工作台
                </Button>
              )}
            </div>
          </div>
          {page === "studio" && <Suspense fallback={<div className="empty-state">正在载入三维校园…</div>}><ExperienceStudio state={state} startPitch={pitchRequest} onApply={(scenario,id) => startBooking(venueOf(id), {id:'',title:`${scenario.people} 人校园创意分享会`,description:'根据三维校园预演与约束检查生成的活动方案。',...scenario,venueId:id,status:'RETURNED',owner:'学生 A',revision:0,history:[]})} onSave={plan => {setState(s => ({...s,plans:[{...plan,id:uid()},...s.plans].slice(0,20)}));say('方案已保存，可在智能预演方案库查看。');}}/></Suspense>}
          {page === "home" && (
            <>
              <section className="hero">
                <img
                  src="/images/campus-4.svg"
                  alt="示例大学校园建筑与花卉"
                />
                <div className="hero-shade" />
                <div className="hero-content">
                  <span className="hero-tag">
                    <i /> CONNECT YOUR CAMPUS
                  </span>
                  <h2>
                    好想法，
                    <br />
                    值得一个好地方。
                  </h2>
                  <p>
                    探索校园空间，让活动从灵感走向现场。
                    <br />
                    预约、协同、预演，每一步都从容有序。
                  </p>
                  <div>
                    <Button kind="light" onClick={() => go("venues")}>
                      探索校园场地 <Icon name="arrow" size={16} />
                    </Button>
                    <button
                      className="hero-play"
                      onClick={() => {
                        setGuide(0);
                        go("venues");
                      }}
                    >
                      <Icon name="play" size={15} /> 3 分钟了解 CampusTwin
                    </button>
                  </div>
                </div>
                <div className="hero-caption">
                  <Icon name="pin" size={14} /> 示例大学 · 示例校区{" "}
                  <span>REAL CAMPUS</span>
                </div>
              </section>
              <div className="stats-grid">
                {[
                  {
                    label: "可用校园空间",
                    value: state.venues.filter((v) => v.enabled).length,
                    unit: "处",
                    icon: "building",
                    sub: "探索更多活动可能",
                    color: "green",
                  },
                  {
                    label: "待审核申请",
                    value: pending.length,
                    unit: "份",
                    icon: "clock",
                    sub: "等待老师的下一步确认",
                    color: "gold",
                  },
                  {
                    label: "已发布活动",
                    value: published.length,
                    unit: "场",
                    icon: "calendar",
                    sub: "让热爱在校园相遇",
                    color: "blue",
                  },
                  {
                    label: "已保存预演",
                    value: state.plans.length,
                    unit: "个",
                    icon: "spark",
                    sub: "为每次变化做好准备",
                    color: "purple",
                  },
                ].map((s, i) => (
                  <button
                    className="stat-card"
                    key={s.label}
                    onClick={() =>
                      go(
                        (
                          [
                            "venues",
                            "approvals",
                            "events",
                            "simulator",
                          ] as Page[]
                        )[i],
                      )
                    }
                  >
                    <div>
                      <span>{s.label}</span>
                      <strong>
                        {String(s.value).padStart(2, "0")}
                        <small>{s.unit}</small>
                      </strong>
                      <p>{s.sub}</p>
                    </div>
                    <span className={"stat-icon " + s.color}>
                      <Icon name={s.icon} size={22} />
                    </span>
                  </button>
                ))}
              </div>
              <div className="dashboard-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>校园空间，一眼可见</h2>
                      <p>CAMPUS EXPLORER</p>
                    </div>
                    <button
                      className="text-btn"
                      onClick={() => go("resources")}
                    >
                      进入驾驶舱 <Icon name="arrow" size={15} />
                    </button>
                  </div>
                  <CampusMap
                    venues={state.venues}
                    bookings={state.bookings}
                    date={DAY}
                    selected={selected}
                    onSelect={(id) => {
                      setSelected(id);
                      setDetail(id);
                    }}
                  />
                  <div className="map-note">
                    <Icon name="layers" size={14} />{" "}
                    空间分布为演示示意，点击建筑了解场地
                  </div>
                </section>
                <section className="panel agenda">
                  <div className="panel-heading">
                    <div>
                      <h2>今天，正在发生</h2>
                      <p>OCT 23 · FRIDAY</p>
                    </div>
                    <span className="date-pill">23</span>
                  </div>
                  <div className="week-strip">
                    {["一", "二", "三", "四", "五", "六", "日"].map((w, i) => (
                      <div className={i === 4 ? "today" : ""} key={w}>
                        <span>{w}</span>
                        <b>{19 + i}</b>
                      </div>
                    ))}
                  </div>
                  {published
                    .filter((b) => b.date === DAY)
                    .map((b, i) => (
                      <button
                        className="agenda-item"
                        key={b.id}
                        onClick={() => openEvent(b)}
                      >
                        <div className="agenda-time">
                          {b.start}
                          <span>{b.end}</span>
                        </div>
                        <div className={"agenda-line tone-" + i} />
                        <div>
                          <span className="tiny-tag">
                            {i === 0 ? "学术交流" : "校园文化"}
                          </span>
                          <h3>{b.title}</h3>
                          <p>
                            <Icon name="pin" size={13} />
                            {venueOf(b.venueId).building}
                          </p>
                        </div>
                      </button>
                    ))}
                  <div className="agenda-footer">
                    <span>每一个热爱，都值得被看见</span>
                    <button className="text-btn" onClick={() => go("events")}>
                      发现更多 <Icon name="arrow" size={14} />
                    </button>
                  </div>
                </section>
              </div>
              <section className="quick-banner">
                <span className="quick-icon">
                  <Icon name="spark" size={25} />
                </span>
                <div>
                  <h3>计划有变？先看看更多可能。</h3>
                  <p>调整时间、人数或场地，让智能预演帮你找到更合适的方案。</p>
                </div>
                <Button onClick={() => go("simulator")}>
                  开始一次预演 <Icon name="arrow" size={16} />
                </Button>
              </section>
            </>
          )}
          {page === "venues" && (
            <>
              <div className="filter-panel">
                <label>
                  日期
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <label>
                  开始时间
                  <input
                    type="time"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label>
                  结束时间
                  <input
                    type="time"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </label>
                <label>
                  参与人数
                  <input
                    type="number"
                    min="0"
                    value={capacity || ""}
                    onChange={(e) => setCapacity(Number(e.target.value))}
                    placeholder="不限人数"
                  />
                </label>
                <label>
                  设备需求
                  <select value={eq} onChange={(e) => setEq(e.target.value)}>
                    <option>全部设备</option>
                    {equipment.map((e) => (
                      <option key={e}>{e}</option>
                    ))}
                  </select>
                </label>
                <Button
                  icon="refresh"
                  onClick={() => {
                    setDate(DAY);
                    setStart("14:00");
                    setEnd("16:00");
                    setCapacity(0);
                    setEq("全部设备");
                    setKind("全部场地");
                    setSearch("");
                  }}
                >
                  重置
                </Button>
              </div>
              <div className="section-toolbar">
                <div className="tabs">
                  {[
                    "全部场地",
                    "报告厅",
                    "教室",
                    "活动空间",
                    "体育场地",
                    "户外空间",
                  ].map((k) => (
                    <button
                      key={k}
                      className={k === kind ? "selected" : ""}
                      onClick={() => setKind(k)}
                    >
                      {k}
                    </button>
                  ))}
                </div>
                <div className="view-toggle">
                  <button
                    className={layout === "cards" ? "selected" : ""}
                    onClick={() => setLayout("cards")}
                    aria-label="卡片视图"
                  >
                    <Icon name="grid" size={18} />
                  </button>
                  <button
                    className={layout === "map" ? "selected" : ""}
                    onClick={() => setLayout("map")}
                    aria-label="地图视图"
                  >
                    <Icon name="pin" size={18} />
                  </button>
                </div>
              </div>
              <div className="results-count">
                共 {filtered.length} 处空间{" "}
                <span>
                  所选时段 {date} · {start}–{end} · 校园时间
                </span>
              </div>
              {layout === "map" && (
                <CampusMap
                  venues={filtered}
                  bookings={state.bookings}
                  selected={selected}
                  onSelect={(id) => {
                    setSelected(id);
                    setDetail(id);
                  }}
                  date={date}
                  hour={Number(start.slice(0, 2))}
                  large
                />
              )}
              <div className="venue-grid">
                {filtered.map((v) => {
                  const available = checks(state.venues, state.bookings, {
                    venueId: v.id,
                    date,
                    start,
                    end,
                    people: Math.max(1, capacity),
                    equipment: eq === "全部设备" ? [] : [eq],
                  }).every((x) => x.pass);
                  return (
                    <article className="venue-card" key={v.id}>
                      <button
                        className="venue-image"
                        onClick={() => setDetail(v.id)}
                      >
                        <img
                          src={"/images/campus-" + v.image + ".svg"}
                          alt={v.building + "校园氛围参考图"}
                        />
                        <span
                          className={
                            "availability " + (!available ? "busy" : "")
                          }
                        >
                          <i />
                          {!v.enabled
                            ? "暂停开放"
                            : available
                              ? "所选时段可申请"
                              : "所选条件不可申请"}
                        </span>
                        <span className="image-caption">
                          校园示意 · 氛围参考
                        </span>
                      </button>
                      <div className="venue-body">
                        <span className="eyebrow">{v.kind} / 示例校区</span>
                        <h3>{v.name}</h3>
                        <p>
                          <Icon name="users" size={15} />
                          最多 {v.capacity} 人 <span>·</span>
                          <Icon name="clock" size={15} />
                          08:00–22:00
                        </p>
                        <div className="equipment-tags">
                          {v.equipment.map((e) => (
                            <span key={e}>{e}</span>
                          ))}
                        </div>
                        <div className="venue-card-footer">
                          <button
                            className="text-btn"
                            onClick={() => setDetail(v.id)}
                          >
                            查看场地 <Icon name="arrow" size={15} />
                          </button>
                          <Button
                            onClick={() => startBooking(v)}
                            disabled={!v.enabled}
                          >
                            申请使用
                          </Button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              {!filtered.length && <Empty text="没有符合条件的场地" />}
            </>
          )}
          {(page === "bookings" || page === "approvals") && (
            <>
              {page === "approvals" && role === "student" ? (
                <div className="access-card panel">
                  <Icon name="shield" size={48} />
                  <h2>进入教师审批工作空间</h2>
                  <p>切换演示角色，查看申请、核对资源并完成审核。</p>
                  <Button kind="primary" onClick={() => setRole("teacher")}>
                    切换为教师演示角色
                  </Button>
                </div>
              ) : (
                <>
                  <div className="mini-stats">
                    {["PENDING", "APPROVED", "RETURNED"].map((s) => (
                      <button key={s} onClick={() => setStatusFilter(s)}>
                        <span>{statusNames[s as Status]}</span>
                        <strong>
                          {
                            state.bookings.filter(
                              (b) =>
                                b.status === s &&
                                (page === "approvals" || b.owner === "学生 A"),
                            ).length
                          }
                        </strong>
                        <Icon
                          name={
                            s === "PENDING"
                              ? "clock"
                              : s === "APPROVED"
                                ? "check"
                                : "file"
                          }
                        />
                      </button>
                    ))}
                  </div>
                  <section className="panel">
                    <div className="panel-heading">
                      <div className="tabs">
                        {[
                          "全部",
                          "PENDING",
                          "APPROVED",
                          "RETURNED",
                          "REJECTED",
                          "WITHDRAWN",
                        ].map((s) => (
                          <button
                            key={s}
                            className={statusFilter === s ? "selected" : ""}
                            onClick={() => setStatusFilter(s)}
                          >
                            {s === "全部"
                              ? "全部申请"
                              : statusNames[s as Status]}
                          </button>
                        ))}
                      </div>
                    </div>
                    {bookingsTable(
                      state.bookings.filter(
                        (b) =>
                          (page === "approvals" || b.owner === "学生 A") &&
                          (statusFilter === "全部" ||
                            b.status === statusFilter),
                      ),
                      page === "approvals",
                    )}
                  </section>
                </>
              )}
            </>
          )}
          {page === "simulator" && (
            <>
              <div className="sim-intro">
                <Icon name="spark" size={23} />
                <div>
                  <strong>每个建议，都有依据</strong>
                  <p>
                    根据容量、设备、开放时间与已批准日程进行确定性预检。预演不会占用场地。
                  </p>
                </div>
                <span className="pill">规则解释模式</span>
              </div>
              <div className="section-toolbar">
                <div className="tabs">
                  <button
                    className={simTab === "analysis" ? "selected" : ""}
                    onClick={() => setSimTab("analysis")}
                  >
                    方案预演
                  </button>
                  <button
                    className={simTab === "saved" ? "selected" : ""}
                    onClick={() => setSimTab("saved")}
                  >
                    我的方案库 <b>{state.plans.length}</b>
                  </button>
                </div>
              </div>
              {simTab === "saved" ? (
                <section className="panel saved-plans">
                  {state.plans.length ? (
                    state.plans.map((p) => (
                      <div className="booking-row" key={p.id}>
                        <span className="stat-icon green">
                          <Icon name="spark" />
                        </span>
                        <div className="booking-main">
                          <h3>{p.name}</h3>
                          <p>
                            {venueOf(p.venueId).name} · {p.date} {p.start}–
                            {p.end}
                          </p>
                          <span>
                            {p.people} 人 · 保存时匹配分 {p.score} ·
                            使用前需重新预检
                          </span>
                        </div>
                        <Button
                          onClick={() => {
                            setSimPeople(p.people);
                            setSimDate(p.date);
                            setSimStart(p.start);
                            setSimEnd(p.end);
                            setSimNeed(p.equipment);
                            setSimSelected(p.venueId);
                            setSimRun(true);
                            setSimTab("analysis");
                          }}
                        >
                          重新预演
                        </Button>
                        <button
                          className="icon-btn"
                          aria-label={"删除方案 " + p.name}
                          onClick={() =>
                            setConfirm({
                              title: "删除预演方案？",
                              body: p.name,
                              action: () => {
                                setState((s) => ({
                                  ...s,
                                  plans: s.plans.filter((x) => x.id !== p.id),
                                }));
                                say("方案已删除");
                              },
                            })
                          }
                        >
                          <Icon name="close" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <Empty text="还没有保存的预演方案" />
                  )}
                </section>
              ) : (
                <div className="simulation-grid">
                  <section className="panel sim-config">
                    <div className="panel-heading">
                      <h2>设定你的场景</h2>
                      <span className="tiny-tag">WHAT IF</span>
                    </div>
                    <div className="preset-buttons">
                      <button
                        onClick={() => {
                          setSimPeople(100);
                          setSimNeed(["投影设备"]);
                          setSimStart("14:00");
                          setSimEnd("16:00");
                          updateSim();
                        }}
                      >
                        100 人分享会
                      </button>
                      <button
                        onClick={() => {
                          setSimPeople(560);
                          setSimNeed(["音响"]);
                          updateSim();
                        }}
                      >
                        人数增至 560
                      </button>
                      <button
                        onClick={() => {
                          setSimNeed(["投影设备", "无线话筒", "舞台灯光"]);
                          updateSim();
                        }}
                      >
                        新增舞台设备
                      </button>
                    </div>
                    <div className="form-grid">
                      <label className="full">
                        预计参与人数
                        <input
                          type="number"
                          min="1"
                          max="10000"
                          value={simPeople}
                          onChange={(e) => {
                            setSimPeople(Number(e.target.value));
                            updateSim();
                          }}
                        />
                      </label>
                      <label className="full">
                        活动日期
                        <input
                          type="date"
                          value={simDate}
                          onChange={(e) => {
                            setSimDate(e.target.value);
                            updateSim();
                          }}
                        />
                      </label>
                      <label>
                        开始时间
                        <input
                          type="time"
                          value={simStart}
                          onChange={(e) => {
                            setSimStart(e.target.value);
                            updateSim();
                          }}
                        />
                      </label>
                      <label>
                        结束时间
                        <input
                          type="time"
                          value={simEnd}
                          onChange={(e) => {
                            setSimEnd(e.target.value);
                            updateSim();
                          }}
                        />
                      </label>
                      <fieldset className="full">
                        <legend>所需设备</legend>
                        <div className="chip-options">
                          {equipment.map((e) => (
                            <label
                              key={e}
                              className={simNeed.includes(e) ? "picked" : ""}
                            >
                              <input
                                type="checkbox"
                                checked={simNeed.includes(e)}
                                onChange={() => {
                                  setSimNeed(
                                    simNeed.includes(e)
                                      ? simNeed.filter((x) => x !== e)
                                      : [...simNeed, e],
                                  );
                                  updateSim();
                                }}
                              />
                              {e}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    </div>
                    <Button
                      kind="primary full-width"
                      icon="spark"
                      onClick={() => {
                        setSimRun(true);
                        setSimSelected(
                          simCandidates.find((c) => c.feasible)?.venue.id || "",
                        );
                        say("预演完成，已比较全部演示场地");
                      }}
                    >
                      运行智能预演
                    </Button>
                    <p className="small muted">
                      需要时间枚举、JSON 导入导出与完整执行清单？
                      <button className="text-btn" onClick={() => go("legacy")}>
                        打开经典工作台 →
                      </button>
                    </p>
                  </section>
                  <section className="sim-results">
                    {!simRun ? (
                      <div className="panel sim-empty">
                        <div className="orb">
                          <Icon name="spark" size={44} />
                        </div>
                        <span className="eyebrow">
                          EXPLORE THE POSSIBILITIES
                        </span>
                        <h2>好决策，从预演开始。</h2>
                        <p>
                          设定活动需求，我们将为你比较校园场地，
                          <br />
                          解释约束条件，找到更合适的方案。
                        </p>
                        <div className="process-pills">
                          <span>需求输入</span>
                          <Icon name="arrow" size={14} />
                          <span>约束校验</span>
                          <Icon name="arrow" size={14} />
                          <span>方案对比</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="results-summary">
                          <strong>
                            {simCandidates.filter((c) => c.feasible).length}{" "}
                            个可行方案
                          </strong>
                          <span>
                            共检查 {simCandidates.length} 个场地 · {simStart}–
                            {simEnd}
                          </span>
                        </div>
                        {simCandidates.map((c, i) => (
                          <button
                            className={
                              "candidate panel " +
                              (simSelected === c.venue.id ? "chosen" : "")
                            }
                            key={c.venue.id}
                            onClick={() => setSimSelected(c.venue.id)}
                          >
                            <span className="candidate-rank">0{i + 1}</span>
                            <div>
                              <h3>
                                {c.venue.name}
                                {i === 0 && c.feasible && (
                                  <span className="tiny-tag">推荐</span>
                                )}
                              </h3>
                              <p>
                                {c.venue.capacity} 人容量 · {simDate} {simStart}
                                –{simEnd}
                              </p>
                              <span
                                className={
                                  c.feasible ? "success-text" : "error-text"
                                }
                              >
                                {c.feasible
                                  ? "全部约束通过"
                                  : c.checks
                                      .filter((x) => !x.pass)
                                      .map((x) => x.label + "不满足")
                                      .join(" · ")}
                              </span>
                            </div>
                            <div className="candidate-score">
                              {c.feasible ? c.score : "—"}
                              <small>{c.feasible ? "匹配分" : "不可行"}</small>
                            </div>
                          </button>
                        ))}
                        {chosen && (
                          <div className="panel explanation">
                            <div className="panel-heading">
                              <h2>
                                <Icon name="spark" size={19} />{" "}
                                方案依据与行动建议
                              </h2>
                            </div>
                            <CheckList items={chosen.checks} />
                            <p className="notice">
                              {chosen.feasible
                                ? `该场地满足 ${simPeople} 人及所选设备需求。评分按容量利用率计算；建议提交审批后通知参与者，并在活动前复核设备。`
                                : "该场地存在硬约束未满足，不能直接转为申请。请调整需求或选择其他方案。"}
                            </p>
                            <div className="action-wrap">
                              <Button
                                disabled={!chosen.feasible}
                                icon="book"
                                onClick={() => {
                                  if (state.plans.length >= 20) {
                                    say("方案库最多保存 20 条，请先删除旧方案");
                                    return;
                                  }
                                  setState((s) => ({
                                    ...s,
                                    plans: [
                                      {
                                        id: uid(),
                                        name: `${simPeople} 人活动 · 方案 ${s.plans.length + 1}`,
                                        venueId: chosen.venue.id,
                                        ...simInput,
                                        score: chosen.score,
                                      },
                                      ...s.plans,
                                    ],
                                  }));
                                  say("预演方案已保存");
                                }}
                              >
                                保存方案
                              </Button>
                              <Button
                                disabled={!chosen.feasible}
                                icon="download"
                                onClick={() =>
                                  download(
                                    "CampusTwin-预演报告.md",
                                    `# 场地预演报告\n\n场地：${chosen.venue.name}\n日期：${simDate}\n实际时段：${simStart}–${simEnd}\n参与人数：${simPeople}\n匹配分：${chosen.score}\n\n${chosen.checks.map((c) => "- " + c.label + "：" + c.detail).join("\n")}\n\n这是演示预演建议，未产生正式预约。`,
                                  )
                                }
                              >
                                导出报告
                              </Button>
                              <Button
                                kind="primary"
                                disabled={!chosen.feasible}
                                onClick={() =>
                                  startBooking(chosen.venue, {
                                    id: "",
                                    title: `${simPeople} 人校园活动`,
                                    description: "根据预演方案申请场地。",
                                    ...simInput,
                                    venueId: chosen.venue.id,
                                    status: "RETURNED",
                                    owner: "学生 A",
                                    revision: 0,
                                    history: [],
                                  })
                                }
                              >
                                转为活动申请
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </section>
                </div>
              )}
            </>
          )}
          {page === "resources" && (
            <>
              {role !== "admin" ? (
                <div className="panel access-card">
                  <Icon name="layers" size={48} />
                  <h2>进入校园资源驾驶舱</h2>
                  <p>切换管理员演示角色，查看资源时轴并管理场地开放状态。</p>
                  <Button kind="primary" onClick={() => setRole("admin")}>
                    切换为管理员演示角色
                  </Button>
                </div>
              ) : (
                <>
                  <div className="section-toolbar">
                    <div className="tabs">
                      {[
                        ["map", "空间视图"],
                        ["timeline", "资源时轴"],
                        ["directory", "场地管理"],
                      ].map(([id, label]) => (
                        <button
                          key={id}
                          className={adminView === id ? "selected" : ""}
                          onClick={() => setAdminView(id)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <label className="inline-date">
                      查看日期{" "}
                      <input
                        aria-label="资源日期"
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                      />
                    </label>
                  </div>
                  {adminView === "map" ? (
                    <div className="resource-grid">
                      <div className="panel">
                        <CampusMap
                          venues={state.venues}
                          bookings={state.bookings}
                          date={date}
                          hour={hour}
                          selected={selected}
                          onSelect={setSelected}
                          large
                        />
                        <div className="time-slider">
                          <div>
                            <Icon name="clock" size={18} />
                            <strong>{String(hour).padStart(2, "0")}:00</strong>
                            <span>拖动时间，查看场地占用</span>
                          </div>
                          <input
                            aria-label="场景时间"
                            type="range"
                            min="8"
                            max="21"
                            value={hour}
                            onChange={(e) => setHour(Number(e.target.value))}
                          />
                          <div className="time-ticks">
                            <span>08:00</span>
                            <span>12:00</span>
                            <span>16:00</span>
                            <span>21:00</span>
                          </div>
                        </div>
                      </div>
                      <section className="panel resource-detail">
                        <img
                          src={"/images/campus-" + selectedVenue.image + ".svg"}
                          alt="校园氛围参考"
                        />
                        <div>
                          <span className="eyebrow">SELECTED SPACE</span>
                          <h2>{selectedVenue.name}</h2>
                          <p>演示容量 {selectedVenue.capacity} 人</p>
                          <div className="equipment-tags">
                            {selectedVenue.equipment.map((e) => (
                              <span key={e}>{e}</span>
                            ))}
                          </div>
                          <h3>当日已确认日程</h3>
                          {published
                            .filter(
                              (b) => b.venueId === selected && b.date === date,
                            )
                            .map((b) => (
                              <div className="schedule-entry" key={b.id}>
                                <strong>
                                  {b.start}–{b.end}
                                </strong>
                                <p>{b.title}</p>
                              </div>
                            ))}
                          {!published.some(
                            (b) => b.venueId === selected && b.date === date,
                          ) && <p className="muted">当日暂无已批准活动</p>}
                          <Button
                            kind="primary full-width"
                            onClick={() => setDetail(selected)}
                          >
                            查看完整场地详情
                          </Button>
                        </div>
                      </section>
                    </div>
                  ) : adminView === "timeline" ? (
                    <div className="panel timeline-scroll">
                      <table className="resource-table">
                        <thead>
                          <tr>
                            <th>场地 / {date}</th>
                            {Array.from({ length: 14 }, (_, i) => (
                              <th key={i}>{i + 8}:00</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {state.venues.map((v) => (
                            <tr key={v.id}>
                              <th>
                                <button onClick={() => setDetail(v.id)}>
                                  {v.building}
                                </button>
                                <small>{v.capacity} 人</small>
                              </th>
                              {Array.from({ length: 14 }, (_, i) => {
                                const t =
                                    String(i + 8).padStart(2, "0") + ":00",
                                  next = String(i + 9).padStart(2, "0") + ":00";
                                const b = published.find(
                                  (b) =>
                                    b.venueId === v.id &&
                                    b.date === date &&
                                    b.start < next &&
                                    b.end > t,
                                );
                                return (
                                  <td
                                    key={i}
                                    className={
                                      !v.enabled
                                        ? "disabled-cell"
                                        : b
                                          ? "occupied-cell"
                                          : ""
                                    }
                                  >
                                    <button
                                      title={b?.title || "可申请"}
                                      onClick={() =>
                                        b ? openEvent(b) : setDetail(v.id)
                                      }
                                    >
                                      {b ? "已占用" : !v.enabled ? "暂停" : "·"}
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="small muted">
                        横向滑动查看全天日程 · 已批准申请才形成占用
                      </p>
                    </div>
                  ) : (
                    <section className="panel directory">
                      {state.venues.map((v) => (
                        <div className="booking-row" key={v.id}>
                          <span className="stat-icon green">
                            <Icon name="building" />
                          </span>
                          <div className="booking-main">
                            <h3>{v.name}</h3>
                            <p>
                              {v.capacity} 人 · {v.equipment.join(" / ")}
                            </p>
                            <span>来源：演示配置 · 开放 08:00–22:00</span>
                          </div>
                            <Button onClick={() => setEditingVenue({...v, equipment:[...v.equipment]})}>编辑配置</Button>
                            <button
                              role="switch"
                            aria-checked={v.enabled}
                            aria-label={v.name + "开放状态"}
                            className={"switch " + (v.enabled ? "on" : "")}
                            onClick={() =>
                              setConfirm({
                                title: v.enabled
                                  ? "暂停此场地开放？"
                                  : "恢复此场地开放？",
                                body: "此更改将影响后续预检与审批；已有批准活动会保留，请人工协调。",
                                action: () => {
                                  setState((s) => ({
                                    ...s,
                                    venues: s.venues.map((x) =>
                                      x.id === v.id
                                        ? { ...x, enabled: !x.enabled }
                                        : x,
                                    ),
                                  }));
                                  say("场地开放状态已更新");
                                },
                              })
                            }
                          >
                            <span />
                          </button>
                          <span>{v.enabled ? "开放中" : "已暂停"}</span>
                        </div>
                      ))}
                    </section>
                  )}
                </>
              )}
            </>
          )}
          {page === "events" &&
            (eventId ? (
              event ? (
                <article className="public-event panel">
                  <button
                    className="text-btn back"
                    onClick={() => go("events")}
                  >
                    ← 返回校园活动
                  </button>
                  <div className="event-cover">
                    <img
                      src={
                        "/images/campus-" +
                        venueOf(event.venueId).image +
                        ".svg"
                      }
                      alt="示例大学校园示意"
                    />
                    <div>
                      <span className="hero-tag">
                        CAMPUS MOMENTS · 校园活动
                      </span>
                      <h2>{event.title}</h2>
                      <span className="pill">
                        已发布 · 第 {event.revision} 版
                      </span>
                    </div>
                  </div>
                  <div className="public-body">
                    <section>
                      <div className="event-facts">
                        <div>
                          <Icon name="calendar" />
                          <span>
                            活动时间
                            <strong>
                              {event.date} · {event.start}–{event.end}
                            </strong>
                          </span>
                        </div>
                        <div>
                          <Icon name="pin" />
                          <span>
                            活动地点
                            <strong>{venueOf(event.venueId).name}</strong>
                          </span>
                        </div>
                        <div>
                          <Icon name="users" />
                          <span>
                            预计规模<strong>{event.people} 人</strong>
                          </span>
                        </div>
                      </div>
                      <h3>关于这场活动</h3>
                      <p>{event.description}</p>
                      <div className="notice">
                        场地及日程为演示数据。地点请参考下方校园示意，暂无准确室内导航。
                      </div>
                      <Button
                        icon="pin"
                        onClick={() => setDetail(event.venueId)}
                      >
                        查看场地示意
                      </Button>
                      {event.revision > 1 && (
                        <p className="notice">
                          活动信息已经更新，请以当前已发布的时间和地点为准。
                        </p>
                      )}
                    </section>
                    <aside className="share-card">
                      <h3>把精彩分享出去</h3>
                      <QR
                        value={
                          location.origin +
                          location.pathname +
                          "#events/" +
                          event.id
                        }
                      />
                      <p>稳定活动链接 · 更新后无需换码</p>
                      <Button
                        icon="link"
                        onClick={() => {
                          navigator.clipboard
                            .writeText(
                              location.origin +
                                location.pathname +
                                "#events/" +
                                event.id,
                            )
                            .then(() => say("活动链接已复制"))
                            .catch(() =>
                              say("复制不可用，请复制浏览器地址栏链接"),
                            );
                        }}
                      >
                        复制活动链接
                      </Button>
                      <small>
                        当前链接仅用于本机演示；其他设备不共享本地数据。
                      </small>
                    </aside>
                  </div>
                </article>
              ) : (
                <Empty text="活动尚未发布或不存在" />
              )
            ) : (
              <>
                <div className="events-feature">
                  <div>
                    <span className="eyebrow">MAKE CAMPUS LIFE MATTER</span>
                    <h2>
                      在校园，
                      <br />
                      遇见更多可能。
                    </h2>
                    <p>与志同道合的人相遇，把普通的一天过成值得记住的时刻。</p>
                  </div>
                  <img src="/images/campus-8.svg" alt="示例大学校园水景" />
                </div>
                <div className="section-toolbar">
                  <h2>
                    探索已发布活动{" "}
                    <span className="muted small">
                      /{" "}
                      {published.filter((b) => b.title.includes(search)).length}{" "}
                      场
                    </span>
                  </h2>
                  <span className="small muted">按演示日程展示</span>
                </div>
                <div className="events-grid">
                  {published
                    .filter((b) => b.title.includes(search))
                    .map((b, i) => (
                      <button
                        className="event-card panel"
                        key={b.id}
                        onClick={() => openEvent(b)}
                      >
                        <div className="event-image">
                          <img
                            src={
                              "/images/campus-" +
                              venueOf(b.venueId).image +
                              ".svg"
                            }
                            alt="校园示意氛围图"
                          />
                          <span className="event-date">
                            <strong>{b.date.slice(8)}</strong>
                            {b.date.slice(5, 7)} 月
                          </span>
                        </div>
                        <div className="event-card-body">
                          <span className="eyebrow">
                            {i % 2
                              ? "校园文化 / CULTURE"
                              : "灵感交流 / INSPIRATION"}
                          </span>
                          <h3>{b.title}</h3>
                          <p>{b.description}</p>
                          <div>
                            <span>
                              <Icon name="clock" size={14} />
                              {b.start}–{b.end}
                            </span>
                            <span>
                              <Icon name="pin" size={14} />
                              {venueOf(b.venueId).building}
                            </span>
                            <Icon name="arrow" size={18} />
                          </div>
                        </div>
                      </button>
                    ))}
                </div>
                {!published.filter((b) => b.title.includes(search)).length && (
                  <Empty text="暂无匹配的已发布活动" />
                )}
              </>
            ))}
          {page === "notices" && (
            <section className="panel notifications">
              <div className="panel-heading">
                <h2>
                  全部消息 <span className="tiny-tag">{unread} 条未读</span>
                </h2>
                <Button
                  icon="check"
                  onClick={() => {
                    setState((s) => ({
                      ...s,
                      notices: s.notices.map((n) => ({ ...n, read: true })),
                    }));
                    say("已将全部消息标为已读");
                  }}
                >
                  全部已读
                </Button>
              </div>
              {state.notices.map((n) => (
                <button
                  className={"notification " + (!n.read ? "unread" : "")}
                  key={n.id}
                  onClick={() => {
                    setState((s) => ({
                      ...s,
                      notices: s.notices.map((x) =>
                        x.id === n.id ? { ...x, read: true } : x,
                      ),
                    }));
                    say("消息已标为已读");
                  }}
                >
                  <span className="stat-icon green">
                    <Icon name="bell" />
                  </span>
                  <div>
                    <h3>{n.title}</h3>
                    <p>{n.body}</p>
                    <small>{n.read ? "已读" : "点击标为已读"}</small>
                  </div>
                  {!n.read && <i className="unread-dot" />}
                </button>
              ))}
            </section>
          )}
          {page === "settings" && (
            <div className="settings-grid">
              <section className="panel settings-panel">
                <span className="eyebrow">YOUR DEMO SPACE</span>
                <h2>随时开始一场新演示</h2>
                <p>
                  所有申请、审批、通知与预演方案保存在当前浏览器。你可以备份数据，或恢复最初的演示场景。
                </p>
                <div className="action-wrap">
                  <Button
                    icon="download"
                    onClick={() =>
                      download(
                        "CampusTwin-Demo-Backup.json",
                        JSON.stringify(state, null, 2),
                        "application/json",
                      )
                    }
                  >
                    导出演示数据
                  </Button>
                  <Button
                    icon="refresh"
                    onClick={() =>
                      setConfirm({
                        title: "恢复初始演示数据？",
                        body: "这将清除当前浏览器新增的申请、消息与方案。建议先导出备份。经典工作台方案库不受影响。",
                        action: () => {
                          setState(initialState());
                          say("已恢复初始演示数据");
                          go("home");
                        },
                      })
                    }
                  >
                    重置演示
                  </Button>
                </div>
                <label className="import-label">
                  恢复演示备份
                  <input
                    type="file"
                    accept=".json"
                    onChange={async (e) => {
                      const input = e.currentTarget;
                      const f = input.files?.[0];
                      if (!f) return;
                      try {
                        if (f.size > 2000000) throw new Error();
                        const data = JSON.parse(await f.text());
                        if (!validDemoState(data)) throw new Error();
                        setConfirm({
                          title: "恢复备份数据？",
                          body: "将替换当前浏览器的演示数据。",
                          action: () => {
                            setState(data);
                            say("演示数据已恢复");
                          },
                        });
                      } catch {
                        say(
                          "无法导入：请选择有效的 CampusTwin 演示备份（最大 2 MB）",
                        );
                      }
                      input.value = "";
                    }}
                  />
                </label>
              </section>
              <section className="panel settings-panel">
                <span className="eyebrow">ABOUT THIS PROTOTYPE</span>
                <h2>校园时空 · 智能协同</h2>
                <p>
                  本版本为可交互 UI
                  原型，覆盖文档中的主要演示流程。角色切换为演示操作，未连接学校预约、登录、AI
                  模型或消息系统。
                </p>
                <p>
                  校园插画为原创虚构示意；场地名称、容量、设备、开放安排与示意布局均用于场景演示。
                </p>
                
                <Button
                  icon="play"
                  onClick={() => {
                    setGuide(0);
                    go("venues");
                  }}
                >
                  重新观看演示导览
                </Button>
              </section>
            </div>
          )}
          {page === "legacy" && (
            <div className="legacy-wrapper">
              <div className="notice">
                经典工作台使用原始仿真数据集，方案与当前 UI 演示日程分别保存。
              </div>
              <Suspense fallback={<p>正在加载调度工具…</p>}>
                <SchedulingPage />
              </Suspense>
            </div>
          )}
          <footer className="app-footer">
            <span>
              <i className="live-dot" /> CampusTwin 2.0 · 交互演示
            </span>
            <span>
              模拟数据 · 非官方预约系统 <i>·</i> 视觉素材：
              <span>虚构示意插画</span>
            </span>
          </footer>
        </main>
      </div>
      {detailVenue && (
        <Modal title={detailVenue.name} onClose={() => setDetail(null)} wide>
          <img
            className="detail-hero"
            src={"/images/campus-" + detailVenue.image + ".svg"}
            alt="示例大学校园示意插画"
          />
          <div className="detail-facts">
            <span>
              <Icon name="users" />
              {detailVenue.capacity} 人容量
            </span>
            <span>
              <Icon name="clock" />
              08:00–22:00
            </span>
            <span
              className={detailVenue.enabled ? "success-text" : "error-text"}
            >
              {detailVenue.enabled ? "开放申请" : "暂停开放"}
            </span>
          </div>
          <div className="equipment-tags">
            {detailVenue.equipment.map((e) => (
              <span key={e}>{e}</span>
            ))}
          </div>
          <div className="section-toolbar">
            <h3>场地日程</h3>
            <input
              aria-label="场地日程日期"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="day-slots">
            {Array.from({ length: 7 }, (_, i) => {
              const a = String(8 + i * 2).padStart(2, "0") + ":00",
                z = String(10 + i * 2).padStart(2, "0") + ":00";
              const occupied = published.some(
                (b) =>
                  b.venueId === detailVenue.id &&
                  b.date === date &&
                  b.start < z &&
                  b.end > a,
              );
              return (
                <div className={occupied ? "busy" : ""} key={i}>
                  <strong>{a}</strong>
                  <span>
                    {!detailVenue.enabled
                      ? "暂停"
                      : occupied
                        ? "有活动"
                        : "可申请"}
                  </span>
                </div>
              );
            })}
          </div>
          {published
            .filter((b) => b.venueId === detailVenue.id && b.date === date)
            .map((b) => (
              <div className="schedule-entry" key={b.id}>
                <strong>
                  {b.start}–{b.end}
                </strong>
                <p>{b.title}</p>
              </div>
            ))}
          <p className="small muted">
            日程与容量为演示数据，插画为虚构设计。
          </p>
          <div className="modal-actions">
            <Button onClick={() => setDetail(null)}>关闭</Button>
            <Button
              kind="primary"
              disabled={!detailVenue.enabled}
              onClick={() => startBooking(detailVenue)}
            >
              申请使用此场地
            </Button>
          </div>
        </Modal>
      )}
      {booking && (
        <BookingForm
          state={state}
          venue={booking.venue}
          existing={booking.existing}
          onSubmit={saveBooking}
          onClose={() => setBooking(null)}
        />
      )}
      {reviewBooking && (
        <Modal
          title={page === "approvals" ? "审核活动申请" : "申请详情与进度"}
          onClose={() => setReview(null)}
          wide
        >
          <div className="review-summary">
            <div>
              <h3>{reviewBooking.title}</h3>
              <p>{venueOf(reviewBooking.venueId).name}</p>
              <p>
                {reviewBooking.date} · {reviewBooking.start}–{reviewBooking.end}{" "}
                · {reviewBooking.people} 人
              </p>
            </div>
            <Badge status={reviewBooking.status} />
          </div>
          <p className="review-description">{reviewBooking.description}</p>
          <h3 className="subheading">资源预检依据</h3>
          <CheckList
            items={checks(
              state.venues,
              state.bookings,
              reviewBooking,
              reviewBooking.status === "APPROVED"
                ? reviewBooking.id
                : reviewBooking.parentId,
            )}
          />
          <h3 className="subheading">申请时间线</h3>
          <div className="history">
            {reviewBooking.history.map((h, i) => (
              <div key={i}>
                <i />
                <strong>{h.text}</strong>
                <span>{h.at}</span>
              </div>
            ))}
          </div>
          {reviewBooking.status === "PENDING" &&
            role !== "student" &&
            page === "approvals" && (
              <>
                <label className="review-note">
                  审核意见
                  <textarea
                    rows={3}
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    placeholder="退回或驳回需说明原因，帮助组织者完善活动安排"
                  />
                </label>
                {reviewAction && (
                  <div className="notice">
                    即将{statusNames[reviewAction]}
                    此申请。请核对信息后点击“确认审核”。
                  </div>
                )}
                {error && (
                  <p className="error-text" role="alert">
                    {error}
                  </p>
                )}
                <div className="modal-actions review-actions">
                  {reviewAction ? (
                    <>
                      <Button onClick={() => setReviewAction(null)}>
                        返回
                      </Button>
                      <Button kind="primary" onClick={processReview}>
                        确认审核
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        onClick={() => {
                          setReviewAction("RETURNED");
                          setError("");
                        }}
                      >
                        退回修改
                      </Button>
                      <Button
                        kind="danger"
                        onClick={() => {
                          setReviewAction("REJECTED");
                          setError("");
                        }}
                      >
                        驳回申请
                      </Button>
                      <Button
                        kind="primary"
                        icon="check"
                        onClick={() => {
                          setReviewAction("APPROVED");
                          setError("");
                        }}
                      >
                        批准申请
                      </Button>
                    </>
                  )}
                </div>
              </>
            )}
          {reviewBooking.status === "APPROVED" && (
            <div className="modal-actions">
              <Button
                kind="primary"
                onClick={() => {
                  setReview(null);
                  openEvent(reviewBooking);
                }}
              >
                查看已发布活动
              </Button>
            </div>
          )}
        </Modal>
      )}
      {editingVenue && <Modal title="编辑场地配置" onClose={()=>setEditingVenue(null)}>
        <form onSubmit={e=>{e.preventDefault();if(!editingVenue.name.trim()||!Number.isInteger(editingVenue.capacity)||editingVenue.capacity<1)return;setState(s=>({...s,venues:s.venues.map(v=>v.id===editingVenue.id?editingVenue:v)}));setEditingVenue(null);say('场地资料已保存，后续预检将采用新的配置')}}>
          <div className="form-grid"><label className="full">场地名称<input required value={editingVenue.name} maxLength={60} onChange={e=>setEditingVenue({...editingVenue,name:e.target.value})}/></label><label className="full">可容纳人数<input required type="number" min="1" max="10000" value={editingVenue.capacity} onChange={e=>setEditingVenue({...editingVenue,capacity:Number(e.target.value)})}/></label><fieldset className="full"><legend>场地设备</legend><div className="chip-options">{equipment.map(eq=><label key={eq} className={editingVenue.equipment.includes(eq)?'picked':''}><input type="checkbox" checked={editingVenue.equipment.includes(eq)} onChange={()=>setEditingVenue({...editingVenue,equipment:editingVenue.equipment.includes(eq)?editingVenue.equipment.filter(x=>x!==eq):[...editingVenue.equipment,eq]})}/>{eq}</label>)}</div></fieldset></div>
          <p className="notice">已有批准活动保留。若调整后的容量或设备无法满足已有活动，请协调变更。</p><div className="modal-actions"><Button onClick={()=>setEditingVenue(null)}>取消</Button><Button kind="primary" type="submit">保存配置</Button></div>
        </form>
      </Modal>}
      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}>
          <p>{confirm.body}</p>
          <div className="modal-actions">
            <Button onClick={() => setConfirm(null)}>取消</Button>
            <Button
              kind="primary"
              onClick={() => {
                confirm.action();
                setConfirm(null);
              }}
            >
              确认
            </Button>
          </div>
        </Modal>
      )}
      {guide !== null && (
        <div className="guide-card" role="dialog" aria-label="演示导览">
          <button
            className="icon-btn"
            aria-label="关闭导览"
            onClick={() => setGuide(null)}
          >
            <Icon name="close" size={17} />
          </button>
          <span className="eyebrow">DEMO WALKTHROUGH · {guide + 1}/4</span>
          <h3>{guideSteps[guide].title}</h3>
          <p>{guideSteps[guide].body}</p>
          <div>
            {guide > 0 && (
              <Button
                onClick={() => {
                  setGuide(guide - 1);
                  go(guideSteps[guide - 1].p);
                }}
              >
                上一步
              </Button>
            )}
            <Button
              kind="primary"
              onClick={() => {
                if (guide === 3) {
                  setGuide(null);
                  go("events");
                } else {
                  const n = guide + 1;
                  setGuide(n);
                  go(guideSteps[n].p);
                  if (n === 2) setRole("teacher");
                }
              }}
            >
              {guide === 3 ? "完成导览" : "下一步"}
              <Icon name="arrow" size={15} />
            </Button>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" size={18} />
          {toast}
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}


