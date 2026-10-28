import type { ReactElement } from 'react';

/** 顶层视图标识：首页 / 调度工作台（无路由，纯视图开关）。 */
export type AppView = 'home' | 'workbench';

interface TopNavProps {
  readonly current: AppView;
  readonly onNavigate: (view: AppView) => void;
}

const NAV_ITEMS: readonly { readonly view: AppView; readonly label: string }[] = [
  { view: 'home', label: '首页' },
  { view: 'workbench', label: '调度工作台' }
];

export default function TopNav({ current, onNavigate }: TopNavProps): ReactElement {
  return (
    <nav className="wb-nav" aria-label="主导航">
      <div className="wb-nav__inner">
        <span className="wb-nav__mark">CampusTwin 2.0</span>
        <div className="wb-nav__links">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.view}
              type="button"
              className={`wb-nav__btn${item.view === current ? ' wb-nav__btn--active' : ''}`}
              aria-current={item.view === current ? 'page' : undefined}
              onClick={() => onNavigate(item.view)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
