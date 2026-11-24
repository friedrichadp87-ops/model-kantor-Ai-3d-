import { AGENT_ORDER, ZONE_LABELS } from './layout';
import type { AgentId, OfficeSimulationState } from './types';

export type ActivityEventCategory =
  | 'work'
  | 'meeting'
  | 'server'
  | 'break'
  | 'task'
  | 'transit';

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  agentId: AgentId;
  agentName: string;
  accentHex: string;
  message: string;
  category: ActivityEventCategory;
}

const WORK_START_VERBS: Record<AgentId, string> = {
  ceo: 'mulai mengoordinasi pembagian tugas',
  'trend-researcher': 'mulai menyusun kalender editorial',
  'bible-researcher': 'mulai memeriksa konteks Alkitab',
  scriptwriter: 'mulai menulis naskah & hook Shorts',
  'theological-guardian': 'mulai mengaudit ayat TB & doktrin',
  'pastoral-checker': 'mulai meninjau kepekaan pastoral',
  'storyboard-artist': 'mulai menyusun urutan adegan 9:16',
  'visual-curator': 'mulai mengkurasi aset Openverse',
  'video-composer': 'mulai merakit video vertikal 9:16',
  'voice-artist': 'mulai menyiapkan karakter narasi suara',
  'video-editor': 'mulai menyunting klip & subtitle SRT',
  'seo-publisher': 'mulai mengoptimasi SEO & publikasi',
  'community-prayer': 'mulai menyiapkan draf balasan doa',
};

let seqCounter = 0;

function nextEventId(agentId: AgentId, nowMs: number): string {
  seqCounter += 1;
  return `evt_${nowMs}_${agentId}_${seqCounter}`;
}

export function formatLogTimestamp(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function createInitialActivityLog(
  state: OfficeSimulationState,
  now: Date = new Date()
): ActivityLogEntry[] {
  const ts = formatLogTimestamp(now);
  const nowMs = now.getTime();

  return AGENT_ORDER.map((id) => {
    const agent = state.agents[id];
    return {
      id: nextEventId(id, nowMs),
      timestamp: ts,
      agentId: id,
      agentName: agent.name,
      accentHex: agent.accentHex,
      message: `${agent.name} ${WORK_START_VERBS[id]}`,
      category: 'work' as const,
    };
  }).reverse();
}

export function diffAgentActivityEvents(
  prev: OfficeSimulationState,
  next: OfficeSimulationState,
  now: Date = new Date()
): ActivityLogEntry[] {
  const events: ActivityLogEntry[] = [];
  const ts = formatLogTimestamp(now);
  const nowMs = now.getTime();
  const taskCompletedDelta = next.completedTaskCount > prev.completedTaskCount;

  for (const id of AGENT_ORDER) {
    const p = prev.agents[id];
    const n = next.agents[id];
    if (!p || !n) continue;

    // 1. User-assigned task lifecycle transitions
    if (!p.activeTaskId && n.activeTaskId) {
      events.push({
        id: nextEventId(id, nowMs),
        timestamp: ts,
        agentId: id,
        agentName: n.name,
        accentHex: n.accentHex,
        message: `${n.name} menerima tugas AI baru`,
        category: 'task',
      });
      continue;
    }

    if (p.activeTaskId && !n.activeTaskId) {
      events.push({
        id: nextEventId(id, nowMs),
        timestamp: ts,
        agentId: id,
        agentName: n.name,
        accentHex: n.accentHex,
        message: taskCompletedDelta
          ? `${n.name} menyelesaikan tugas AI`
          : `${n.name} kembali ke rutinitas meja kerja`,
        category: 'task',
      });
      continue;
    }

    // 2. Activity state transitions
    const activityChanged = p.activity !== n.activity;
    const walkingTargetChanged =
      n.activity === 'walking' &&
      p.activity === 'walking' &&
      p.targetWaypointId !== n.targetWaypointId;

    if (!activityChanged && !walkingTargetChanged) continue;

    // Emit completion event when finishing a notable stationary session
    if (activityChanged) {
      if (p.activity === 'meeting') {
        events.push({
          id: nextEventId(id, nowMs),
          timestamp: ts,
          agentId: id,
          agentName: n.name,
          accentHex: n.accentHex,
          message: `${n.name} menyelesaikan rapat tim`,
          category: 'meeting',
        });
      } else if (p.activity === 'server_check') {
        events.push({
          id: nextEventId(id, nowMs),
          timestamp: ts,
          agentId: id,
          agentName: n.name,
          accentHex: n.accentHex,
          message: `${n.name} selesai memeriksa rak server`,
          category: 'server',
        });
      } else if (p.activity === 'coffee_break') {
        events.push({
          id: nextEventId(id, nowMs),
          timestamp: ts,
          agentId: id,
          agentName: n.name,
          accentHex: n.accentHex,
          message: `${n.name} selesai rehat kopi`,
          category: 'break',
        });
      }
    }

    // Emit new activity start event
    if (n.activity === 'working') {
      events.push({
        id: nextEventId(id, nowMs),
        timestamp: ts,
        agentId: id,
        agentName: n.name,
        accentHex: n.accentHex,
        message: `${n.name} ${WORK_START_VERBS[id]}`,
        category: 'work',
      });
    } else if (n.activity === 'meeting') {
      events.push({
        id: nextEventId(id, nowMs),
        timestamp: ts,
        agentId: id,
        agentName: n.name,
        accentHex: n.accentHex,
        message: `${n.name} bergabung di rapat tim`,
        category: 'meeting',
      });
    } else if (n.activity === 'server_check') {
      events.push({
        id: nextEventId(id, nowMs),
        timestamp: ts,
        agentId: id,
        agentName: n.name,
        accentHex: n.accentHex,
        message: `${n.name} mulai memeriksa server AI`,
        category: 'server',
      });
    } else if (n.activity === 'coffee_break') {
      events.push({
        id: nextEventId(id, nowMs),
        timestamp: ts,
        agentId: id,
        agentName: n.name,
        accentHex: n.accentHex,
        message: `${n.name} mulai rehat kopi`,
        category: 'break',
      });
    } else if (n.activity === 'executing_task') {
      events.push({
        id: nextEventId(id, nowMs),
        timestamp: ts,
        agentId: id,
        agentName: n.name,
        accentHex: n.accentHex,
        message: `${n.name} memproses tugas di ${ZONE_LABELS[n.currentZone]}`,
        category: 'task',
      });
    } else if (n.activity === 'walking') {
      const destText = n.statusLabel.startsWith('Menuju ')
        ? n.statusLabel.replace(/^Menuju /, 'menuju ')
        : n.statusLabel.startsWith('Kembali ')
        ? n.statusLabel.replace(/^Kembali /, 'kembali ')
        : 'berpindah ruangan';
      events.push({
        id: nextEventId(id, nowMs),
        timestamp: ts,
        agentId: id,
        agentName: n.name,
        accentHex: n.accentHex,
        message: `${n.name} ${destText}`,
        category: 'transit',
      });
    }
  }

  return events;
}

export function appendActivityLog(
  existing: ActivityLogEntry[],
  incoming: ActivityLogEntry[],
  maxEntries = 40
): ActivityLogEntry[] {
  if (incoming.length === 0) return existing;
  // Newest entries at the top of the feed
  return [...incoming.slice().reverse(), ...existing].slice(0, maxEntries);
}
