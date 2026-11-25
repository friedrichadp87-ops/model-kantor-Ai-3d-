import { AGENT_ORDER, AGENT_PROFILES, CAMERA_PRESETS } from './layout';
import { getHumanAppearance, type HumanAppearanceProfile } from './humanAppearance';
import {
  assignAgentTask,
  completeAgentTask,
  createInitialSimulationState,
  dispatchOfficeCommand,
  failAgentTask,
  stepOfficeSimulation,
} from './simulation';
import type { ShortsChannelId } from './shortsFactory';
import type {
  AgentActivityState,
  AgentId,
  CameraPreset,
  OfficeCommand,
  OfficeSimulationState,
  OfficeZoneId,
} from './types';
import {
  classifyAgentUtilization,
  type UtilizationBucket,
  type UtilizationSlice,
} from './utilization';

export type FloorId = 1 | 2 | 3;
export type FloorViewMode = 'all' | FloorId;

export const FLOOR_ORDER: FloorId[] = [1, 2, 3];
export const FLOOR_HEIGHT = 4.65;
export const EMPLOYEES_PER_FLOOR = AGENT_ORDER.length; // 13
export const TOTAL_BUILDING_EMPLOYEES = FLOOR_ORDER.length * EMPLOYEES_PER_FLOOR; // 39

export interface FloorConfig {
  floorId: FloorId;
  elevationY: number;
  label: string;
  shortLabel: string;
  subtitle: string;
  channelId: ShortsChannelId;
  channelName: string;
  accentHex: string;
  accentColorNum: number;
  geminiEnvVar: string;
  elevenLabsEnvVar: string;
}

export const BUILDING_FLOORS: Record<FloorId, FloorConfig> = {
  1: {
    floorId: 1,
    elevationY: 0,
    label: 'Lantai 1 · Dasar',
    shortLabel: 'L1 · Daily Faith',
    subtitle: 'Renungan Harian, Doa & Penguatan Iman',
    channelId: 'daily-faith-inspiration',
    channelName: 'Daily Faith & Inspiration',
    accentHex: '#d97706',
    accentColorNum: 0xd97706,
    geminiEnvVar: 'GEMINI_API_KEY_DAILY_FAITH',
    elevenLabsEnvVar: 'ELEVENLABS_API_KEY_DAILY_FAITH',
  },
  2: {
    floorId: 2,
    elevationY: FLOOR_HEIGHT,
    label: 'Lantai 2 · Studio 3D',
    shortLabel: 'L2 · Stories 3D',
    subtitle: 'Seri Cerita Alkitab Animasi 3D (Kejadian → Wahyu)',
    channelId: 'bible-stories-3d',
    channelName: 'Bible Stories 3D',
    accentHex: '#2563eb',
    accentColorNum: 0x2563eb,
    geminiEnvVar: 'GEMINI_API_KEY_STORIES_3D',
    elevenLabsEnvVar: 'ELEVENLABS_API_KEY_STORIES_3D',
  },
  3: {
    floorId: 3,
    elevationY: FLOOR_HEIGHT * 2,
    label: 'Lantai 3 · Riset & Fakta',
    shortLabel: 'L3 · Bible Facts',
    subtitle: 'Fakta Sejarah, Tokoh, Tempat & Misteri Alkitab',
    channelId: 'bible-facts-mysteries',
    channelName: 'Bible Facts & Mysteries',
    accentHex: '#059669',
    accentColorNum: 0x059669,
    geminiEnvVar: 'GEMINI_API_KEY_FACTS_MYSTERIES',
    elevenLabsEnvVar: 'ELEVENLABS_API_KEY_FACTS_MYSTERIES',
  },
};

export interface FloorEmployeeIdentity {
  floorId: FloorId;
  agentId: AgentId;
  key: string; // e.g. "f1:ceo"
  name: string;
  shortName: string;
  role: string;
  tagLabel: string;
  accentHex: string;
}

