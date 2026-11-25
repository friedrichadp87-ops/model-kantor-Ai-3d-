import {
  BUILDING_FLOORS,
  FLOOR_ORDER,
  getFloorEmployeeIdentity,
  isFloorId,
  makeFloorAgentKey,
  type BuildingSimulationState,
  type FloorId,
} from './buildingFloors';
import { AGENT_ORDER } from './layout';
import type { ShortsQueueItem } from './shortsFactory';
import { validateTaskPrompt } from './simulation';
import type {
  AgentActivityState,
  AgentId,
  OfficeSimulationState,
  TaskEntry,
} from './types';
import { classifyAgentUtilization, type UtilizationBucket } from './utilization';

export type FloorEmployeeFilter = 'all' | 'active' | 'idle' | 'executing';

export interface FloorEmployeePerformanceRow {
  floorId: FloorId;
  agentId: AgentId;
  key: string;
  name: string;
  shortName: string;
  role: string;
  accentHex: string;
  activity: AgentActivityState;
  activityLabel: string;
  statusLabel: string;
  bucket: UtilizationBucket;
  isExecuting: boolean;
  runningTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalTasks: number;
  latestTask: TaskEntry | null;
}

export interface FloorPerformanceMetrics {
  floorId: FloorId;
  label: string;
  shortLabel: string;
  channelId: string;
  channelName: string;
  subtitle: string;
  accentHex: string;
  geminiEnvVar: string;
  officeMode: OfficeSimulationState['officeMode'];
  officeModeLabel: string;
  totalAgents: number;
  activeAgents: number;
  idleAgents: number;
  executingAgents: number;
  utilizationPercent: number;
  runningTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalTasks: number;
  completionRatePercent: number | null;
  shortsTotalCount: number;
  shortsReadyCount: number;
  employees: FloorEmployeePerformanceRow[];
  recentTasks: Array<TaskEntry & { floorId: FloorId; employeeName: string; employeeRole: string }>;
}

export interface FloorQuickPromptPreset {
  id: string;
  label: string;
  recommendedAgentId: AgentId;
  prompt: string;
}

const ACTIVITY_LABELS: Record<AgentActivityState, string> = {
  working: 'Bekerja',
  executing_task: 'Tugas AI',
  meeting: 'Rapat Tim',
  server_check: 'Cek Server',
  walking: 'Transit',
  coffee_break: 'Rehat Kopi',
};

const OFFICE_MODE_LABELS: Record<OfficeSimulationState['officeMode'], string> = {
  kerja: 'Mode Kerja',
  rapat: 'Rapat Tim',
  istirahat: 'Rehat Kopi',
};

export const FLOOR_QUICK_PROMPTS: Record<FloorId, FloorQuickPromptPreset[]> = {
  1: [
    {
      id: 'df-devotional',
      label: 'Naskah Renungan 45d',
      recommendedAgentId: 'scriptwriter',
      prompt:
        'Susun naskah YouTube Shorts 45 detik Daily Faith tentang damai sejahtera dari Mazmur 23 lengkap dengan hook 3 detik dan doa penutup.',
    },
    {
      id: 'df-guardian',
      label: 'Audit Ayat & Pastoral',
      recommendedAgentId: 'theological-guardian',
      prompt:
        'Verifikasi ketepatan referensi ayat Terjemahan Baru dan nada pastoral untuk episode renungan penguatan iman harian.',
    },
    {
      id: 'df-seo',
      label: 'Judul & SEO Harian',
      recommendedAgentId: 'seo-publisher',
      prompt:
        'Buatkan 3 opsi judul, deskripsi singkat, dan tagar relevan untuk Shorts renungan pagi Daily Faith & Inspiration.',
    },
  ],
  2: [
    {
      id: 'bs-story-arc',
      label: 'Alur Cerita 3D',
      recommendedAgentId: 'scriptwriter',
      prompt:
        'Rancang alur naskah animasi 3D episode Daud dan Goliat dengan pembagian adegan dan timestamp percakapan yang jelas.',
    },
    {
      id: 'bs-storyboard',
      label: 'Storyboard 9:16',
      recommendedAgentId: 'storyboard-artist',
      prompt:
        'Susun 5 prompt gambar patokan 3D sinematik vertikal 9:16 untuk adegan penyeberangan Laut Merah di Bible Stories 3D.',
    },
    {
      id: 'bs-voice',
      label: 'Arahan Narasi Suara',
      recommendedAgentId: 'voice-artist',
      prompt:
        'Siapkan arahan intonasi, jeda dramatis, dan penekanan suara narator untuk episode cerita Nabi Nuh 60 detik.',
    },
  ],
  3: [
    {
      id: 'bf-research',
      label: 'Riset Fakta Sejarah',
      recommendedAgentId: 'bible-researcher',
      prompt:
        'Riset 5 fakta arkeologi dan sejarah Alkitab yang terverifikasi tentang kota Yerusalem kuno beserta rujukan pasalnya.',
    },
    {
      id: 'bf-trend',
      label: 'Riset Topik Misteri',
      recommendedAgentId: 'trend-researcher',
      prompt:
        'Identifikasi 5 ide topik misteri dan tokoh Alkitab dengan potensi retensi tinggi untuk kalender Bible Facts & Mysteries minggu ini.',
    },
    {
      id: 'bf-editor',
      label: 'Struktur Klip & SRT',
      recommendedAgentId: 'video-editor',
      prompt:
        'Rancang ritme pemotongan visual dan panduan subtitle cepat untuk video Shorts 45 detik fakta sejarah Bait Allah.',
    },
  ],
};

