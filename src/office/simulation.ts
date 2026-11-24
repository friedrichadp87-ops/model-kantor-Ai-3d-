import { AGENT_ORDER, AGENT_PROFILES, WAYPOINTS } from './layout';
import type {
  AgentActivityState,
  AgentId,
  AgentRuntimeState,
  OfficeCommand,
  OfficeSimulationState,
} from './types';

const WALK_SPEED = 2.6; // meters per second

export function normalizeAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function lerpAngle(current: number, target: number, factor: number): number {
  const diff = normalizeAngle(target - current);
  return normalizeAngle(current + diff * Math.min(1, Math.max(0, factor)));
}

/**
 * Shortest-path BFS on the architectural waypoint graph.
 * Returns the sequence of waypoint IDs to walk through (excluding `fromId`, including `toId`).
 */
export function findWaypointPath(fromId: string, toId: string): string[] {
  if (fromId === toId) return [];
  if (!WAYPOINTS[fromId] || !WAYPOINTS[toId]) return [];

  const queue: string[] = [fromId];
  const visited = new Set<string>([fromId]);
  const parent = new Map<string, string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === toId) break;

    const node = WAYPOINTS[current];
    for (const next of node.neighbors) {
      if (!visited.has(next) && WAYPOINTS[next]) {
        visited.add(next);
        parent.set(next, current);
        queue.push(next);
      }
    }
  }

  if (!visited.has(toId)) return [];

  const path: string[] = [];
  let cursor: string | undefined = toId;
  while (cursor && cursor !== fromId) {
    path.unshift(cursor);
    cursor = parent.get(cursor);
  }
  return path;
}

export function createInitialSimulationState(): OfficeSimulationState {
  const agents = {} as Record<AgentId, AgentRuntimeState>;

  AGENT_ORDER.forEach((id, index) => {
    const profile = AGENT_PROFILES[id];
    const startNode = WAYPOINTS[profile.homeWaypointId];
    agents[id] = {
      id,
      name: profile.name,
      role: profile.role,
      accentHex: profile.accentHex,
      x: startNode.x,
      z: startNode.z,
      yaw: startNode.facingYaw ?? Math.PI,
      seated: Boolean(startNode.seated),
      activity: 'working',
      statusLabel: profile.defaultStatusText,
      currentZone: startNode.zone,
      currentWaypointId: startNode.id,
      targetWaypointId: startNode.id,
      pathQueue: [],
      targetActivity: 'working',
      targetStatusLabel: profile.defaultStatusText,
      stateTimer: 10 + index * 5.5,
      activeTaskId: null,
      activeTaskPrompt: null,
    };
  });

  return {
    agents,
    officeMode: 'kerja',
    elapsedSeconds: 0,
    completedTaskCount: 0,
  };
}

export function routeAgentToWaypoint(
  agent: AgentRuntimeState,
  destinationId: string,
  arrivalActivity: AgentActivityState,
  arrivalStatusLabel: string,
  walkingStatusLabel?: string
): AgentRuntimeState {
  const dest = WAYPOINTS[destinationId];
  if (!dest) return agent;

  if (agent.currentWaypointId === destinationId && agent.pathQueue.length === 0) {
    return {
      ...agent,
      x: dest.x,
      z: dest.z,
      yaw: dest.facingYaw ?? agent.yaw,
      seated: Boolean(dest.seated),
      activity: arrivalActivity,
      statusLabel: arrivalStatusLabel,
      currentZone: dest.zone,
      targetWaypointId: destinationId,
      targetActivity: arrivalActivity,
      targetStatusLabel: arrivalStatusLabel,
      stateTimer: 16,
    };
  }

  const startFrom =
    agent.pathQueue.length > 0 ? agent.pathQueue[0] : agent.currentWaypointId;
  const subPath = findWaypointPath(startFrom, destinationId);
  const fullPath =
    agent.pathQueue.length > 0 && startFrom !== agent.currentWaypointId
      ? [startFrom, ...subPath]
      : subPath;

  return {
    ...agent,
    seated: false,
    activity: 'walking',
    statusLabel: walkingStatusLabel ?? `Menuju ${destinationLabel(dest.zone)}`,
    targetWaypointId: destinationId,
    pathQueue: fullPath,
    targetActivity: arrivalActivity,
    targetStatusLabel: arrivalStatusLabel,
    stateTimer: 18,
  };
}

function destinationLabel(zone: AgentRuntimeState['currentZone']): string {
  switch (zone) {
    case 'riset':
      return 'Zona Riset';
    case 'kode':
      return 'Zona Rekayasa';
    case 'rapat':
      return 'Ruang Rapat';
    case 'server':
      return 'Inti Server AI';
    case 'lounge':
      return 'Lounge Kopi';
  }
}

