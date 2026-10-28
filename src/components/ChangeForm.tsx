import type { ChangeEvent, ReactElement } from 'react';
import type { Activity } from '../types/activity';
import type { ActivityChange } from '../types/change';
import type { Equipment, ResourceUnit, Venue } from '../types/resource';
import type { FormMode, PresetOption, WorkbenchForm } from '../utils/changeForm';
import { KIND_OPTIONS } from '../utils/changeForm';

interface ChangeFormProps {
  readonly mode: FormMode;
  readonly onModeChange: (mode: FormMode) => void;
  readonly form: WorkbenchForm;
  readonly onFormPatch: (patch: Partial<WorkbenchForm>) => void;
  readonly activities: readonly Activity[];
  readonly activity: Activity | undefined;
  readonly presetOptions: readonly PresetOption[];
  readonly selectedPresetId: string;
  readonly onPresetChange: (presetId: string) => void;
  readonly presetChange: ActivityChange | undefined;
  readonly venues: readonly Venue[];
  readonly equipment: readonly Equipment[];
  readonly resources: readonly ResourceUnit[];
  readonly errors: readonly string[];
  readonly busy: boolean;
  /** 自定义模式：按时段枚举（读取显式模拟时段目录 slotCatalog）组合 场地 × 时段 候选 */
  readonly enumerateSlots: boolean;
  readonly onEnumerateSlotsChange: (next: boolean) => void;
  readonly onSubmit: () => void;
}

const MODE_OPTIONS: readonly { readonly value: FormMode; readonly label: string }[] = [
  { value: 'preset', label: '预置变更（runScheduling）' },
  { value: 'custom', label: '自定义变更（直接分析候选）' }
];

