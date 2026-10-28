import { useEffect, useRef, useState } from "react";
import type { ReactNode, FormEvent } from "react";
import QRCode from "qrcode";
import Icon from "./Icon";
import { DAY, now, uid, checks, statusNames } from "./model";
import type { Booking, Status, Venue, DemoState } from "./model";
export function Button({
  children,
  onClick,
  kind = "",
  icon,
  disabled = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: string;
  icon?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      className={"btn " + kind}
      onClick={onClick}
      disabled={disabled}
    >
      {icon && <Icon name={icon} size={17} />}
      {children}
    </button>
  );
}
export function Badge({ status }: { status: Status }) {
  return (
    <span className={"badge " + status.toLowerCase()}>
      <i />
      {statusNames[status]}
    </span>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const items = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,textarea,a[href],[tabindex="0"]',
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = old;
      before?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">CAMPUSTWIN / DEMO</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭弹窗">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Icon name="layers" size={36} />
      <h3>{text}</h3>
      <p>试试调整筛选条件，或创建一份新的活动申请。</p>
    </div>
  );
}
export function CheckList({ items }: { items: ReturnType<typeof checks> }) {
  return (
    <div className="check-list">
      {items.map((c) => (
        <div key={c.label} className={c.pass ? "pass" : "fail"}>
          <Icon name={c.pass ? "check" : "warning"} size={17} />
          <strong>{c.label}</strong>
          <span>{c.detail}</span>
        </div>
      ))}
    </div>
  );
}
export function QR({ value }: { value: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      width: 180,
      margin: 1,
      color: { dark: "#214d3d", light: "#ffffff" },
    })
      .then((s) => {
        if (active) setSrc(s);
      })
      .catch(() => setSrc(""));
    return () => {
      active = false;
    };
  }, [value]);
  return src ? (
    <img className="qr" src={src} alt="活动公开链接二维码" />
  ) : (
    <span>二维码生成中</span>
  );
}
export const equipment = [
  "投影设备",
  "无线话筒",
  "音响",
  "舞台灯光",
  "移动白板",
];
export function BookingForm({
  state,
  venue,
  existing,
  onSubmit,
  onClose,
}: {
  state: DemoState;
  venue: Venue;
  existing?: Booking;
  onSubmit: (b: Booking) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState(existing?.title || "");
  const [description, setDescription] = useState(existing?.description || "");
  const [venueId, setVenueId] = useState(venue.id);
  const [date, setDate] = useState(existing?.date || DAY);
  const [start, setStart] = useState(existing?.start || "10:00");
  const [end, setEnd] = useState(existing?.end || "12:00");
  const [people, setPeople] = useState(existing?.people || 100);
  const [needs, setNeeds] = useState<string[]>(
    existing?.equipment || ["投影设备"],
  );
  const [error, setError] = useState("");
  const input = { venueId, date, start, end, people, equipment: needs };
  const results = checks(
    state.venues,
    state.bookings,
    input,
    existing?.id || undefined,
  );
  const valid = results.every((c) => c.pass);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (step < 2) {
      if (step === 0 && (!title.trim() || !description.trim())) {
        setError("请填写活动名称与活动介绍。");
        return;
      }
      setError("");
      setStep(step + 1);
      return;
    }
    if (!valid) return;
    onSubmit({
      id: uid(),
      title: title.trim(),
      description: description.trim(),
      ...input,
      status: "PENDING",
      owner: "学生 A",
      revision: (existing?.revision || 0) + 1,
      parentId: existing?.id || undefined,
      history: [
        ...(existing?.history || []),
        {
          text: existing?.id
            ? "学生 A提交修订申请，等待审核"
            : "学生 A提交活动申请，等待审核",
          at: now(),
        },
      ],
    });
  };
  return (
    <Modal
      title={existing?.id ? "修改与变更申请" : "创建活动申请"}
      onClose={onClose}
      wide
    >
      <div className="stepper">
        {["活动详情", "场地与需求", "预检并提交"].map((s, i) => (
          <div className={i <= step ? "active" : ""} key={s}>
            <b>{i < step ? "✓" : i + 1}</b>
            {s}
          </div>
        ))}
      </div>
      <form onSubmit={submit}>
        {step === 0 && (
          <div className="form-grid">
            <label className="full">
              活动名称
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={60}
                placeholder="为你的活动起个名字"
                required
              />
            </label>
            <label className="full">
              活动介绍与安排
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="介绍活动内容、组织安排，以及需要补充的说明…"
                rows={4}
                required
                maxLength={2000}
              />
            </label>
            <label>
              预计参与人数
              <input
                type="number"
                min="1"
                max="10000"
                value={people}
                onChange={(e) => setPeople(Number(e.target.value))}
                required
              />
            </label>
            <label>
              组织者
              <input readOnly value="学生 A · 学生创新协会" />
            </label>
          </div>
        )}
        {step === 1 && (
          <div className="form-grid">
            <label className="full">
              申请场地
              <select
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
              >
                {state.venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {v.capacity} 人{!v.enabled ? " · 暂停开放" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="full">
              活动日期（校园时间 UTC+8）
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>
            <label>
              开始时间
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </label>
            <label>
              结束时间
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                required
              />
            </label>
            <fieldset className="full">
              <legend>设备需求</legend>
              <div className="chip-options">
                {equipment.map((eq) => (
                  <label
                    className={needs.includes(eq) ? "picked" : ""}
                    key={eq}
                  >
                    <input
                      type="checkbox"
                      checked={needs.includes(eq)}
                      onChange={() =>
                        setNeeds(
                          needs.includes(eq)
                            ? needs.filter((n) => n !== eq)
                            : [...needs, eq],
                        )
                      }
                    />
                    {eq}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}
        {step === 2 && (
          <>
            <div className="summary-box">
              <h3>{title}</h3>
              <p>{state.venues.find((v) => v.id === venueId)?.name}</p>
              <p>
                {date} · {start}–{end} · {people} 人
              </p>
            </div>
            <CheckList items={results} />
            {!valid && (
              <div className="notice warning">
                当前需求未通过预检，请返回调整场地、时间或设备需求。可在“智能预演”中比较替代场地。
              </div>
            )}
            <div className="notice">
              提交后进入待审核。演示中的审批结果仅保存于当前浏览器。
            </div>
          </>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button onClick={() => (step ? setStep(step - 1) : onClose())}>
            {step ? "上一步" : "取消"}
          </Button>
          <Button
            type="submit"
            kind="primary"
            disabled={step === 2 && !valid}
            icon={step === 2 ? "check" : "arrow"}
          >
            {step === 2 ? "提交审核" : "下一步"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
