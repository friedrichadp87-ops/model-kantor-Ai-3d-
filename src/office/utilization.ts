import { AGENT_ORDER } from './layout';
import type { AgentActivityState, AgentId, OfficeSimulationState } from './types';

export type UtilizationBucket = 'active' | 'idle';

export interface UtilizationSlice {
  key: UtilizationBucket;
  label: string;
  count: number;
  percent: number;
}

export interface AgentUtilizationItem {
  id: AgentId;
  name: string;
  role: string;
  accentHex: string;
  bucket: UtilizationBucket;
  activity: AgentActivityState;
  activityLabel: string;
  statusLabel: string;
  hasAssignedTask: boolean;
}

export interface UtilizationSummary {
  total: number;
  activeCount: number;
  idleCount: number;
  executingTaskCount: number;
  utilizationPercent: number;
  slices: UtilizationSlice[];
  agents: AgentUtilizationItem[];
}

const ACTIVITY_LABELS: Record<AgentActivityState, string> = {
  working: 'Bekerja',
  executing_task: 'Tugas AI',
  meeting: 'Rapat Tim',
  server_check: 'Cek Server',
  walking: 'Transit',
  coffee_break: 'Rehat Kopi',
};

/**
 * Classifies an agent into 'active' (producing work, in meeting, checking server,
 * or heading to an assigned user task) versus 'idle' (on coffee break or non-task transit).
 */
export function classifyAgentUtilization(
  activity: AgentActivityState,
  hasAssignedTask: boolean
): UtilizationBucket {
  if (hasAssignedTask) return 'active';
  if (
    activity === 'working' ||
    activity === 'executing_task' ||
    activity === 'meeting' ||
    activity === 'server_check'
  ) {
    return 'active';
  }
  return 'idle';
}

export function computeUtilizationSummary(
  state: OfficeSimulationState
): UtilizationSummary {
  const agents: AgentUtilizationItem[] = [];
  let activeCount = 0;
  let idleCount = 0;
  let executingTaskCount = 0;

  for (const id of AGENT_ORDER) {
    const a = state.agents[id];
    if (!a) continue;

    const hasAssignedTask = Boolean(a.activeTaskId);
    const bucket = classifyAgentUtilization(a.activity, hasAssignedTask);
    if (bucket === 'active') activeCount += 1;
    else idleCount += 1;
    if (hasAssignedTask || a.activity === 'executing_task') {
      executingTaskCount += 1;
    }

    agents.push({
      id: a.id,
      name: a.name,
      role: a.role,
      accentHex: a.accentHex,
      bucket,
      activity: a.activity,
      activityLabel: ACTIVITY_LABELS[a.activity],
      statusLabel: a.statusLabel,
      hasAssignedTask,
    });
  }

  const total = agents.length;
  const utilizationPercent =
    total > 0 ? Math.round((activeCount / total) * 100) : 0;
  const idlePercent = total > 0 ? 100 - utilizationPercent : 0;

  const slices: UtilizationSlice[] = [
    {
      key: 'active',
      label: 'Aktif',
      count: activeCount,
      percent: utilizationPercent,
    },
    {
      key: 'idle',
      label: 'Siaga',
      count: idleCount,
      percent: idlePercent,
    },
  ];

  return {
    total,
    activeCount,
    idleCount,
    executingTaskCount,
    utilizationPercent,
    slices,
    agents,
  };
}