export default function ChangeForm({
  mode,
  onModeChange,
  form,
  onFormPatch,
  activities,
  activity,
  presetOptions,
  selectedPresetId,
  onPresetChange,
  presetChange,
  venues,
  equipment,
  resources,
  errors,
  busy,
  enumerateSlots,
  onEnumerateSlotsChange,
  onSubmit
}: ChangeFormProps): ReactElement {
  const patch = (values: Partial<WorkbenchForm>): void => onFormPatch(values);

  const onActivityChange = (event: ChangeEvent<HTMLSelectElement>): void =>
    patch({ activityId: event.currentTarget.value });

  const onKindChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const value = event.currentTarget.value;
    const matched = KIND_OPTIONS.find((option) => option.value === value);
    if (matched !== undefined) {
      patch({ kind: matched.value });
    }
  };

  const toggleEquipmentId = (id: string): void => {
    const next = form.requiredEquipmentIds.includes(id)
      ? form.requiredEquipmentIds.filter((item) => item !== id)
      : [...form.requiredEquipmentIds, id];
    patch({ requiredEquipmentIds: next });
  };

  return (
    <div className="wb-form">
      <div className="wb-mode" role="group" aria-label="分析模式">
        {MODE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`wb-mode__btn${option.value === mode ? ' wb-mode__btn--active' : ''}`}
            aria-pressed={option.value === mode}
            onClick={() => onModeChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {mode === 'preset' ? (
        <>
          <div className="wb-field">
            <label className="wb-label" htmlFor="wb-preset-select">
              预置变更（来自 campusDataset.changes）
            </label>
            <select
              id="wb-preset-select"
              className="wb-select"
              value={selectedPresetId}
              onChange={(event) => onPresetChange(event.currentTarget.value)}
            >
              {presetOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {presetChange !== undefined && (
            <div className="wb-preset-card">
              <p className="wb-preset-card__desc">{presetChange.description}</p>
              <p className="wb-preset-card__meta">
                请求时间 {presetChange.requestedAt} · 请求人 {presetChange.requestedBy}
              </p>
              <pre className="wb-payload">{JSON.stringify(presetChange.payload, null, 2)}</pre>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="wb-form__grid">
            <div className="wb-field">
              <label className="wb-label" htmlFor="wb-activity-select">
                关联活动
              </label>
              <select
                id="wb-activity-select"
                className="wb-select"
                value={form.activityId}
                onChange={onActivityChange}
              >
                {activities.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id} · {item.name}
                  </option>
                ))}
              </select>
              <span className="wb-hint">也可点击上方活动卡片切换；切换后表单会按新活动重新预填。</span>
            </div>

            <div className="wb-field">
              <label className="wb-label" htmlFor="wb-kind-select">
                变更类型（kind）
              </label>
              <select id="wb-kind-select" className="wb-select" value={form.kind} onChange={onKindChange}>
                {KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="wb-field wb-field--full">
              <label className="wb-check">
                <input
                  type="checkbox"
                  checked={enumerateSlots}
                  onChange={(event) => onEnumerateSlotsChange(event.currentTarget.checked)}
                />
                按时段枚举候选（从显式模拟时段目录 slotCatalog 读取候选时段，与候选场地组合）
              </label>
              <span className="wb-hint">
                候选时段受活动关联、可选场地限定与时长匹配（须与目标时段一致）规则影响；目录缺失或过滤后无可用时段时，回退基准时段并给出提示。
                模拟目录中的时段不代表真实场地空闲、真实预约或场地审批结果。取消勾选则仅分析当前输入的这一个时段；预置变更始终按单时段分析。
              </span>
            </div>

            {form.kind === 'time' && (
              <>
                <div className="wb-field">
                  <label className="wb-label" htmlFor="wb-start">
                    新开始时间（YYYY-MM-DDTHH:mm）
                  </label>
                  <input
                    id="wb-start"
                    className="wb-input"
                    value={form.start}
                    onChange={(event) => patch({ start: event.currentTarget.value })}
                    placeholder="2026-10-20T08:30"
                  />
                </div>
                <div className="wb-field">
                  <label className="wb-label" htmlFor="wb-end">
                    新结束时间（YYYY-MM-DDTHH:mm）
                  </label>
                  <input
                    id="wb-end"
                    className="wb-input"
                    value={form.end}
                    onChange={(event) => patch({ end: event.currentTarget.value })}
                    placeholder="2026-10-20T12:00"
                  />
                </div>
              </>
            )}

            {form.kind === 'venue' && (
              <>
                <div className="wb-field">
                  <label className="wb-label" htmlFor="wb-min-capacity">
                    目标容量下限（人，正整数）
                  </label>
                  <input
                    id="wb-min-capacity"
                    className="wb-input"
                    inputMode="numeric"
                    value={form.minCapacity}
                    onChange={(event) => patch({ minCapacity: event.currentTarget.value })}
                  />
                </div>
                <div className="wb-field">
                  <label className="wb-label" htmlFor="wb-target-venue">
                    目标场地（留空 = 由引擎枚举候选）
                  </label>
                  <select
                    id="wb-target-venue"
                    className="wb-select"
                    value={form.targetVenueId}
                    onChange={(event) => patch({ targetVenueId: event.currentTarget.value })}
                  >
                    <option value="">（不指定，枚举候选）</option>
                    {venues.map((venue) => (
                      <option key={venue.id} value={venue.id}>
                        {venue.id} · {venue.name}（容量 {venue.capacity}）
                      </option>
                    ))}
                  </select>
                </div>
                <div className="wb-field wb-field--full">
                  <span className="wb-label">目标场地必须具备的设备</span>
                  <div className="wb-checks">
                    {equipment.map((item) => {
                      const checked = form.requiredEquipmentIds.includes(item.id);
                      return (
                        <label key={item.id} className="wb-check">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleEquipmentId(item.id)}
                          />
                          {item.id} {item.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {form.kind === 'scale' && (
              <div className="wb-field">
                <label className="wb-label" htmlFor="wb-after">
                  变更后预计人数（非负整数）
                </label>
                <input
                  id="wb-after"
                  className="wb-input"
                  inputMode="numeric"
                  value={form.after}
                  onChange={(event) => patch({ after: event.currentTarget.value })}
                />
              </div>
            )}

            {form.kind === 'resource' && (
              <>
                <div className="wb-field">
                  <label className="wb-label" htmlFor="wb-equipment">
                    设备调整 · 设备（可不选）
                  </label>
                  <select
                    id="wb-equipment"
                    className="wb-select"
                    value={form.equipmentId}
                    onChange={(event) => patch({ equipmentId: event.currentTarget.value })}
                  >
                    <option value="">（不调整设备）</option>
                    {equipment.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.id} · {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="wb-field">
                  <label className="wb-label" htmlFor="wb-equipment-after">
                    设备目标数量（非负整数，after = 目标值非增量）
                  </label>
                  <input
                    id="wb-equipment-after"
                    className="wb-input"
                    inputMode="numeric"
                    value={form.equipmentAfter}
                    onChange={(event) => patch({ equipmentAfter: event.currentTarget.value })}
                    placeholder="例如 3"
                  />
                </div>
                <div className="wb-field">
                  <label className="wb-label" htmlFor="wb-resource">
                    资源调整 · 资源（可不选）
                  </label>
                  <select
                    id="wb-resource"
                    className="wb-select"
                    value={form.resourceId}
                    onChange={(event) => patch({ resourceId: event.currentTarget.value })}
                  >
                    <option value="">（不调整资源）</option>
                    {resources.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.id} · {item.name}（可用 {item.available}）
                      </option>
                    ))}
                  </select>
                </div>
                <div className="wb-field">
                  <label className="wb-label" htmlFor="wb-resource-after">
                    资源目标数量（非负整数，after = 目标值非增量）
                  </label>
                  <input
                    id="wb-resource-after"
                    className="wb-input"
                    inputMode="numeric"
                    value={form.resourceAfter}
                    onChange={(event) => patch({ resourceAfter: event.currentTarget.value })}
                    placeholder="例如 6"
                  />
                </div>
              </>
            )}
          </div>

          <div className="wb-field">
            <span className="wb-label">当前选中活动</span>
            <p className="wb-hint">
              {activity === undefined
                ? '未选择活动'
                : `${activity.id} · ${activity.name} · ${activity.currentSlot.start} → ${activity.currentSlot.end}`}
            </p>
          </div>
        </>
      )}

      {errors.length > 0 && (
        <ul className="wb-errors" role="alert">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      <div className="wb-actions">
        <button type="button" className="wb-submit" onClick={onSubmit} disabled={busy}>
          {busy ? '分析中…' : '运行调度分析'}
        </button>
        <span className="wb-hint">
          {mode === 'preset'
            ? '预置变更经完整调度入口执行，输出汇总结论与状态标签'
            : '自定义变更直接检查候选方案，生成评分与排除原因（不生成汇总结论与状态标签）' +
              (enumerateSlots ? '；已开启按时段枚举（读取显式模拟时段目录），同一场地可产出多个时段候选' : '')}
        </span>
      </div>
    </div>
  );
}
