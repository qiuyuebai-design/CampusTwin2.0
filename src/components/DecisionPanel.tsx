import type { ReactElement } from 'react';
import type { ChecklistItem, ConfirmationSummaryRow } from '../utils/decision';
import { SIMULATION_NOTICE } from '../utils/decision';

interface DecisionPanelProps {
  readonly rows: readonly ConfirmationSummaryRow[];
  /** 已合并勾选状态的清单项（由页面用 withCheckedState 组装） */
  readonly items: readonly ChecklistItem[];
  readonly onToggle: (itemId: string) => void;
}

export default function DecisionPanel({ rows, items, onToggle }: DecisionPanelProps): ReactElement {
  const systemItems = items.filter((item) => item.kind === 'system');
  const manualItems = items.filter((item) => item.kind === 'manual');
  const checkedItems = items.filter((item) => item.checked);

  return (
    <div className="wb-decision">
      <p className="wb-decision__notice" role="note">
        {SIMULATION_NOTICE}
      </p>

      <h5 className="wb-decision__subtitle">方案确认摘要</h5>
      <div className="wb-table-scroll wb-decision__scroll" role="region" aria-label="方案确认摘要" tabIndex={0}>
        <table className="wb-table wb-table--summary">
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td className="wb-table__value">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h5 className="wb-decision__subtitle">系统生成的信息（{systemItems.length} 项）</h5>
      <ul className="wb-checklist">
        {systemItems.map((item) => (
          <li key={item.id} className={`wb-task wb-task--${item.checked ? 'checked' : 'open'}`}>
            <label className="wb-task__label">
              <input
                type="checkbox"
                checked={item.checked}
                onChange={() => onToggle(item.id)}
              />
              <span className="wb-task__title">{item.label}</span>
            </label>
            <p className="wb-task__detail">{item.detail}</p>
          </li>
        ))}
      </ul>

      <h5 className="wb-decision__subtitle">待人工确认事项（{manualItems.length} 项）</h5>
      <ul className="wb-checklist">
        {manualItems.map((item) => (
          <li key={item.id} className={`wb-task wb-task--${item.checked ? 'checked' : 'open'}`}>
            <label className="wb-task__label">
              <input
                type="checkbox"
                checked={item.checked}
                onChange={() => onToggle(item.id)}
              />
              <span className="wb-task__title">{item.label}</span>
            </label>
            <p className="wb-task__detail">{item.detail}</p>
          </li>
        ))}
      </ul>

      <h5 className="wb-decision__subtitle">已勾选（{checkedItems.length} 项 · 本地模拟，保存方案时保留）</h5>
      {checkedItems.length === 0 ? (
        <p className="wb-placeholder">尚未勾选任何事项。勾选仅记录模拟状态；请保存方案后再离开页面。</p>
      ) : (
        <ul className="wb-checked-list">
          {checkedItems.map((item) => (
            <li key={item.id}>
              <span className="wb-checked-list__group">
                {item.kind === 'system' ? '系统' : '人工'}
              </span>
              {item.label}
            </li>
          ))}
        </ul>
      )}

      <p className="wb-decision__legend">
        分组说明：系统生成的信息来自引擎与模拟数据集的客观字段；待人工确认事项必须由人在真实场景中完成，
        本页面不执行任何真实操作。
      </p>
    </div>
  );
}