export function validateTaskPrompt(prompt: string): { valid: boolean; error?: string; trimmed: string } {
  const trimmed = prompt.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Masukkan instruksi tugas terlebih dahulu.', trimmed };
  }
  if (trimmed.length < 3) {
    return { valid: false, error: 'Instruksi tugas minimal 3 karakter.', trimmed };
  }
  if (trimmed.length > 600) {
    return { valid: false, error: 'Instruksi tugas maksimal 600 karakter.', trimmed };
  }
  return { valid: true, trimmed };
}

export function dispatchOfficeCommand(
  state: OfficeSimulationState,
  command: OfficeCommand
): OfficeSimulationState {
  const nextAgents = { ...state.agents };

  for (const id of AGENT_ORDER) {
    const agent = nextAgents[id];
    const profile = AGENT_PROFILES[id];

    // Keep agents actively executing a user-assigned AI task focused on their task
    if (agent.activeTaskId) continue;

    if (command === 'standup') {
      nextAgents[id] = routeAgentToWaypoint(
        agent,
        profile.meetingWaypointId,
        'meeting',
        id === 'ceo' ? 'Memimpin sinkronisasi 13 agen tim' : 'Berdiskusi di rapat tim',
        'Menuju Ruang Rapat'
      );
    } else if (command === 'coffee_break') {
      nextAgents[id] = routeAgentToWaypoint(
        agent,
        profile.loungeWaypointId,
        'coffee_break',
        'Rehat kopi & diskusi santai',
        'Menuju Lounge Kopi'
      );
    } else {
      nextAgents[id] = routeAgentToWaypoint(
        agent,
        profile.homeWaypointId,
        'working',
        profile.defaultStatusText,
        'Kembali ke meja kerja'
      );
    }
  }

  return {
    ...state,
    agents: nextAgents,
    officeMode:
      command === 'standup' ? 'rapat' : command === 'coffee_break' ? 'istirahat' : 'kerja',
  };
}

export function assignAgentTask(
  state: OfficeSimulationState,
  agentId: AgentId,
  taskId: string,
  prompt: string
): OfficeSimulationState {
  const agent = state.agents[agentId];
  if (!agent) return state;

  const profile = AGENT_PROFILES[agentId];
  const isServerTask =
    (agentId === 'theological-guardian' || agentId === 'seo-publisher') &&
    /server|model|data|klaster|inferensi|pipeline|analitik|audit/i.test(prompt);
  const destinationId = isServerTask ? 'server_bay_1' : profile.homeWaypointId;

  const routed = routeAgentToWaypoint(
    {
      ...agent,
      activeTaskId: taskId,
      activeTaskPrompt: prompt,
    },
    destinationId,
    'executing_task',
    `Mengerjakan tugas: ${prompt.slice(0, 42)}${prompt.length > 42 ? '…' : ''}`,
    isServerTask ? 'Menuju Inti Server untuk tugas' : 'Menuju meja kerja untuk tugas'
  );

  return {
    ...state,
    agents: {
      ...state.agents,
      [agentId]: routed,
    },
  };
}

export function completeAgentTask(
  state: OfficeSimulationState,
  agentId: AgentId,
  taskId: string
): OfficeSimulationState {
  const agent = state.agents[agentId];
  if (!agent || agent.activeTaskId !== taskId) return state;

  const profile = AGENT_PROFILES[agentId];
  return {
    ...state,
    completedTaskCount: state.completedTaskCount + 1,
    agents: {
      ...state.agents,
      [agentId]: {
        ...agent,
        activeTaskId: null,
        activeTaskPrompt: null,
        activity: agent.pathQueue.length > 0 ? 'walking' : 'working',
        targetActivity: 'working',
        statusLabel: 'Tugas selesai · siap menerima instruksi',
        targetStatusLabel: profile.defaultStatusText,
        stateTimer: 14,
      },
    },
  };
}

export function failAgentTask(
  state: OfficeSimulationState,
  agentId: AgentId,
  taskId: string
): OfficeSimulationState {
  const agent = state.agents[agentId];
  if (!agent || agent.activeTaskId !== taskId) return state;

  const profile = AGENT_PROFILES[agentId];
  return {
    ...state,
    agents: {
      ...state.agents,
      [agentId]: {
        ...agent,
        activeTaskId: null,
        activeTaskPrompt: null,
        activity: agent.pathQueue.length > 0 ? 'walking' : 'working',
        targetActivity: 'working',
        statusLabel: profile.defaultStatusText,
        targetStatusLabel: profile.defaultStatusText,
        stateTimer: 12,
      },
    },
  };
}

