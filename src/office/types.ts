export type AgentId =
  | 'ceo'
  | 'trend-researcher'
  | 'bible-researcher'
  | 'scriptwriter'
  | 'theological-guardian'
  | 'pastoral-checker'
  | 'storyboard-artist'
  | 'visual-curator'
  | 'video-composer'
  | 'voice-artist'
  | 'video-editor'
  | 'seo-publisher'
  | 'community-prayer';

export type OfficeZoneId = 'overview' | 'riset' | 'kode' | 'rapat' | 'server' | 'lounge';

export type LightingPreset = 'pagi' | 'sore' | 'malam';

export type AgentActivityState =
  | 'working'
  | 'walking'
  | 'meeting'
  | 'server_check'
  | 'coffee_break'
  | 'executing_task';

export type OfficeCommand = 'standup' | 'coffee_break' | 'back_to_work';

export interface Vec2 {
  x: number;
  z: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface WaypointNode {
  id: string;
  x: number;
  z: number;
  neighbors: string[];
  facingYaw?: number;
  seated?: boolean;
  zone: Exclude<OfficeZoneId, 'overview'>;
}

export interface AgentProfile {
  id: AgentId;
  name: string;
  shortName: string;
  role: string;
  tagLabel: string;
  accentHex: string;
  homeWaypointId: string;
  meetingWaypointId: string;
  loungeWaypointId: string;
  defaultStatusText: string;
  samplePrompts: string[];
}

export interface TaskEntry {
  id: string;
  agentId: AgentId;
  prompt: string;
  status: 'running' | 'completed' | 'error';
  output?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface AgentRuntimeState {
  id: AgentId;
  name: string;
  role: string;
  accentHex: string;
  x: number;
  z: number;
  yaw: number;
  seated: boolean;
  activity: AgentActivityState;
  statusLabel: string;
  currentZone: Exclude<OfficeZoneId, 'overview'>;
  currentWaypointId: string;
  targetWaypointId: string;
  pathQueue: string[];
  targetActivity: AgentActivityState;
  targetStatusLabel: string;
  stateTimer: number;
  activeTaskId: string | null;
  activeTaskPrompt: string | null;
}

export interface OfficeSimulationState {
  agents: Record<AgentId, AgentRuntimeState>;
  officeMode: 'kerja' | 'rapat' | 'istirahat';
  elapsedSeconds: number;
  completedTaskCount: number;
}

export interface CameraPreset {
  id: OfficeZoneId;
  label: string;
  position: Vec3;
  target: Vec3;
}