const FLOOR_EMPLOYEE_NAMES: Record<FloorId, Record<AgentId, { name: string; shortName: string }>> = {
  1: {
    ceo: { name: 'Elena Pratama', shortName: 'Elena' },
    'trend-researcher': { name: 'Raka Mahendra', shortName: 'Raka' },
    'bible-researcher': { name: 'Aria Santoso', shortName: 'Aria' },
    scriptwriter: { name: 'Nadia Kusuma', shortName: 'Nadia' },
    'theological-guardian': { name: 'Dharma Wijaya', shortName: 'Dharma' },
    'pastoral-checker': { name: 'Clara Hartono', shortName: 'Clara' },
    'storyboard-artist': { name: 'Citra Lestari', shortName: 'Citra' },
    'visual-curator': { name: 'Kevin Suryadi', shortName: 'Kevin' },
    'video-composer': { name: 'Bima Saputra', shortName: 'Bima' },
    'voice-artist': { name: 'Sora Permata', shortName: 'Sora' },
    'video-editor': { name: 'Reza Nugroho', shortName: 'Reza' },
    'seo-publisher': { name: 'Tania Wibowo', shortName: 'Tania' },
    'community-prayer': { name: 'Hanna Setiawan', shortName: 'Hanna' },
  },
  2: {
    ceo: { name: 'Maya Kartika', shortName: 'Maya' },
    'trend-researcher': { name: 'Bagas Prawira', shortName: 'Bagas' },
    'bible-researcher': { name: 'Lukas Tanuwijaya', shortName: 'Lukas' },
    scriptwriter: { name: 'Putri Anggraini', shortName: 'Putri' },
    'theological-guardian': { name: 'Daniel Gunawan', shortName: 'Daniel' },
    'pastoral-checker': { name: 'Esther Halim', shortName: 'Esther' },
    'storyboard-artist': { name: 'Farah Salsabila', shortName: 'Farah' },
    'visual-curator': { name: 'Dion Prasetyo', shortName: 'Dion' },
    'video-composer': { name: 'Reno Iskandar', shortName: 'Reno' },
    'voice-artist': { name: 'Alya Ramadhani', shortName: 'Alya' },
    'video-editor': { name: 'Vino Kurniawan', shortName: 'Vino' },
    'seo-publisher': { name: 'Shinta Marlina', shortName: 'Shinta' },
    'community-prayer': { name: 'Grace Natalia', shortName: 'Grace' },
  },
  3: {
    ceo: { name: 'Andi Budiman', shortName: 'Andi' },
    'trend-researcher': { name: 'Gita Permatasari', shortName: 'Gita' },
    'bible-researcher': { name: 'Samuel Hutagalung', shortName: 'Samuel' },
    scriptwriter: { name: 'Dewi Sartika', shortName: 'Dewi' },
    'theological-guardian': { name: 'Yosef Kristianto', shortName: 'Yosef' },
    'pastoral-checker': { name: 'Naomi Salim', shortName: 'Naomi' },
    'storyboard-artist': { name: 'Rizky Fadillah', shortName: 'Rizky' },
    'visual-curator': { name: 'Galih Wicaksono', shortName: 'Galih' },
    'video-composer': { name: 'Fajar Hidayat', shortName: 'Fajar' },
    'voice-artist': { name: 'Larasati Putri', shortName: 'Laras' },
    'video-editor': { name: 'Bayu Setiadi', shortName: 'Bayu' },
    'seo-publisher': { name: 'Cindy Oktavia', shortName: 'Cindy' },
    'community-prayer': { name: 'Ruth Magdalena', shortName: 'Ruth' },
  },
};

export function makeFloorAgentKey(floorId: FloorId, agentId: AgentId): string {
  return `f${floorId}:${agentId}`;
}

export function getFloorConfig(floorId: FloorId): FloorConfig {
  return BUILDING_FLOORS[floorId];
}

export function getFloorByChannelId(channelId: ShortsChannelId): FloorConfig {
  for (const floorId of FLOOR_ORDER) {
    if (BUILDING_FLOORS[floorId].channelId === channelId) {
      return BUILDING_FLOORS[floorId];
    }
  }
  return BUILDING_FLOORS[1];
}

