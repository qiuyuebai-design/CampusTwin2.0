import type { ReactElement } from 'react';
import StageBadge from '../components/StageBadge';
import WorkflowStrip from '../components/WorkflowStrip';
import { homePageModel } from '../data/home';
import { formatPhaseStatus } from '../utils/format';

export default function HomePage(): ReactElement {
  const { project, phase, workflow, boundaries } = homePageModel;

  return (
    <div className="page">
      <header className="masthead">
        <div className="masthead__inner">
          <span className="masthead__mark">{project.name}</span>
          <span className="masthead__meta">
            {project.codeName} · {project.version}
          </span>
        </div>
      </header>

      <main className="page__main">
        <section className="hero">
          <aside className="hero__rail" aria-label="项目元信息">
            <div className="rail__row">
              <span className="rail__key">PROJECT</span>
              <span className="rail__value">{project.name}</span>
            </div>
            <div className="rail__row">
              <span className="rail__key">PHASE</span>
              <span className="rail__value">
                {phase.id} · {formatPhaseStatus(phase.status)}
              </span>
            </div>
            <div className="rail__row">
              <span className="rail__key">UPDATED</span>
              <span className="rail__value">{project.updatedOn}</span>
            </div>
          </aside>

          <div className="hero__body">
            <p className="hero__eyebrow">示例大学 · 校园活动变更场景</p>
            <h1 className="hero__title">{project.name}</h1>
            <p className="hero__subtitle">{project.codeName}</p>
            <p className="hero__lead">{project.positioning}</p>
            <p className="hero__scope">{project.scopeNote}</p>

            <dl className="hero__chips">
              <div className="chip">
                <dt className="chip__key">当前阶段</dt>
                <dd className="chip__value">{phase.label}</dd>
              </div>
              <div className="chip">
                <dt className="chip__key">数据来源</dt>
                <dd className="chip__value">模拟数据</dd>
              </div>
              <div className="chip">
                <dt className="chip__key">技术基线</dt>
                <dd className="chip__value">React · TypeScript · Vite</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="section">
          <div className="section__head">
            <span className="section__index">01</span>
            <h2 className="section__title">当前阶段</h2>
            <p className="section__desc">已支持约束分析、多时段比较、方案保存与导出。</p>
          </div>
          <StageBadge phase={phase} />
        </section>

        <section className="section">
          <div className="section__head">
            <span className="section__index">02</span>
            <h2 className="section__title">核心工作流</h2>
            <p className="section__desc">
              从变更输入到调度推荐的四步闭环，后续算法与页面都沿这条主线展开。
            </p>
          </div>
          <WorkflowStrip steps={workflow} />
        </section>

        <section className="section">
          <div className="section__head">
            <span className="section__index">03</span>
            <h2 className="section__title">模块边界</h2>
            <p className="section__desc">类型、引擎、业务协调与界面分层，便于继续扩展。</p>
          </div>

          <ul className="boundary">
            {boundaries.map((item) => (
              <li className="boundary__item" key={item.dir}>
                <span className="boundary__dir">{item.dir}</span>
                <span className="boundary__duty">{item.duty}</span>
                <span className={`boundary__status boundary__status--${item.status}`}>
                  {item.status === 'implemented' ? '已实现' : '后续里程碑'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="footer">
        <div className="footer__inner">
          <span>
            {project.name} · {project.version} · 更新于 {project.updatedOn}
          </span>
          <span>{project.scopeNote}</span>
        </div>
      </footer>
    </div>
  );
}