export function computeFloorPerformanceMetrics(
  buildingState: BuildingSimulationState,
  tasksByFloorAgent: Record<string, TaskEntry[]>,
  shortsQueue: ShortsQueueItem[]
): Record<FloorId, FloorPerformanceMetrics> {
  const result = {} as Record<FloorId, FloorPerformanceMetrics>;

  for (const floorId of FLOOR_ORDER) {
    const floorCfg = BUILDING_FLOORS[floorId];
    const floorSim = buildingState.floors[floorId];

    let activeAgents = 0;
    let idleAgents = 0;
    let executingAgents = 0;
    let runningTasks = 0;
    let completedTasks = 0;
    let failedTasks = 0;

    const employees: FloorEmployeePerformanceRow[] = [];
    const recentTasks: Array<
      TaskEntry & { floorId: FloorId; employeeName: string; employeeRole: string }
    > = [];

    for (const agentId of AGENT_ORDER) {
      const agent = floorSim.agents[agentId];
      if (!agent) continue;

      const identity = getFloorEmployeeIdentity(floorId, agentId);
      const key = makeFloorAgentKey(floorId, agentId);
      const agentTasks = tasksByFloorAgent[key] ?? [];

      let empRunning = 0;
      let empCompleted = 0;
      let empFailed = 0;
      for (const task of agentTasks) {
        if (task.status === 'running') empRunning += 1;
        else if (task.status === 'completed') empCompleted += 1;
        else if (task.status === 'error') empFailed += 1;

        recentTasks.push({
          ...task,
          floorId,
          employeeName: identity.name,
          employeeRole: identity.role,
        });
      }

      const isExecuting =
        Boolean(agent.activeTaskId) || agent.activity === 'executing_task' || empRunning > 0;
      const bucket = classifyAgentUtilization(agent.activity, isExecuting);

      if (bucket === 'active') activeAgents += 1;
      else idleAgents += 1;
      if (isExecuting) executingAgents += 1;

      runningTasks += empRunning;
      completedTasks += empCompleted;
      failedTasks += empFailed;

      employees.push({
        floorId,
        agentId,
        key,
        name: identity.name,
        shortName: identity.shortName,
        role: identity.role,
        accentHex: floorCfg.accentHex,
        activity: agent.activity,
        activityLabel: ACTIVITY_LABELS[agent.activity],
        statusLabel: agent.statusLabel,
        bucket,
        isExecuting,
        runningTasks: empRunning,
        completedTasks: empCompleted,
        failedTasks: empFailed,
        totalTasks: agentTasks.length,
        latestTask: agentTasks[0] ?? null,
      });
    }

    recentTasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const totalAgents = activeAgents + idleAgents;
    const utilizationPercent =
      totalAgents > 0 ? Math.round((activeAgents / totalAgents) * 100) : 0;
    const settledTasks = completedTasks + failedTasks;
    const completionRatePercent =
      settledTasks > 0 ? Math.round((completedTasks / settledTasks) * 100) : null;

    const floorShorts = shortsQueue.filter((item) => item.channelId === floorCfg.channelId);
    const shortsReadyCount = floorShorts.filter(
      (item) => item.stage === 'Siap Publikasi' || item.stage === 'Sudah Terbit (manual)'
    ).length;

    result[floorId] = {
      floorId,
      label: floorCfg.label,
      shortLabel: floorCfg.shortLabel,
      channelId: floorCfg.channelId,
      channelName: floorCfg.channelName,
      subtitle: floorCfg.subtitle,
      accentHex: floorCfg.accentHex,
      geminiEnvVar: floorCfg.geminiEnvVar,
      officeMode: floorSim.officeMode,
      officeModeLabel: OFFICE_MODE_LABELS[floorSim.officeMode],
      totalAgents,
      activeAgents,
      idleAgents,
      executingAgents,
      utilizationPercent,
      runningTasks,
      completedTasks,
      failedTasks,
      totalTasks: runningTasks + completedTasks + failedTasks,
      completionRatePercent,
      shortsTotalCount: floorShorts.length,
      shortsReadyCount,
      employees,
      recentTasks: recentTasks.slice(0, 8),
    };
  }

  return result;
}

export function filterFloorEmployees(
  employees: FloorEmployeePerformanceRow[],
  filter: FloorEmployeeFilter,
  query: string
): FloorEmployeePerformanceRow[] {
  const q = query.trim().toLowerCase();
  return employees.filter((row) => {
    if (filter === 'active' && row.bucket !== 'active') return false;
    if (filter === 'idle' && row.bucket !== 'idle') return false;
    if (filter === 'executing' && !row.isExecuting) return false;
    if (!q) return true;
    return (
      row.name.toLowerCase().includes(q) ||
      row.shortName.toLowerCase().includes(q) ||
      row.role.toLowerCase().includes(q) ||
      row.activityLabel.toLowerCase().includes(q) ||
      row.statusLabel.toLowerCase().includes(q)
    );
  });
}

export function validateFloorAssignment(input: {
  floorId: unknown;
  agentId: unknown;
  prompt: string;
}): {
  valid: boolean;
  floorId?: FloorId;
  agentId?: AgentId;
  trimmedPrompt?: string;
  error?: string;
} {
  if (!isFloorId(input.floorId)) {
    return { valid: false, error: 'Pilih lantai tujuan yang valid (Lantai 1, 2, atau 3).' };
  }
  if (typeof input.agentId !== 'string' || !AGENT_ORDER.includes(input.agentId as AgentId)) {
    return { valid: false, error: 'Pilih karyawan AI tujuan pada lantai tersebut.' };
  }
  const promptCheck = validateTaskPrompt(input.prompt);
  if (!promptCheck.valid) {
    return { valid: false, error: promptCheck.error };
  }
  return {
    valid: true,
    floorId: input.floorId,
    agentId: input.agentId as AgentId,
    trimmedPrompt: promptCheck.trimmed,
  };
}
