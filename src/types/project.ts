/** 阶段编号，形如 M0、M1、M2 …… 由总架构师按里程碑扩展。 */
export type PhaseId = `V${number}` | `M${number}`;

export type PhaseStatus = 'done' | 'current' | 'planned';

export type ModuleStatus = 'implemented' | 'planned';

/** 已约定的模块目录职责边界。 */
export type ModuleDir =
  | 'src/types'
  | 'src/data'
  | 'src/engine'
  | 'src/services'
  | 'src/pages'
  | 'src/components'
  | 'src/utils';

export type WorkflowStepId =
  | 'change-input'
  | 'constraint-filter'
  | 'plan-scoring'
  | 'schedule-output';

export interface ProjectMeta {
  /** 项目英文代号 */
  name: string;
  /** 项目中文名称 */
  codeName: string;
  /** 项目定位 */
  positioning: string;
  /** 首版范围说明 */
  scopeNote: string;
  /** 版本标签 */
  version: string;
  /** 更新日期，YYYY-MM-DD */
  updatedOn: string;
}

export interface PhaseMeta {
  id: PhaseId;
  label: string;
  summary: string;
  status: PhaseStatus;
}

export interface WorkflowStep {
  id: WorkflowStepId;
  /** 流程顺序，从 1 开始连续递增 */
  order: number;
  title: string;
  summary: string;
  /** 该步骤的实现归属目录 */
  owner: ModuleDir;
}

export interface ModuleBoundary {
  dir: ModuleDir;
  duty: string;
  status: ModuleStatus;
}

export interface HomePageModel {
  project: ProjectMeta;
  phase: PhaseMeta;
  workflow: readonly WorkflowStep[];
  boundaries: readonly ModuleBoundary[];
}
