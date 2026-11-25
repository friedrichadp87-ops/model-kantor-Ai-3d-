import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BUILDING_FLOORS,
  FLOOR_HEIGHT,
  FLOOR_ORDER,
  assignFloorAgentTask,
  completeFloorAgentTask,
  createInitialBuildingState,
  dispatchBuildingCommand,
  failFloorAgentTask,
  getFloorCameraPreset,
  stepBuildingSimulation,
  type BuildingSimulationState,
  type FloorId,
  type FloorViewMode,
} from './buildingFloors';
import { AGENT_ORDER } from './layout';
import { buildOfficeScene, type OfficeSceneParts } from './models';
import { createOfficeTexturePack, type OfficeTexturePack } from './textures';
import { aspectStringToRatio, computeScreenFitScale, type VideoAspectRatio } from './mediaStudio';
import type { AgentId, LightingPreset, OfficeCommand, OfficeZoneId } from './types';

// Reusable scratch math objects (zero per-frame GC)
const _camGoalPos = new THREE.Vector3();
const _camGoalTarget = new THREE.Vector3();
const _mouseNdc = new THREE.Vector2();
const _bgColorTarget = new THREE.Color();
const _keyColorTarget = new THREE.Color();
const _hemiSkyTarget = new THREE.Color();
const _hemiGroundTarget = new THREE.Color();

interface LightingConfig {
  bgHex: number;
  keyHex: number;
  keyIntensity: number;
  keyPos: [number, number, number];
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  envIntensity: number;
  interiorPointIntensity: number;
  lampEmissive: number;
  exposure: number;
}

const LIGHTING_CONFIGS: Record<LightingPreset, LightingConfig> = {
  pagi: {
    bgHex: 0xdce5ec,
    keyHex: 0xfff5e4,
    keyIntensity: 2.25,
    keyPos: [18, 28, 16],
    hemiSky: 0xcbe3fa,
    hemiGround: 0x8b7e74,
    hemiIntensity: 1.02,
    envIntensity: 0.95,
    interiorPointIntensity: 0.45,
    lampEmissive: 0.55,
    exposure: 1.06,
  },
  sore: {
    bgHex: 0xd8c3b0,
    keyHex: 0xffae66,
    keyIntensity: 2.1,
    keyPos: [-18, 18, 16],
    hemiSky: 0x99add0,
    hemiGround: 0x6b5140,
    hemiIntensity: 0.8,
    envIntensity: 0.72,
    interiorPointIntensity: 1.6,
    lampEmissive: 1.25,
    exposure: 1.05,
  },
  malam: {
    bgHex: 0x0b1220,
    keyHex: 0x6e98d6,
    keyIntensity: 0.44,
    keyPos: [14, 24, -14],
    hemiSky: 0x1e3354,
    hemiGround: 0x0f172a,
    hemiIntensity: 0.36,
    envIntensity: 0.28,
    interiorPointIntensity: 4.0,
    lampEmissive: 2.4,
    exposure: 1.08,
  },
};

export interface OfficeManagerCallbacks {
  onStateSnapshot: (state: BuildingSimulationState) => void;
  onAgentClicked: (floorId: FloorId, agentId: AgentId) => void;
  onWebGLContextLost?: () => void;
}