export function getChannelIdByFloor(floorId: FloorId): ShortsChannelId {
  return BUILDING_FLOORS[floorId].channelId;
}

export function isFloorId(value: unknown): value is FloorId {
  return value === 1 || value === 2 || value === 3;
}

export function getFloorEmployeeIdentity(
  floorId: FloorId,
  agentId: AgentId
): FloorEmployeeIdentity {
  const base = AGENT_PROFILES[agentId];
  const floorCfg = BUILDING_FLOORS[floorId];
  const person = FLOOR_EMPLOYEE_NAMES[floorId][agentId];
  const roleShort = base.tagLabel.includes('·')
    ? base.tagLabel.split('·')[1].trim()
    : base.role;

  return {
    floorId,
    agentId,
    key: makeFloorAgentKey(floorId, agentId),
    name: person.name,
    shortName: person.shortName,
    role: base.role,
    tagLabel: `L${floorId} · ${person.shortName} · ${roleShort}`,
    accentHex: floorCfg.accentHex,
  };
}

export function getAllBuildingEmployees(): FloorEmployeeIdentity[] {
  const list: FloorEmployeeIdentity[] = [];
  for (const floorId of FLOOR_ORDER) {
    for (const agentId of AGENT_ORDER) {
      list.push(getFloorEmployeeIdentity(floorId, agentId));
    }
  }
  return list;
}

/**
 * Generates visually distinct human appearance per floor while preserving natural skin tones,
 * varied hairstyles, and floor-harmonized studio attire across all 39 human employees.
 */
const FLOOR_TOP_PALETTES: Record<FloorId, string[]> = {
  1: ['#c9821e', '#b45309', '#d97706', '#92400e', '#a16207', '#78350f', '#c2410c'],
  2: ['#1d4ed8', '#2563eb', '#0284c7', '#1e40af', '#4338ca', '#0369a1', '#3b82f6'],
  3: ['#047857', '#059669', '#0f766e', '#065f46', '#15803d', '#0d9488', '#115e59'],
};

const FLOOR_SKIN_ROTATION: string[] = [
  '#efc4a3',
  '#ddab84',
  '#f0c9aa',
  '#e4b28a',
  '#cc956c',
  '#f2cbb0',
  '#e2af88',
  '#d59f77',
  '#c88f67',
];

const FLOOR_HAIR_ROTATION: string[] = [
  '#1d1917',
  '#2c1f18',
  '#3c271d',
  '#18181c',
  '#43281d',
  '#27242a',
];

export function getFloorHumanAppearance(
  floorId: FloorId,
  agentId: AgentId
): HumanAppearanceProfile {
  const base = getHumanAppearance(agentId);
  if (floorId === 1) {
    return base;
  }
  const idx = AGENT_ORDER.indexOf(agentId);
  const shift = floorId === 2 ? 3 : 6;
  const palette = FLOOR_TOP_PALETTES[floorId];
  return {
    ...base,
    skinHex: FLOOR_SKIN_ROTATION[(idx + shift) % FLOOR_SKIN_ROTATION.length],
    hairHex: FLOOR_HAIR_ROTATION[(idx + shift) % FLOOR_HAIR_ROTATION.length],
    topHex: palette[(idx + floorId) % palette.length],
    heightScale: Math.min(1.04, Math.max(0.95, base.heightScale + (floorId === 2 ? 0.01 : -0.01))),
  };
}

export interface BuildingSimulationState {
  floors: Record<FloorId, OfficeSimulationState>;
  elapsedSeconds: number;
  completedTaskCount: number;
}

