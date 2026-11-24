import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { OfficeSceneManager } from '../office/OfficeSceneManager';
import type {
  AgentId,
  LightingPreset,
  OfficeCommand,
  OfficeSimulationState,
  OfficeZoneId,
} from '../office/types';

import type { VideoAspectRatio } from '../office/mediaStudio';

export interface OfficeViewportHandle {
  setCameraPreset: (zone: OfficeZoneId) => void;
  setLightingPreset: (preset: LightingPreset) => void;
  setSimulationSpeed: (speed: number) => void;
  selectAgent: (agentId: AgentId | null, focusCamera?: boolean) => void;
  runOfficeCommand: (command: OfficeCommand) => void;
  startAgentTask: (agentId: AgentId, taskId: string, prompt: string) => void;
  finishAgentTask: (agentId: AgentId, taskId: string, ok: boolean) => void;
  projectVideoToOffice: (
    videoDataUrl: string | null,
    aspectRatio?: VideoAspectRatio,
    focusCamera?: boolean
  ) => void;
  displayImageInOffice: (imageDataUrl: string | null, focusCamera?: boolean) => void;
}

interface OfficeViewportProps {
  onStateSnapshot: (state: OfficeSimulationState) => void;
  onAgentClicked: (agentId: AgentId) => void;
}

export const OfficeViewport = forwardRef<OfficeViewportHandle, OfficeViewportProps>(
  function OfficeViewport({ onStateSnapshot, onAgentClicked }, ref) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const managerRef = useRef<OfficeSceneManager | null>(null);
    const callbacksRef = useRef({ onStateSnapshot, onAgentClicked });
    const [webglUnavailable, setWebglUnavailable] = useState(false);

    callbacksRef.current = { onStateSnapshot, onAgentClicked };

    useImperativeHandle(ref, () => ({
      setCameraPreset: (zone) => managerRef.current?.setCameraPreset(zone),
      setLightingPreset: (preset) => managerRef.current?.setLightingPreset(preset),
      setSimulationSpeed: (speed) => managerRef.current?.setSimulationSpeed(speed),
      selectAgent: (agentId, focusCamera = true) =>
        managerRef.current?.selectAgent(agentId, focusCamera),
      runOfficeCommand: (command) => managerRef.current?.runOfficeCommand(command),
      startAgentTask: (agentId, taskId, prompt) =>
        managerRef.current?.startAgentTask(agentId, taskId, prompt),
      finishAgentTask: (agentId, taskId, ok) =>
        managerRef.current?.finishAgentTask(agentId, taskId, ok),
      projectVideoToOffice: (videoDataUrl, aspectRatio = '16:9', focusCamera = true) =>
        managerRef.current?.projectVideoToOffice(videoDataUrl, aspectRatio, focusCamera),
      displayImageInOffice: (imageDataUrl, focusCamera = true) =>
        managerRef.current?.displayImageInOffice(imageDataUrl, focusCamera),
    }));

    useEffect(() => {
      const el = mountRef.current;
      if (!el) return;

      try {
        const manager = new OfficeSceneManager(el, {
          onStateSnapshot: (s) => callbacksRef.current.onStateSnapshot(s),
          onAgentClicked: (id) => callbacksRef.current.onAgentClicked(id),
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
        aria-label="Kanvas 3D Kantor AI interaktif. Seret untuk memutar kamera, gulir untuk memperbesar, atau klik agen AI."
      />
    );
  }
);