function detectSoftwareGl(): boolean {
  const probeCanvas = document.createElement('canvas');
  const gl = probeCanvas.getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

export class OfficeSceneManager {
  private container: HTMLElement;
  private callbacks: OfficeManagerCallbacks;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private textures: OfficeTexturePack;
  private parts: OfficeSceneParts;
  private envRT: THREE.WebGLRenderTarget;

  private keyLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private interiorLights: THREE.PointLight[] = [];

  private buildingState: BuildingSimulationState;
  private simSpeed = 1;
  private lightingPreset: LightingPreset = 'pagi';
  private floorView: FloorViewMode = 'all';
  private activeZone: OfficeZoneId = 'overview';
  private selectedTarget: { floorId: FloorId; agentId: AgentId } | null = null;
  private hoveredTarget: { floorId: FloorId; agentId: AgentId } | null = null;
  private followSelectedAgent = false;

  private cameraTransitionActive = false;
  private activeCameraGoalPos = new THREE.Vector3();
  private activeCameraGoalTarget = new THREE.Vector3();

  private raycaster = new THREE.Raycaster();
  private pointerDownPos = { x: 0, y: 0 };
  private lastHoverRaycastMs = 0;

  private frameId = 0;
  private lastFrameMs = 0;
  private lastUiSyncMs = 0;
  private disposed = false;

  private activeVideoEl: HTMLVideoElement | null = null;
  private activeVideoTexture: THREE.VideoTexture | null = null;
  private activeVideoFloor: FloorId | null = null;
  private activeGalleryTexture: THREE.Texture | null = null;
  private activeGalleryFloor: FloorId | null = null;

  constructor(container: HTMLElement, callbacks: OfficeManagerCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareGl();

    this.buildingState = createInitialBuildingState();

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = LIGHTING_CONFIGS.pagi.exposure;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 240);
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // Scene & Fog (tuned for 3-story architectural tower scale)
    this.scene = new THREE.Scene();
    const initLight = LIGHTING_CONFIGS.pagi;
    this.scene.background = new THREE.Color(initLight.bgHex);
    this.scene.fog = new THREE.Fog(initLight.bgHex, 65, 155);

    // Studio Environment Reflections via RoomEnvironment (every device)
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envRT = pmremGenerator.fromScene(roomEnv, 0.04);
    this.scene.environment = this.envRT.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // Camera & OrbitControls (start framing all 3 floors cleanly)
    const overview = getFloorCameraPreset('overview', 'all');
    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.2, 200);
    this.camera.position.set(overview.position.x, overview.position.y, overview.position.z);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(overview.target.x, overview.target.y, overview.target.z);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 5.5;
    this.controls.maxDistance = 64;
    this.controls.minPolarAngle = 0.25;
    this.controls.maxPolarAngle = Math.PI / 2.08;
    this.controls.update();

    this.controls.addEventListener('start', () => {
      this.cameraTransitionActive = false;
      this.followSelectedAgent = false;
    });

    // 3-Point Warm/Cool Lighting Rig (1 shadow caster + hemisphere + 3 unshadowed story warm lights)
    this.hemiLight = new THREE.HemisphereLight(
      initLight.hemiSky,
      initLight.hemiGround,
      initLight.hemiIntensity
    );
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(initLight.keyHex, initLight.keyIntensity);
    this.keyLight.position.set(...initLight.keyPos);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 2;
    this.keyLight.shadow.camera.far = 75;
    const d = 22;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);

    // One unshadowed warm architectural light per story (budget = 3 point lights total)
    for (const floorId of FLOOR_ORDER) {
      const y = BUILDING_FLOORS[floorId].elevationY + 3.1;
      const storyLamp = new THREE.PointLight(
        0xffebd2,
        initLight.interiorPointIntensity,
        22,
        1.45
      );
      storyLamp.position.set(0.5, y, 0.2);
      this.interiorLights.push(storyLamp);
      this.scene.add(storyLamp);
    }

    // Build textures & 3-story 39-employee architectural tower
    this.textures = createOfficeTexturePack(this.renderer);
    this.parts = buildOfficeScene(this.textures, this.isSoftwareGl);
    this.scene.add(this.parts.root);

    // Sync initial 39 agent poses immediately
    this.syncAgentVisuals(0);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.callbacks.onStateSnapshot(this.buildingState);

    this.lastFrameMs = performance.now();
    this.tick();
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.handleResize);
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.handlePointerDown);
    dom.addEventListener('pointerup', this.handlePointerUp);
    dom.addEventListener('pointermove', this.handlePointerMove);
    dom.addEventListener('webglcontextlost', this.handleContextLost);
  }

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.callbacks.onWebGLContextLost?.();
  };

  private handleResize = (): void => {
    if (this.disposed) return;
    const width = Math.max(this.container.clientWidth, 320);
    const height = Math.max(this.container.clientHeight, 240);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.render(this.scene, this.camera);
  };

  private handlePointerDown = (e: PointerEvent): void => {
    this.pointerDownPos.x = e.clientX;
    this.pointerDownPos.y = e.clientY;
  };

  private handlePointerUp = (e: PointerEvent): void => {
    const moved = Math.hypot(
      e.clientX - this.pointerDownPos.x,
      e.clientY - this.pointerDownPos.y
    );
    if (moved > 6) return;

    const hit = this.raycastAgent(e.clientX, e.clientY);
    if (hit) {
      this.selectAgent(hit.floorId, hit.agentId, true);
      this.callbacks.onAgentClicked(hit.floorId, hit.agentId);
    }
  };

  private handlePointerMove = (e: PointerEvent): void => {
    const now = performance.now();
    if (now - this.lastHoverRaycastMs < 60) return;
    this.lastHoverRaycastMs = now;

    const hit = this.raycastAgent(e.clientX, e.clientY);
    this.hoveredTarget = hit;
    this.renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
  };

  private getVisibleInteractables(): THREE.Object3D[] {
    const list: THREE.Object3D[] = [];
    for (const floorId of FLOOR_ORDER) {
      if (this.parts.floorGroups[floorId].visible) {
        list.push(...this.parts.interactablesByFloor[floorId]);
      }
    }
    return list;
  }

  private raycastAgent(
    clientX: number,
    clientY: number
  ): { floorId: FloorId; agentId: AgentId } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    _mouseNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _mouseNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(_mouseNdc, this.camera);
    const hits = this.raycaster.intersectObjects(this.getVisibleInteractables(), false);
    if (hits.length > 0) {
      const floorId = hits[0].object.userData.floorId as FloorId | undefined;
      const agentId = hits[0].object.userData.agentId as AgentId | undefined;
      if (floorId && agentId) {
        return { floorId, agentId };
      }
    }
    return null;
  }

  private applyCutawayVisibility(view: FloorViewMode): void {
    // Cutaway mode hides stories ABOVE the selected floor so the selected floor is 100% unobstructed
    this.parts.floorGroups[1].visible = true;
    this.parts.floorGroups[2].visible = view !== 1;
    this.parts.floorGroups[3].visible = view === 'all' || view === 3;
  }

  public setFloorView(view: FloorViewMode, focusZone?: OfficeZoneId): void {
    this.floorView = view;
    this.applyCutawayVisibility(view);
    const targetZone = focusZone ?? (view === 'all' ? 'overview' : this.activeZone);
    this.setCameraPreset(targetZone, view);
  }

  public setCameraPreset(zoneId: OfficeZoneId, overrideFloor?: FloorViewMode): void {
    this.activeZone = zoneId;
    const view = overrideFloor ?? this.floorView;
    const preset = getFloorCameraPreset(zoneId, view);
    this.followSelectedAgent = false;
    this.activeCameraGoalPos.set(preset.position.x, preset.position.y, preset.position.z);
    this.activeCameraGoalTarget.set(preset.target.x, preset.target.y, preset.target.z);
    this.cameraTransitionActive = true;
  }

  public setLightingPreset(preset: LightingPreset): void {
    this.lightingPreset = preset;
  }

  public setSimulationSpeed(speed: number): void {
    this.simSpeed = speed;
  }

  public selectAgent(
    floorId: FloorId | null,
    agentId: AgentId | null,
    focusCamera = true
  ): void {
    if (!floorId || !agentId) {
      this.selectedTarget = null;
      this.followSelectedAgent = false;
      return;
    }

    this.selectedTarget = { floorId, agentId };
    if (focusCamera) {
      // Ensure cutaway exposes the target floor cleanly
      if (this.floorView !== 'all' && this.floorView !== floorId) {
        this.floorView = floorId;
        this.applyCutawayVisibility(floorId);
      } else if (this.floorView === 'all' && floorId < 3) {
        // Reveal floor cleanly so upper slab doesn't obstruct close-up focus
        this.floorView = floorId;
        this.applyCutawayVisibility(floorId);
      }
      const a = this.buildingState.floors[floorId]?.agents[agentId];
      const yBase = BUILDING_FLOORS[floorId].elevationY;
      if (a) {
        this.followSelectedAgent = true;
        this.cameraTransitionActive = true;
        this.activeCameraGoalTarget.set(a.x, yBase + 0.35, a.z + 0.8);
        this.activeCameraGoalPos.set(a.x + 5.6, yBase + 5.4, a.z + 6.4);
      }
    }
  }

  public runOfficeCommand(command: OfficeCommand, scope: FloorViewMode = 'all'): void {
    this.buildingState = dispatchBuildingCommand(this.buildingState, command, scope);
    this.callbacks.onStateSnapshot(this.buildingState);
  }

  public startAgentTask(
    floorId: FloorId,
    agentId: AgentId,
    taskId: string,
    prompt: string
  ): void {
    this.buildingState = assignFloorAgentTask(
      this.buildingState,
      floorId,
      agentId,
      taskId,
      prompt
    );
    this.callbacks.onStateSnapshot(this.buildingState);
  }

  public finishAgentTask(
    floorId: FloorId,
    agentId: AgentId,
    taskId: string,
    ok: boolean
  ): void {
    this.buildingState = ok
      ? completeFloorAgentTask(this.buildingState, floorId, agentId, taskId)
      : failFloorAgentTask(this.buildingState, floorId, agentId, taskId);
    this.callbacks.onStateSnapshot(this.buildingState);
  }

  public projectVideoToOffice(
    videoDataUrl: string | null,
    aspectRatio: VideoAspectRatio = '16:9',
    focusCamera = true,
    floorId: FloorId = 1
  ): void {
    // Reset previous floor's screen if switching floors
    if (this.activeVideoFloor && this.activeVideoFloor !== floorId) {
      const prevScreen = this.parts.meetingScreensByFloor[this.activeVideoFloor];
      prevScreen.mat.map = this.textures.screens.meeting;
      prevScreen.mat.emissiveMap = this.textures.screens.meeting;
      prevScreen.mat.emissive.setHex(0xbfdbfe);
      prevScreen.mat.needsUpdate = true;
      prevScreen.mesh.scale.set(1, 1, 1);
    }

    this.disposeActiveVideo();

    const targetScreen = this.parts.meetingScreensByFloor[floorId];
    const mat = targetScreen.mat;
    const mesh = targetScreen.mesh;

    if (!videoDataUrl) {
      for (const fId of FLOOR_ORDER) {
        const s = this.parts.meetingScreensByFloor[fId];
        s.mat.map = this.textures.screens.meeting;
        s.mat.emissiveMap = this.textures.screens.meeting;
        s.mat.emissive.setHex(0xbfdbfe);
        s.mat.needsUpdate = true;
        s.mesh.scale.set(1, 1, 1);
      }
      this.activeVideoFloor = null;
      return;
    }

    const video = document.createElement('video');
    video.src = videoDataUrl;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.play().catch(() => {});

    const videoTex = new THREE.VideoTexture(video);
    videoTex.colorSpace = THREE.SRGBColorSpace;
    videoTex.minFilter = THREE.LinearFilter;
    videoTex.magFilter = THREE.LinearFilter;

    this.activeVideoEl = video;
    this.activeVideoTexture = videoTex;
    this.activeVideoFloor = floorId;

    const { scaleX, scaleY } = computeScreenFitScale(2.22, 1.22, aspectStringToRatio(aspectRatio));
    mesh.scale.set(scaleX, scaleY, 1);

    mat.color.setHex(0xffffff);
    mat.map = videoTex;
    mat.emissive.setHex(0xffffff);
    mat.emissiveMap = videoTex;
    mat.needsUpdate = true;

    if (focusCamera) {
      this.floorView = floorId;
      this.applyCutawayVisibility(floorId);
      const yBase = BUILDING_FLOORS[floorId].elevationY;
      this.followSelectedAgent = false;
      this.activeCameraGoalPos.set(-3.4, yBase + 3.0, 4.4);
      this.activeCameraGoalTarget.set(-10.8, yBase + 2.05, 4.0);
      this.cameraTransitionActive = true;
    }
  }

  public displayImageInOffice(
    imageDataUrl: string | null,
    focusCamera = true,
    floorId: FloorId = 1
  ): void {
    if (this.activeGalleryFloor && this.activeGalleryFloor !== floorId) {
      const prevArt = this.parts.galleryArtByFloor[this.activeGalleryFloor];
      prevArt.mat.map = this.textures.screens.design;
      prevArt.mat.emissiveMap = this.textures.screens.design;
      prevArt.mat.needsUpdate = true;
      prevArt.mesh.scale.set(1, 1, 1);
    }

    const targetArt = this.parts.galleryArtByFloor[floorId];
    const mat = targetArt.mat;
    const mesh = targetArt.mesh;

    if (!imageDataUrl) {
      this.disposeActiveGalleryTexture();
      for (const fId of FLOOR_ORDER) {
        const a = this.parts.galleryArtByFloor[fId];
        a.mat.map = this.textures.screens.design;
        a.mat.emissiveMap = this.textures.screens.design;
        a.mat.needsUpdate = true;
        a.mesh.scale.set(1, 1, 1);
      }
      this.activeGalleryFloor = null;
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (this.disposed) return;
      this.disposeActiveGalleryTexture();

      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      tex.needsUpdate = true;
      this.activeGalleryTexture = tex;
      this.activeGalleryFloor = floorId;

      const mediaAspect =
        img.naturalWidth > 0 && img.naturalHeight > 0
          ? img.naturalWidth / img.naturalHeight
          : 2.12 / 1.16;
      const { scaleX, scaleY } = computeScreenFitScale(2.12, 1.16, mediaAspect);
      mesh.scale.set(scaleX, scaleY, 1);

      mat.color.setHex(0xffffff);
      mat.map = tex;
      mat.emissive.setHex(0xffffff);
      mat.emissiveMap = tex;
      mat.needsUpdate = true;
    };
    img.src = imageDataUrl;

    if (focusCamera) {
      this.floorView = floorId;
      this.applyCutawayVisibility(floorId);
      const yBase = BUILDING_FLOORS[floorId].elevationY;
      this.followSelectedAgent = false;
      this.activeCameraGoalPos.set(7.9, yBase + 2.9, -2.2);
      this.activeCameraGoalTarget.set(7.7, yBase + 2.05, -7.8);
      this.cameraTransitionActive = true;
    }
  }

  private disposeActiveVideo(): void {
    if (this.activeVideoEl) {
      this.activeVideoEl.pause();
      this.activeVideoEl.removeAttribute('src');
      this.activeVideoEl.load();
      this.activeVideoEl = null;
    }
    if (this.activeVideoTexture) {
      this.activeVideoTexture.dispose();
      this.activeVideoTexture = null;
    }
  }

  private disposeActiveGalleryTexture(): void {
    if (this.activeGalleryTexture) {
      this.activeGalleryTexture.dispose();
      this.activeGalleryTexture = null;
    }
  }

  private updateLighting(dt: number): void {
    const cfg = LIGHTING_CONFIGS[this.lightingPreset];
    const k = 1 - Math.exp(-4.5 * dt);

    _bgColorTarget.setHex(cfg.bgHex);
    (this.scene.background as THREE.Color).lerp(_bgColorTarget, k);
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(this.scene.background as THREE.Color);
    }

    _keyColorTarget.setHex(cfg.keyHex);
    this.keyLight.color.lerp(_keyColorTarget, k);
    this.keyLight.intensity = THREE.MathUtils.lerp(this.keyLight.intensity, cfg.keyIntensity, k);
    this.keyLight.position.x = THREE.MathUtils.lerp(this.keyLight.position.x, cfg.keyPos[0], k);
    this.keyLight.position.y = THREE.MathUtils.lerp(this.keyLight.position.y, cfg.keyPos[1], k);
    this.keyLight.position.z = THREE.MathUtils.lerp(this.keyLight.position.z, cfg.keyPos[2], k);

    _hemiSkyTarget.setHex(cfg.hemiSky);
    _hemiGroundTarget.setHex(cfg.hemiGround);
    this.hemiLight.color.lerp(_hemiSkyTarget, k);
    this.hemiLight.groundColor.lerp(_hemiGroundTarget, k);
    this.hemiLight.intensity = THREE.MathUtils.lerp(this.hemiLight.intensity, cfg.hemiIntensity, k);
    this.scene.environmentIntensity = THREE.MathUtils.lerp(
      this.scene.environmentIntensity,
      cfg.envIntensity,
      k
    );

    for (const lamp of this.interiorLights) {
      lamp.intensity = THREE.MathUtils.lerp(lamp.intensity, cfg.interiorPointIntensity, k);
    }

    for (const lampMat of this.parts.interiorLampMaterials) {
      lampMat.emissiveIntensity = THREE.MathUtils.lerp(
        lampMat.emissiveIntensity,
        cfg.lampEmissive,
        k
      );
    }

    const screenBoost = this.lightingPreset === 'malam' ? 1.15 : 0.65;
    for (const screenMat of this.parts.monitorScreenMaterials) {
      screenMat.emissiveIntensity = THREE.MathUtils.lerp(
        screenMat.emissiveIntensity,
        screenBoost,
        k
      );
    }

    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(
      this.renderer.toneMappingExposure,
      cfg.exposure,
      k
    );
  }

  private syncAgentVisuals(elapsedSec: number): void {
    let anyExecuting = false;

    for (const floorId of FLOOR_ORDER) {
      const floorState = this.buildingState.floors[floorId];
      const floorRigs = this.parts.agentRigsByFloor[floorId];
      const floorPhase = (floorId - 1) * 2.1;

      for (let i = 0; i < AGENT_ORDER.length; i++) {
        const id = AGENT_ORDER[i];
        const state = floorState.agents[id];
        const rig = floorRigs[id];
        if (!state || !rig) continue;

        rig.root.position.set(state.x, 0, state.z);
        rig.root.rotation.y = state.yaw;

        const isWalking = state.activity === 'walking';
        const isExecuting = state.activity === 'executing_task' || Boolean(state.activeTaskId);
        if (isExecuting) anyExecuting = true;

        if (isWalking) {
          const stride = Math.sin(elapsedSec * 7.8 + i + floorPhase);
          rig.bodyGroup.position.y = Math.abs(stride) * 0.045;
          rig.leftLeg.rotation.x = stride * 0.52;
          rig.rightLeg.rotation.x = -stride * 0.52;
          rig.leftArm.rotation.x = -stride * 0.44;
          rig.rightArm.rotation.x = stride * 0.44;
          rig.headGroup.rotation.y = Math.sin(elapsedSec * 2.1 + floorPhase) * 0.08;
        } else if (state.seated) {
          rig.bodyGroup.position.y = -0.22;
          rig.leftLeg.rotation.x = -1.25;
          rig.rightLeg.rotation.x = -1.25;

          const typingSpeed = isExecuting ? 12.0 : 5.5;
          const typeWave = Math.sin(elapsedSec * typingSpeed + i * 1.4 + floorPhase);
          rig.leftArm.rotation.x = -0.95 + typeWave * 0.09;
          rig.rightArm.rotation.x = -0.95 - typeWave * 0.09;
          rig.headGroup.rotation.y = Math.sin(elapsedSec * 1.4 + i + floorPhase) * 0.14;
        } else {
          rig.bodyGroup.position.y = Math.sin(elapsedSec * 2.2 + i + floorPhase) * 0.015;
          rig.leftLeg.rotation.x = 0;
          rig.rightLeg.rotation.x = 0;
          const gesture = Math.sin(elapsedSec * 3.1 + i + floorPhase) * 0.15;
          rig.leftArm.rotation.x = -0.28 + gesture;
          rig.rightArm.rotation.x = -0.35 - gesture;
          rig.headGroup.rotation.y = Math.sin(elapsedSec * 1.6 + floorPhase) * 0.18;
        }

        const isSelected =
          this.selectedTarget?.floorId === floorId && this.selectedTarget?.agentId === id;
        const isHovered =
          this.hoveredTarget?.floorId === floorId && this.hoveredTarget?.agentId === id;
        const ringAlpha = isSelected ? 0.92 : isExecuting ? 0.72 : isHovered ? 0.5 : 0.0;
        rig.selectionRingMat.opacity = ringAlpha;

        rig.nameSprite.position.y = state.seated ? 1.8 : 2.04;
        rig.nameSprite.scale.set(
          isSelected || isHovered ? 1.52 : 1.38,
          isSelected || isHovered ? 0.4 : 0.36,
          1
        );

        rig.taskBeacon.visible = isExecuting;
        if (isExecuting) {
          const baseY = state.seated ? 2.12 : 2.36;
          rig.taskBeacon.position.y = baseY + Math.sin(elapsedSec * 4.5) * 0.06;
          rig.taskBeacon.rotation.y = elapsedSec * 2.4;
        }

        rig.badgeGlow.emissiveIntensity = isExecuting ? 1.15 : 0.12;
      }
    }

    // Smooth panoramic glass elevator cycle between Lantai 1 (0.04m) and Lantai 3 (9.34m)
    const maxCabY = FLOOR_HEIGHT * 2;
    const elevatorWave = 0.5 - 0.5 * Math.cos(elapsedSec * 0.34);
    this.parts.elevatorCab.position.y = 0.04 + elevatorWave * maxCabY;

    // Animate server rack LED bars across all 3 floors
    const ledSpeed = anyExecuting ? 6.5 : 2.2;
    for (const led of this.parts.serverLeds) {
      const wave = 0.5 + 0.5 * Math.sin(elapsedSec * ledSpeed + led.phase);
      led.material.emissiveIntensity = 0.35 + wave * (anyExecuting ? 1.85 : 0.95);
    }
  }

  private updateCamera(dt: number): void {
    if (this.followSelectedAgent && this.selectedTarget) {
      const { floorId, agentId } = this.selectedTarget;
      const a = this.buildingState.floors[floorId]?.agents[agentId];
      const yBase = BUILDING_FLOORS[floorId].elevationY;
      if (a) {
        _camGoalTarget.set(a.x, yBase + 0.35, a.z + 0.8);
        _camGoalPos.set(a.x + 5.6, yBase + 5.4, a.z + 6.4);
        const factor = 1 - Math.exp(-5.0 * dt);
        this.controls.target.lerp(_camGoalTarget, factor);
        this.camera.position.lerp(_camGoalPos, factor);
      }
    } else if (this.cameraTransitionActive) {
      const factor = 1 - Math.exp(-5.5 * dt);
      this.camera.position.lerp(this.activeCameraGoalPos, factor);
      this.controls.target.lerp(this.activeCameraGoalTarget, factor);

      if (
        this.camera.position.distanceToSquared(this.activeCameraGoalPos) < 0.01 &&
        this.controls.target.distanceToSquared(this.activeCameraGoalTarget) < 0.01
      ) {
        this.cameraTransitionActive = false;
      }
    }

    this.controls.update();
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (status === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;

    const now = performance.now();
    const realDt = Math.min((now - this.lastFrameMs) / 1000, 0.12);
    this.lastFrameMs = now;

    if (this.simSpeed > 0) {
      this.buildingState = stepBuildingSimulation(this.buildingState, realDt * this.simSpeed);
    }

    this.syncAgentVisuals(now * 0.001);
    this.updateLighting(realDt);
    this.updateCamera(realDt);

    if (now - this.lastUiSyncMs > 260) {
      this.lastUiSyncMs = now;
      this.callbacks.onStateSnapshot(this.buildingState);
    }

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = window.requestAnimationFrame(this.tick);
    }
  };

  public dispose(): void {
    this.disposed = true;
    window.cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);

    window.removeEventListener('resize', this.handleResize);
    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.handlePointerDown);
    dom.removeEventListener('pointerup', this.handlePointerUp);
    dom.removeEventListener('pointermove', this.handlePointerMove);
    dom.removeEventListener('webglcontextlost', this.handleContextLost);

    this.disposeActiveVideo();
    this.disposeActiveGalleryTexture();
    this.controls.dispose();
    this.textures.dispose();
    this.envRT.dispose();

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      } else if (obj instanceof THREE.Sprite) {
        obj.material.map?.dispose();
        obj.material.dispose();
      }
    });

    this.renderer.dispose();
    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}