export function createInitialBuildingState(): BuildingSimulationState {
  const floors = {} as Record<FloorId, OfficeSimulationState>;

  for (const floorId of FLOOR_ORDER) {
    const baseSim = createInitialSimulationState();
    const floorCfg = BUILDING_FLOORS[floorId];
    const staggeredAgents = { ...baseSim.agents };

    AGENT_ORDER.forEach((agentId, idx) => {
      const identity = getFloorEmployeeIdentity(floorId, agentId);
      const a = staggeredAgents[agentId];
      staggeredAgents[agentId] = {
        ...a,
        name: identity.name,
        accentHex: floorCfg.accentHex,
        // Stagger autonomous timers across floors so all 39 humans move organically, never in lockstep
        stateTimer: a.stateTimer + (floorId - 1) * 4.3 + ((idx * 1.7) % 3.5),
      };
    });

    floors[floorId] = {
      ...baseSim,
      agents: staggeredAgents,
    };
  }

  return {
    floors,
    elapsedSeconds: 0,
    completedTaskCount: 0,
  };
}

export function stepBuildingSimulation(
  state: BuildingSimulationState,
  dt: number
): BuildingSimulationState {
  const f1 = stepOfficeSimulation(state.floors[1], dt);
  const f2 = stepOfficeSimulation(state.floors[2], dt);
  const f3 = stepOfficeSimulation(state.floors[3], dt);

  return {
    floors: { 1: f1, 2: f2, 3: f3 },
    elapsedSeconds: f1.elapsedSeconds,
    completedTaskCount: f1.completedTaskCount + f2.completedTaskCount + f3.completedTaskCount,
  };
}

export function dispatchBuildingCommand(
  state: BuildingSimulationState,
  command: OfficeCommand,
  scope: FloorViewMode = 'all'
): BuildingSimulationState {
  const nextFloors = { ...state.floors };
  const targetFloors: FloorId[] = scope === 'all' ? FLOOR_ORDER : [scope];

  for (const floorId of targetFloors) {
    nextFloors[floorId] = dispatchOfficeCommand(state.floors[floorId], command);
  }

  return {
    ...state,
    floors: nextFloors,
  };
}

export function assignFloorAgentTask(
  state: BuildingSimulationState,
  floorId: FloorId,
  agentId: AgentId,
  taskId: string,
  prompt: string
): BuildingSimulationState {
  return {
    ...state,
    floors: {
      ...state.floors,
      [floorId]: assignAgentTask(state.floors[floorId], agentId, taskId, prompt),
    },
  };
}

export function completeFloorAgentTask(
  state: BuildingSimulationState,
  floorId: FloorId,
  agentId: AgentId,
  taskId: string
): BuildingSimulationState {
  const nextFloor = completeAgentTask(state.floors[floorId], agentId, taskId);
  const nextFloors = {
    ...state.floors,
    [floorId]: nextFloor,
  };
  return {
    ...state,
    floors: nextFloors,
    completedTaskCount:
      nextFloors[1].completedTaskCount +
      nextFloors[2].completedTaskCount +
      nextFloors[3].completedTaskCount,
  };
}

export function failFloorAgentTask(
  state: BuildingSimulationState,
  floorId: FloorId,
  agentId: AgentId,
  taskId: string
): BuildingSimulationState {
  return {
    ...state,
    floors: {
      ...state.floors,
      [floorId]: failAgentTask(state.floors[floorId], agentId, taskId),
    },
  };
}

export interface FloorUtilizationRow {
  floorId: FloorId;
  shortLabel: string;
  channelName: string;
  accentHex: string;
  total: number;
  activeCount: number;
  idleCount: number;
  utilizationPercent: number;
}

export interface BuildingAgentUtilizationItem {
  floorId: FloorId;
  id: AgentId;
  key: string;
  name: string;
  role: string;
  accentHex: string;
  bucket: UtilizationBucket;
  activity: AgentActivityState;
  activityLabel: string;
  statusLabel: string;
  hasAssignedTask: boolean;
}

export interface BuildingUtilizationSummary {
  total: number;
  activeCount: number;
  idleCount: number;
  executingTaskCount: number;
  utilizationPercent: number;
  slices: UtilizationSlice[];
  byFloor: FloorUtilizationRow[];
  agents: BuildingAgentUtilizationItem[];
}

