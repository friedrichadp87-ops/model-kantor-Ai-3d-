import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { OfficeSceneManager } from '../office/OfficeSceneManager';
import type {
  BuildingSimulationState,
  FloorId,
  FloorViewMode,
} from '../office/buildingFloors';
import type { AgentId, LightingPreset, OfficeCommand, OfficeZoneId } from '../office/types';
import type { VideoAspectRatio } from '../office/mediaStudio';

export interface OfficeViewportHandle {
  setFloorView: (view: FloorViewMode, focusZone?: OfficeZoneId) => void;
  setCameraPreset: (zone: OfficeZoneId, overrideFloor?: FloorViewMode) => void;
  setLightingPreset: (preset: LightingPreset) => void;
  setSimulationSpeed: (speed: number) => void;
  selectAgent: (floorId: FloorId | null, agentId: AgentId | null, focusCamera?: boolean) => void;
  runOfficeCommand: (command: OfficeCommand, scope?: FloorViewMode) => void;
  startAgentTask: (floorId: FloorId, agentId: AgentId, taskId: string, prompt: string) => void;
  finishAgentTask: (floorId: FloorId, agentId: AgentId, taskId: string, ok: boolean) => void;
  projectVideoToOffice: (
    videoDataUrl: string | null,
    aspectRatio?: VideoAspectRatio,
    focusCamera?: boolean,
    floorId?: FloorId
  ) => void;
  displayImageInOffice: (
    imageDataUrl: string | null,
    focusCamera?: boolean,
    floorId?: FloorId
  ) => void;
}

interface OfficeViewportProps {
  onStateSnapshot: (state: BuildingSimulationState) => void;
  onAgentClicked: (floorId: FloorId, agentId: AgentId) => void;
}

export const OfficeViewport = forwardRef<OfficeViewportHandle, OfficeViewportProps>(
  function OfficeViewport({ onStateSnapshot, onAgentClicked }, ref) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const managerRef = useRef<OfficeSceneManager | null>(null);
    const callbacksRef = useRef({ onStateSnapshot, onAgentClicked });
    const [webglUnavailable, setWebglUnavailable] = useState(false);

    callbacksRef.current = { onStateSnapshot, onAgentClicked };

    useImperativeHandle(ref, () => ({
      setFloorView: (view, focusZone) => managerRef.current?.setFloorView(view, focusZone),
      setCameraPreset: (zone, overrideFloor) =>
        managerRef.current?.setCameraPreset(zone, overrideFloor),
      setLightingPreset: (preset) => managerRef.current?.setLightingPreset(preset),
      setSimulationSpeed: (speed) => managerRef.current?.setSimulationSpeed(speed),
      selectAgent: (floorId, agentId, focusCamera = true) =>
        managerRef.current?.selectAgent(floorId, agentId, focusCamera),
      runOfficeCommand: (command, scope = 'all') =>
        managerRef.current?.runOfficeCommand(command, scope),
      startAgentTask: (floorId, agentId, taskId, prompt) =>
        managerRef.current?.startAgentTask(floorId, agentId, taskId, prompt),
      finishAgentTask: (floorId, agentId, taskId, ok) =>
        managerRef.current?.finishAgentTask(floorId, agentId, taskId, ok),
      projectVideoToOffice: (videoDataUrl, aspectRatio = '16:9', focusCamera = true, floorId = 1) =>
        managerRef.current?.projectVideoToOffice(videoDataUrl, aspectRatio, focusCamera, floorId),
      displayImageInOffice: (imageDataUrl, focusCamera = true, floorId = 1) =>
        managerRef.current?.displayImageInOffice(imageDataUrl, focusCamera, floorId),
    }));

    useEffect(() => {
      const el = mountRef.current;
      if (!el) return;

      try {
        const manager = new OfficeSceneManager(el, {
          onStateSnapshot: (s) => callbacksRef.current.onStateSnapshot(s),
          onAgentClicked: (floorId, agentId) => callbacksRef.current.onAgentClicked(floorId, agentId),
          onWebGLContextLost: () => setWebglUnavailable(true),
        });
        managerRef.current = manager;

        return () => {
          manager.dispose();
          managerRef.current = null;
        };
      } catch {
        setWebglUnavailable(true);
        return undefined;
      }
    }, []);

    if (webglUnavailable) {
      return (
        <div
          className="fixed inset-0 flex items-center justify-center bg-slate-100 p-6 text-center"
          role="status"
        >
          <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              Tampilan 3D WebGL tidak tersedia
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Peramban Anda tidak mendukung atau menangguhkan konteks WebGL. Muat ulang halaman untuk mencoba kembali.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div
        ref={mountRef}
        data-testid="office-3d-viewport"
        className="fixed inset-0 h-full w-full overflow-hidden select-none"
        aria-label="Kanvas 3D Kantor AI 3 lantai interaktif dengan 39 karyawan AI. Seret untuk memutar kamera, gulir untuk memperbesar, atau klik agen AI."
      />
    );
  }
);
