import type { HomePageModel } from '../types/project';

export const homePageModel: HomePageModel = {
  project: {
    name: 'CampusTwin 2.0',
    codeName: '校园孪生 · 示例大学',
    positioning: '面向示例大学校园活动变更场景的智能决策与资源调度仿真平台。',
    scopeNote: '使用模拟数据；方案仅保存在本机浏览器，可导出备份。不接入学校内部系统，无真实预约、通知、后端数据库或模型 API。',
    version: '2.0 · 方案工作台',
    updatedOn: '2026-10-23'
  },
  phase: {
    id: 'V2',
    label: '2.0 · 调度仿真与方案保存',
    summary: '分析变更、比较场地与模拟时段、解释推荐、保存并导出所选方案和人工清单。',
    status: 'current'
  },
  workflow: [
    {
      id: 'change-input',
      order: 1,
      title: '变更输入',
      summary: '录入校园活动的变更事件，例如时间调整、场地更换、参与规模变化与资源增减。',
      owner: 'src/pages'
    },
    {
      id: 'constraint-filter',
      order: 2,
      title: '约束过滤',
      summary: '按场地容量、时间冲突、开放时段与资源可用性等硬约束，剔除不可行的候选方案。',
      owner: 'src/engine'
    },
    {
      id: 'plan-scoring',
      order: 3,
      title: '方案评分',
      summary: '对可行候选按多维权重打分，生成可比较、可解释的排序结果。',
      owner: 'src/engine'
    },
    {
      id: 'schedule-output',
      order: 4,
      title: '调度推荐',
      summary: '汇总推荐方案、推荐理由与资源调度建议，输出给活动组织者与场地管理者。',
      owner: 'src/services'
    }
  ],
  boundaries: [
    {
      dir: 'src/types',
      duty: '共享类型定义，是跨模块通信的唯一契约来源。',
      status: 'implemented'
    },
    {
      dir: 'src/data',
      duty: '模拟数据与页面文案数据源，首版不接入学校内部系统。',
      status: 'implemented'
    },
    {
      dir: 'src/engine',
      duty: '约束过滤、方案评分、推荐理由，全部为 TypeScript 纯函数。',
      status: 'implemented'
    },
    {
      dir: 'src/services',
      duty: '业务协调与流程编排，串联页面输入、模拟数据与调度引擎。',
      status: 'implemented'
    },
    {
      dir: 'src/pages',
      duty: '页面级组合，负责布局与数据装配，不承载算法逻辑。',
      status: 'implemented'
    },
    {
      dir: 'src/components',
      duty: '可复用 UI 组件，只接收 props，不直接读写全局状态。',
      status: 'implemented'
    },
    {
      dir: 'src/utils',
      duty: '通用纯函数工具，不依赖 React，便于单元测试。',
      status: 'implemented'
    }
  ]
};