const ACTIVITY_LABELS: Record<AgentActivityState, string> = {
  working: 'Bekerja',
  executing_task: 'Tugas AI',
  meeting: 'Rapat Tim',
  server_check: 'Cek Server',
  walking: 'Transit',
  coffee_break: 'Rehat Kopi',
};

export function computeBuildingUtilization(
  state: BuildingSimulationState,
  floorView: FloorViewMode = 'all'
): BuildingUtilizationSummary {
  const targetFloors: FloorId[] = floorView === 'all' ? FLOOR_ORDER : [floorView];
  const agents: BuildingAgentUtilizationItem[] = [];
  const byFloor: FloorUtilizationRow[] = [];

  let totalActive = 0;
  let totalIdle = 0;
  let totalExecuting = 0;

  for (const floorId of FLOOR_ORDER) {
    const floorState = state.floors[floorId];
    const floorCfg = BUILDING_FLOORS[floorId];
    let floorActive = 0;
    let floorIdle = 0;

    for (const agentId of AGENT_ORDER) {
      const a = floorState.agents[agentId];
      if (!a) continue;
      const hasAssignedTask = Boolean(a.activeTaskId);
      const bucket = classifyAgentUtilization(a.activity, hasAssignedTask);
      if (bucket === 'active') floorActive += 1;
      else floorIdle += 1;

      if (targetFloors.includes(floorId)) {
        if (bucket === 'active') totalActive += 1;
        else totalIdle += 1;
        if (hasAssignedTask || a.activity === 'executing_task') {
          totalExecuting += 1;
        }
        agents.push({
          floorId,
          id: agentId,
          key: makeFloorAgentKey(floorId, agentId),
          name: a.name,
          role: a.role,
          accentHex: floorCfg.accentHex,
          bucket,
          activity: a.activity,
          activityLabel: ACTIVITY_LABELS[a.activity],
          statusLabel: a.statusLabel,
          hasAssignedTask,
        });
      }
    }

    const floorTotal = floorActive + floorIdle;
    byFloor.push({
      floorId,
      shortLabel: floorCfg.shortLabel,
      channelName: floorCfg.channelName,
      accentHex: floorCfg.accentHex,
      total: floorTotal,
      activeCount: floorActive,
      idleCount: floorIdle,
      utilizationPercent: floorTotal > 0 ? Math.round((floorActive / floorTotal) * 100) : 0,
    });
  }

  const total = totalActive + totalIdle;
  const utilizationPercent = total > 0 ? Math.round((totalActive / total) * 100) : 0;
  const idlePercent = total > 0 ? 100 - utilizationPercent : 0;

  return {
    total,
    activeCount: totalActive,
    idleCount: totalIdle,
    executingTaskCount: totalExecuting,
    utilizationPercent,
    slices: [
      { key: 'active', label: 'Aktif', count: totalActive, percent: utilizationPercent },
      { key: 'idle', label: 'Siaga', count: totalIdle, percent: idlePercent },
    ],
    byFloor,
    agents,
  };
}

/**
 * Computes elevated 3D camera coordinates for either the full 3-story tower view ('all')
 * or a dedicated architectural cutaway on Lantai 1, Lantai 2, or Lantai 3.
 */
export function getFloorCameraPreset(
  zoneId: OfficeZoneId,
  floorView: FloorViewMode
): CameraPreset {
  if (floorView === 'all' && zoneId === 'overview') {
    return {
      id: 'overview',
      label: 'Menara 3 Lantai',
      position: { x: 24.4, y: 17.8, z: 25.4 },
      target: { x: 0.4, y: 4.9, z: 0.2 },
    };
  }

  const floorId: FloorId = floorView === 'all' ? 2 : floorView;
  const yOffset = BUILDING_FLOORS[floorId].elevationY;
  const base = CAMERA_PRESETS[zoneId];

  return {
    id: zoneId,
    label: base.label,
    position: {
      x: base.position.x,
      y: base.position.y + yOffset,
      z: base.position.z,
    },
    target: {
      x: base.target.x,
      y: base.target.y + yOffset,
      z: base.target.z,
    },
  };
}
