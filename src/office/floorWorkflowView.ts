import {
  BUILDING_FLOORS,
  computeBuildingUtilization,
  getFloorEmployeeIdentity,
  makeFloorAgentKey,
  type BuildingSimulationState,
  type FloorConfig,
  type FloorId,
} from './buildingFloors';
import {
  CHANNEL_KEY_ROUTING,
  CHANNEL_WORKFLOW_BLUEPRINTS,
  type ChannelKeyRoutingDescriptor,
  type ChannelWorkflowBlueprint,
  type PipelineStageId,
} from './productionPipeline';
import {
  getChannelById,
  type ChannelTemplateConfig,
  type ChannelTemplatesMap,
  type ShortsQueueItem,
  type YouTubeShortsChannel,
} from './shortsFactory';
import type { AgentActivityState, AgentId, TaskEntry } from './types';
import type { WorkspaceDivisionId } from './workspaceDivisions';

export type FloorDivisionId = 'lantai-1' | 'lantai-2' | 'lantai-3';

export interface FloorWorkflowEmployeeRef {
  agentId: AgentId;
  floorId: FloorId;
  name: string;
  shortName: string;
  role: string;
  activity: AgentActivityState;
  activityLabel: string;
  statusLabel: string;
  hasActiveTask: boolean;
  completedTaskCount: number;
}

export interface FloorWorkflowStageItem {
  id: PipelineStageId;
  order: number;
  title: string;
  subtitle: string;
  deliverableLabel: string;
  phaseLabel: string;
  apiSlotLabel: string;
  leadEmployee: FloorWorkflowEmployeeRef;
  supportEmployees: FloorWorkflowEmployeeRef[];
}

export interface FloorWorkflowSnapshot {
  floorConfig: FloorConfig;
  channelConfig: YouTubeShortsChannel;
  keyRouting: ChannelKeyRoutingDescriptor;
  blueprint: ChannelWorkflowBlueprint;
  template: ChannelTemplateConfig;
  stages: FloorWorkflowStageItem[];
  channelQueue: ShortsQueueItem[];
  stats: {
    activeEmployees: number;
    totalEmployees: number;
    utilizationPercent: number;
    queueTotal: number;
    readyCount: number;
    publishedCount: number;
    runningTaskCount: number;
    completedTaskCount: number;
  };
}

const ACTIVITY_LABELS: Record<AgentActivityState, string> = {
  working: 'Bekerja',
  executing_task: 'Tugas AI',
  meeting: 'Rapat Tim',
  server_check: 'Cek Server',
  walking: 'Transit',
  coffee_break: 'Rehat Kopi',
};

const STAGE_PHASE_LABELS: Record<PipelineStageId, string> = {
  story_plan: 'Riset & Perencanaan',
  script_arc: 'Penulisan Naskah',
  timestamps: 'Timestamp & Adegan',
  keyframes: 'Visual Patokan',
  animations: 'Animasi Adegan',
  narration_audio: 'Audio Narasi',
  av_sync_check: 'QC Tahap 1 (Audio–Video)',
  assemble_video: 'Penyatuan Editor',
  final_qc: 'QC Tahap 2 (Akhir)',
};

export function getFloorIdFromDivision(divisionId: WorkspaceDivisionId): FloorId | null {
  if (divisionId === 'lantai-1') return 1;
  if (divisionId === 'lantai-2') return 2;
  if (divisionId === 'lantai-3') return 3;
  return null;
}

export function getDivisionIdFromFloor(floorId: FloorId): FloorDivisionId {
  if (floorId === 1) return 'lantai-1';
  if (floorId === 2) return 'lantai-2';
  return 'lantai-3';
}

export function resolveStageApiSlot(
  stageId: PipelineStageId,
  routing: ChannelKeyRoutingDescriptor
): string {
  if (stageId === 'narration_audio') {
    return routing.elevenLabsEnvVar;
  }
  return routing.geminiEnvVar;
}

function buildEmployeeRef(
  floorId: FloorId,
  agentId: AgentId,
  buildingState: BuildingSimulationState,
  tasksByFloorAgent: Record<string, TaskEntry[]>
): FloorWorkflowEmployeeRef {
  const identity = getFloorEmployeeIdentity(floorId, agentId);
  const simAgent = buildingState.floors[floorId].agents[agentId];
  const tasks = tasksByFloorAgent[makeFloorAgentKey(floorId, agentId)] ?? [];
  const completedTaskCount = tasks.filter((t) => t.status === 'completed').length;
  const hasRunningManual = tasks.some((t) => t.status === 'running');
  const activity: AgentActivityState = simAgent?.activity ?? 'working';

  return {
    agentId,
    floorId,
    name: identity.name,
    shortName: identity.shortName,
    role: identity.role,
    activity,
    activityLabel: ACTIVITY_LABELS[activity],
    statusLabel: simAgent?.statusLabel ?? 'Siap menerima instruksi',
    hasActiveTask: Boolean(simAgent?.activeTaskId) || hasRunningManual,
    completedTaskCount,
  };
}

export function buildFloorWorkflowSnapshot(params: {
  floorId: FloorId;
  buildingState: BuildingSimulationState;
  shortsQueue: ShortsQueueItem[];
  channelTemplates: ChannelTemplatesMap;
  tasksByFloorAgent: Record<string, TaskEntry[]>;
}): FloorWorkflowSnapshot {
  const { floorId, buildingState, shortsQueue, channelTemplates, tasksByFloorAgent } = params;
  const floorConfig = BUILDING_FLOORS[floorId];
  const channelConfig = getChannelById(floorConfig.channelId);
  const keyRouting = CHANNEL_KEY_ROUTING[floorConfig.channelId];
  const blueprint = CHANNEL_WORKFLOW_BLUEPRINTS[floorConfig.channelId];
  const template = channelTemplates[floorConfig.channelId];

  const util = computeBuildingUtilization(buildingState, floorId);
  const channelQueue = shortsQueue.filter((item) => item.channelId === floorConfig.channelId);

  let runningTaskCount = 0;
  let completedTaskCount = 0;
  for (const [key, list] of Object.entries(tasksByFloorAgent)) {
    if (!key.startsWith(`f${floorId}:`)) continue;
    for (const task of list) {
      if (task.status === 'running') runningTaskCount += 1;
      if (task.status === 'completed') completedTaskCount += 1;
    }
  }

  const stages: FloorWorkflowStageItem[] = blueprint.stages.map((stage) => ({
    id: stage.id,
    order: stage.order,
    title: stage.title,
    subtitle: stage.subtitle,
    deliverableLabel: stage.deliverableLabel,
    phaseLabel: STAGE_PHASE_LABELS[stage.id],
    apiSlotLabel: resolveStageApiSlot(stage.id, keyRouting),
    leadEmployee: buildEmployeeRef(floorId, stage.leadAgentId, buildingState, tasksByFloorAgent),
    supportEmployees: stage.supportAgentIds.map((id) =>
      buildEmployeeRef(floorId, id, buildingState, tasksByFloorAgent)
    ),
  }));

  return {
    floorConfig,
    channelConfig,
    keyRouting,
    blueprint,
    template,
    stages,
    channelQueue,
    stats: {
      activeEmployees: util.activeCount,
      totalEmployees: util.total,
      utilizationPercent: util.utilizationPercent,
      queueTotal: channelQueue.length,
      readyCount: channelQueue.filter((q) => q.stage === 'Siap Publikasi').length,
      publishedCount: channelQueue.filter((q) => q.stage === 'Sudah Terbit (manual)').length,
      runningTaskCount,
      completedTaskCount,
    },
  };
}