function pickNextAutonomousRoute(
  agent: AgentRuntimeState,
  elapsedSeconds: number,
  officeMode: OfficeSimulationState['officeMode']
): AgentRuntimeState {
  if (agent.activeTaskId) return { ...agent, stateTimer: 12 };
  if (officeMode !== 'kerja') return { ...agent, stateTimer: 20 };

  const profile = AGENT_PROFILES[agent.id];
  const cycleSeed = Math.floor(elapsedSeconds / 11) + AGENT_ORDER.indexOf(agent.id);

  // If currently away from desk, head back to home desk
  if (agent.currentWaypointId !== profile.homeWaypointId) {
    return routeAgentToWaypoint(
      agent,
      profile.homeWaypointId,
      'working',
      profile.defaultStatusText,
      'Kembali ke meja kerja'
    );
  }

  // Otherwise pick a realistic studio activity
  const mod = cycleSeed % 3;
  if (
    mod === 0 &&
    (agent.id === 'theological-guardian' ||
      agent.id === 'seo-publisher' ||
      agent.id === 'video-composer')
  ) {
    const bay = agent.id === 'theological-guardian' ? 'server_bay_1' : 'server_bay_2';
    return routeAgentToWaypoint(
      agent,
      bay,
      'server_check',
      'Memeriksa metrik rak server AI',
      'Menuju Inti Server AI'
    );
  }

  if (mod === 1) {
    return routeAgentToWaypoint(
      agent,
      profile.loungeWaypointId,
      'coffee_break',
      'Mengambil kopi di lounge',
      'Menuju Lounge Kopi'
    );
  }

  return routeAgentToWaypoint(
    agent,
    profile.meetingWaypointId,
    'meeting',
    'Meninjau papan strategi rapat',
    'Menuju Ruang Rapat'
  );
}

/**
 * Advances simulation deterministically by `dt` seconds.
 */
export function stepOfficeSimulation(
  state: OfficeSimulationState,
  dt: number
): OfficeSimulationState {
  const clampedDt = Math.min(Math.max(dt, 0), 0.25);
  if (clampedDt <= 0) return state;

  const nextElapsed = state.elapsedSeconds + clampedDt;
  const nextAgents = { ...state.agents };

  for (const id of AGENT_ORDER) {
    let agent = { ...nextAgents[id] };

    if (agent.pathQueue.length > 0) {
      const nextNodeId = agent.pathQueue[0];
      const nextNode = WAYPOINTS[nextNodeId];

      if (!nextNode) {
        agent.pathQueue = agent.pathQueue.slice(1);
      } else {
        const dx = nextNode.x - agent.x;
        const dz = nextNode.z - agent.z;
        const dist = Math.hypot(dx, dz);
        const stepDist = WALK_SPEED * clampedDt;

        if (dist <= stepDist + 0.02) {
          agent.x = nextNode.x;
          agent.z = nextNode.z;
          agent.currentWaypointId = nextNode.id;
          agent.currentZone = nextNode.zone;
          agent.pathQueue = agent.pathQueue.slice(1);

          if (agent.pathQueue.length === 0) {
            agent.yaw = nextNode.facingYaw ?? agent.yaw;
            agent.seated = Boolean(nextNode.seated);
            agent.activity = agent.targetActivity;
            agent.statusLabel = agent.targetStatusLabel;
          }
        } else {
          const nx = dx / dist;
          const nz = dz / dist;
          agent.x += nx * stepDist;
          agent.z += nz * stepDist;
          const moveYaw = Math.atan2(nx, nz);
          agent.yaw = lerpAngle(agent.yaw, moveYaw, Math.min(1, clampedDt * 12));
          agent.seated = false;
          agent.activity = 'walking';
        }
      }
    } else {
      // Stationary at waypoint: gently align yaw & count down autonomous routine timer
      const currentNode = WAYPOINTS[agent.currentWaypointId];
      if (currentNode?.facingYaw !== undefined) {
        agent.yaw = lerpAngle(agent.yaw, currentNode.facingYaw, Math.min(1, clampedDt * 8));
      }

      agent.stateTimer -= clampedDt;
      if (agent.stateTimer <= 0) {
        agent = pickNextAutonomousRoute(agent, nextElapsed, state.officeMode);
      }
    }

    nextAgents[id] = agent;
  }

  return {
    ...state,
    elapsedSeconds: nextElapsed,
    agents: nextAgents,
  };
}
