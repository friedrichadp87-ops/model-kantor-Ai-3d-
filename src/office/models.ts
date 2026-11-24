import * as THREE from 'three';
import { getHumanAppearance } from './humanAppearance';
import { OFFICE_DIMENSIONS, WORKSTATIONS } from './layout';
import type { OfficeTexturePack } from './textures';
import type { AgentId } from './types';

export interface ServerLedRef {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  phase: number;
}

export interface AgentVisualRig {
  id: AgentId;
  root: THREE.Group;
  bodyGroup: THREE.Group;
  headGroup: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  badgeGlow: THREE.MeshStandardMaterial;
  selectionRing: THREE.Mesh;
  selectionRingMat: THREE.MeshBasicMaterial;
  taskBeacon: THREE.Mesh;
  nameSprite: THREE.Sprite;
  hitbox: THREE.Mesh;
}

export interface OfficeSceneParts {
  root: THREE.Group;
  serverLeds: ServerLedRef[];
  interiorLampMaterials: THREE.MeshStandardMaterial[];
  monitorScreenMaterials: THREE.MeshStandardMaterial[];
  meetingScreenMesh: THREE.Mesh;
  meetingScreenMat: THREE.MeshStandardMaterial;
  galleryArtMesh: THREE.Mesh;
  galleryArtMat: THREE.MeshStandardMaterial;
  agentRigs: Record<AgentId, AgentVisualRig>;
  interactables: THREE.Object3D[];
}

export function buildOfficeScene(
  textures: OfficeTexturePack,
  isSoftwareGl: boolean,
  agentMeta: Array<{ id: AgentId; tagLabel: string; accentHex: string }>
): OfficeSceneParts {
  const root = new THREE.Group();
  const serverLeds: ServerLedRef[] = [];
  const interiorLampMaterials: THREE.MeshStandardMaterial[] = [];
  const monitorScreenMaterials: THREE.MeshStandardMaterial[] = [];
  const interactables: THREE.Object3D[] = [];

  // Shared calibrated PBR materials (varying roughness >= 0.25 between adjacent surfaces)
  const mats = {
    plinth: new THREE.MeshStandardMaterial({ color: 0x2b3440, roughness: 0.78, metalness: 0.08 }),
    plinthTrim: new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.32, metalness: 0.65 }),
    oakFloor: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.oakColor,
      bumpMap: textures.oakBump,
      bumpScale: 0.015,
      roughness: 0.58,
      metalness: 0.02,
    }),
    terrazzoFloor: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.terrazzoColor,
      bumpMap: textures.terrazzoBump,
      bumpScale: 0.012,
      roughness: 0.44,
      metalness: 0.05,
    }),
    wallPlaster: new THREE.MeshStandardMaterial({ color: 0xf1efe9, roughness: 0.88, metalness: 0.0 }),
    wallExterior: new THREE.MeshStandardMaterial({ color: 0xd8dee6, roughness: 0.75, metalness: 0.05 }),
    walnutWood: new THREE.MeshStandardMaterial({ color: 0x6b4b34, roughness: 0.52, metalness: 0.04 }),
    oakDesk: new THREE.MeshStandardMaterial({ color: 0xc99c6b, roughness: 0.48, metalness: 0.02 }),
    matteBlackMetal: new THREE.MeshStandardMaterial({ color: 0x1e242c, roughness: 0.36, metalness: 0.72 }),
    brushedSteel: new THREE.MeshStandardMaterial({ color: 0xb8c2cc, roughness: 0.24, metalness: 0.84 }),
    brassAccent: new THREE.MeshStandardMaterial({ color: 0xc89d46, roughness: 0.22, metalness: 0.88 }),
    chairFabric: new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.9, metalness: 0.0 }),
    sofaFabric: new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.92, metalness: 0.0 }),
    cushionFabric: new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.88, metalness: 0.0 }),
    ceramicPot: new THREE.MeshStandardMaterial({ color: 0xe6e1d6, roughness: 0.42, metalness: 0.04 }),
    soil: new THREE.MeshStandardMaterial({ color: 0x3b2d22, roughness: 0.96, metalness: 0.0 }),
    glassWall: new THREE.MeshPhysicalMaterial({
      color: 0xdbeafe,
      roughness: 0.08,
      metalness: 0.05,
      transparent: true,
      opacity: isSoftwareGl ? 0.24 : 0.26,
      depthWrite: false,
      clearcoat: 1.0,
    }),
    windowGlass: new THREE.MeshPhysicalMaterial({
      color: 0xe0f2fe,
      roughness: 0.06,
      metalness: 0.1,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    }),
  };

  // 1. ARCHITECTURAL SHELL & PLINTH
  const shell = buildArchitecturalShell(mats, textures, interiorLampMaterials);
  root.add(shell);

  // 2. WORKSTATIONS (13 Named AI Agent Desks)
  const screenMatByVariant: Record<
    'roadmap' | 'code' | 'design' | 'analytics' | 'coordination',
    THREE.MeshStandardMaterial
  > = {
    roadmap: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.screens.roadmap,
      emissive: new THREE.Color(0x93c5fd),
      emissiveMap: textures.screens.roadmap,
      emissiveIntensity: 0.65,
      roughness: 0.2,
      metalness: 0.1,
    }),
    code: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.screens.code,
      emissive: new THREE.Color(0x93c5fd),
      emissiveMap: textures.screens.code,
      emissiveIntensity: 0.65,
      roughness: 0.2,
      metalness: 0.1,
    }),
    design: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.screens.design,
      emissive: new THREE.Color(0x93c5fd),
      emissiveMap: textures.screens.design,
      emissiveIntensity: 0.65,
      roughness: 0.2,
      metalness: 0.1,
    }),
    analytics: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.screens.analytics,
      emissive: new THREE.Color(0x93c5fd),
      emissiveMap: textures.screens.analytics,
      emissiveIntensity: 0.65,
      roughness: 0.2,
      metalness: 0.1,
    }),
    coordination: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.screens.coordination,
      emissive: new THREE.Color(0x93c5fd),
      emissiveMap: textures.screens.coordination,
      emissiveIntensity: 0.65,
      roughness: 0.2,
      metalness: 0.1,
    }),
  };
  monitorScreenMaterials.push(...Object.values(screenMatByVariant));

  for (const ws of WORKSTATIONS) {
    const deskGroup = createWorkstation(
      mats,
      screenMatByVariant[ws.screenVariant],
      Boolean(ws.dualMonitor)
    );
    deskGroup.position.set(ws.deskX, 0, ws.deskZ);
    root.add(deskGroup);

    const chair = createOfficeChair(mats);
    chair.position.set(ws.chairX, 0, ws.chairZ);
    chair.rotation.y = Math.PI;
    root.add(chair);
  }

  // 3. GLASS MEETING ROOM FURNITURE
  const meetingScreenMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.screens.meeting,
    emissive: new THREE.Color(0xbfdbfe),
    emissiveMap: textures.screens.meeting,
    emissiveIntensity: 0.65,
    roughness: 0.22,
    metalness: 0.08,
  });
  monitorScreenMaterials.push(meetingScreenMat);
  const { group: meetingGroup, tvScreen: meetingScreenMesh } = createMeetingRoomFurniture(
    mats,
    meetingScreenMat,
    interiorLampMaterials
  );
  root.add(meetingGroup);

  // 3B. COMPOSITE 3D MEDIA GALLERY FRAME (North Wall above Engineering/Design Bay)
  const galleryArtMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.screens.design,
    emissive: new THREE.Color(0xfffbeb),
    emissiveMap: textures.screens.design,
    emissiveIntensity: 0.22,
    roughness: 0.34,
    metalness: 0.04,
  });
  const { group: galleryFrameGroup, artMesh: galleryArtMesh } = createMediaGalleryDisplay(
    mats,
    galleryArtMat,
    interiorLampMaterials
  );
  galleryFrameGroup.position.set(7.7, 2.08, -7.82);
  root.add(galleryFrameGroup);

  // 3C. COMPOSITE 9-PART 3D CINEMA & STUDIO PRODUCTION PEDESTAL (South-Central Creative Bay)
  const mediaPedestal = createMediaStudioPedestal(mats, textures.contactShadow, serverLeds);
  mediaPedestal.position.set(0.15, 0, 5.45);
  mediaPedestal.rotation.y = -Math.PI * 0.28;
  root.add(mediaPedestal);

  // 4. AI SERVER CORE (3 Tall Multi-Part Server Racks)
  const rackXs = [1.3, 2.6, 3.9];
  rackXs.forEach((rx, idx) => {
    const rack = createServerRack(mats, serverLeds, idx);
    rack.position.set(rx, 0.02, -6.7);
    root.add(rack);
  });

  // 5. COFFEE BAR & COLLABORATION LOUNGE
  root.add(createCoffeeLounge(mats, textures));

  // 6. WHITEBOARD EASEL & ARCHITECTURAL BOOKSHELF + INDOOR PLANTS
  const whiteboard = createWhiteboardEasel(mats, textures.whiteboard);
  whiteboard.position.set(10.35, 0, 0.75);
  whiteboard.rotation.y = -Math.PI * 0.5;
  root.add(whiteboard);

  const bookshelf = createBookshelf(mats);
  bookshelf.position.set(-10.52, 0, -4.4);
  bookshelf.rotation.y = Math.PI / 2;
  root.add(bookshelf);

  // Indoor architectural trees placed cleanly in corners & zone anchors
  const plantPlacements = [
    { x: -10.15, z: -7.1, scale: 1.04 },
    { x: -10.0, z: 6.7, scale: 0.96 },
    { x: 10.25, z: -7.1, scale: 1.02 },
    { x: 3.1, z: 6.7, scale: 0.92 },
    { x: -1.2, z: -7.15, scale: 0.85 },
  ];
  for (const p of plantPlacements) {
    const plant = createIndoorPlant(mats, p.scale);
    plant.position.set(p.x, 0, p.z);
    root.add(plant);
  }

  // 7. 13 COMPOSITE ARTICULATED 3D HUMAN STUDIO TEAM CHARACTERS WITH FLOATING NAMETAGS
  const humanPool = createHumanSharedPool();
  const agentRigs = {} as Record<AgentId, AgentVisualRig>;
  for (const meta of agentMeta) {
    const rig = createAgentRig(
      meta.id,
      meta.tagLabel,
      meta.accentHex,
      textures.contactShadow,
      humanPool
    );
    agentRigs[meta.id] = rig;
    root.add(rig.root);
    interactables.push(rig.hitbox);
  }

  return {
    root,
    serverLeds,
    interiorLampMaterials,
    monitorScreenMaterials,
    meetingScreenMesh,
    meetingScreenMat,
    galleryArtMesh,
    galleryArtMat,
    agentRigs,
    interactables,
  };
}

function buildArchitecturalShell(
  mats: Record<string, THREE.Material>,
  _textures: OfficeTexturePack,
  interiorLampMaterials: THREE.MeshStandardMaterial[]
): THREE.Group {
  const group = new THREE.Group();
  const { width, depth, wallHeight, plinthHeight } = OFFICE_DIMENSIONS;

  // Raised architectural plinth slab with metallic bevel trim (strictly below floor slab to prevent Z-fighting)
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.8, plinthHeight, depth + 0.8),
    mats.plinth
  );
  plinth.position.set(0, -plinthHeight / 2 - 0.09, 0);
  plinth.receiveShadow = true;
  group.add(plinth);

  const plinthTrim = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.86, 0.05, depth + 0.86),
    mats.plinthTrim
  );
  plinthTrim.position.set(0, -0.065, 0);
  group.add(plinthTrim);

  // Main oak parquet floor (solid 0.04m slab with top cleanly at y = 0.0)
  const mainFloor = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.04, depth),
    mats.oakFloor
  );
  mainFloor.position.set(0, -0.02, 0);
  mainFloor.receiveShadow = true;
  group.add(mainFloor);

  // Terrazzo floor insets (cleanly raised 0.024m above oak floor, zero Z-fighting)
  const serverFloor = new THREE.Mesh(
    new THREE.BoxGeometry(5.2, 0.024, 4.8),
    mats.terrazzoFloor
  );
  serverFloor.position.set(2.6, 0.012, -5.6);
  serverFloor.receiveShadow = true;
  group.add(serverFloor);

  const meetingFloor = new THREE.Mesh(
    new THREE.BoxGeometry(8.6, 0.024, 6.8),
    mats.terrazzoFloor
  );
  meetingFloor.position.set(-6.7, 0.012, 4.0);
  meetingFloor.receiveShadow = true;
  group.add(meetingFloor);

  // NORTH BACK WALL (z = -8) with recessed window & walnut acoustic slats
  const northWall = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4, wallHeight, 0.32), mats.wallPlaster);
  northWall.position.set(0, wallHeight / 2, -depth / 2 - 0.16);
  northWall.castShadow = true;
  northWall.receiveShadow = true;
  group.add(northWall);

  // Baseboard trim along North wall
  const northBaseboard = new THREE.Mesh(new THREE.BoxGeometry(width, 0.14, 0.05), mats.matteBlackMetal);
  northBaseboard.position.set(0, 0.07, -depth / 2 + 0.025);
  group.add(northBaseboard);

  // Acoustic walnut wood slats behind Research & Engineering zones
  const slatGeo = new THREE.BoxGeometry(0.11, wallHeight - 0.55, 0.06);
  const slatPositions: number[] = [];
  for (let x = -9.4; x <= -2.0; x += 0.24) slatPositions.push(x);
  for (let x = 5.6; x <= 10.4; x += 0.24) slatPositions.push(x);

  const slatInstanced = new THREE.InstancedMesh(slatGeo, mats.walnutWood, slatPositions.length);
  const dummy = new THREE.Object3D();
  slatPositions.forEach((sx, i) => {
    dummy.position.set(sx, (wallHeight - 0.2) / 2 + 0.08, -depth / 2 + 0.035);
    dummy.updateMatrix();
    slatInstanced.setMatrixAt(i, dummy.matrix);
  });
  slatInstanced.instanceMatrix.needsUpdate = true;
  slatInstanced.computeBoundingSphere();
  slatInstanced.receiveShadow = true;
  group.add(slatInstanced);

  // WEST BACK WALL (x = -11) built with architectural window bays
  const westLower = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.0, depth + 0.4), mats.wallPlaster);
  westLower.position.set(-width / 2 - 0.16, 0.5, 0);
  westLower.castShadow = true;
  westLower.receiveShadow = true;
  group.add(westLower);

  const westUpper = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.65, depth + 0.4), mats.wallPlaster);
  westUpper.position.set(-width / 2 - 0.16, wallHeight - 0.325, 0);
  westUpper.castShadow = true;
  group.add(westUpper);

  // Solid architectural wall sections on West wall positioned squarely behind the Bookshelf (-4.4) and Meeting TV (4.0)
  const solidWestSegments = [
    { z: -7.5, len: 1.4 },
    { z: -4.4, len: 2.8 }, // Solid backdrop behind Bookshelf
    { z: 0.7, len: 1.4 },  // Solid anchor where Meeting Room glass meets West wall
    { z: 4.0, len: 3.1 },  // Solid backdrop behind Meeting Presentation TV
    { z: 7.5, len: 1.4 },
  ];
  for (const seg of solidWestSegments) {
    const pilaster = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, wallHeight - 1.65, seg.len),
      mats.wallPlaster
    );
    pilaster.position.set(-width / 2 - 0.16, 1.0 + (wallHeight - 1.65) / 2, seg.z);
    pilaster.castShadow = true;
    pilaster.receiveShadow = true;
    group.add(pilaster);
  }

  // Recessed black aluminum window frames + glass panes on West wall (cleanly flanking solid bays)
  const windowBays = [
    { z: -6.3, len: 1.05 },
    { z: -1.5, len: 3.0 },
    { z: 1.92, len: 1.05 },
    { z: 6.18, len: 1.25 },
  ];
  for (const wb of windowBays) {
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, wb.len), mats.matteBlackMetal);
    frameTop.position.set(-width / 2 - 0.1, wallHeight - 0.68, wb.z);
    group.add(frameTop);

    const frameBot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, wb.len), mats.matteBlackMetal);
    frameBot.position.set(-width / 2 - 0.1, 1.04, wb.z);
    group.add(frameBot);

    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, wallHeight - 1.76, wb.len - 0.08),
      mats.windowGlass
    );
    glass.position.set(-width / 2 - 0.14, 1.04 + (wallHeight - 1.76) / 2, wb.z);
    glass.renderOrder = 2;
    group.add(glass);

    if (wb.len > 2.0) {
      const mullion = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, wallHeight - 1.76, 0.06),
        mats.matteBlackMetal
      );
      mullion.position.set(-width / 2 - 0.12, 1.04 + (wallHeight - 1.76) / 2, wb.z);
      group.add(mullion);
    }
  }

  // GLASS PARTITIONS — SERVER CORE (x: 0.0 to 5.2, z: -8.0 to -3.2, open doorway at x: 1.85..3.35)
  const glassH = 3.1;
  group.add(createGlassPartition(0.0, -5.6, 0.08, 4.8, glassH, mats, true));
  group.add(createGlassPartition(5.2, -5.6, 0.08, 4.8, glassH, mats, true));
  // South front of server room split into left & right panels framing doorway (x: 1.85..3.35)
  group.add(createGlassPartition(0.92, -3.2, 1.85, 0.08, glassH, mats, false));
  group.add(createGlassPartition(4.28, -3.2, 1.85, 0.08, glassH, mats, false));
  // Doorway header transom over server entry
  const serverDoorHeader = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.65, 0.09), mats.matteBlackMetal);
  serverDoorHeader.position.set(2.6, glassH - 0.325, -3.2);
  group.add(serverDoorHeader);

  // GLASS PARTITIONS — MEETING ROOM (x: -11.0 to -2.4, z: 0.6 to 7.4, open doorway at x: -4.55..-2.85)
  group.add(createGlassPartition(-7.75, 0.6, 6.4, 0.08, glassH, mats, false));
  group.add(createGlassPartition(-2.62, 0.6, 0.45, 0.08, glassH, mats, false));
  group.add(createGlassPartition(-2.4, 4.0, 0.08, 6.8, glassH, mats, true));
  const meetDoorHeader = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.65, 0.09), mats.matteBlackMetal);
  meetDoorHeader.position.set(-3.7, glassH - 0.325, 0.6);
  group.add(meetDoorHeader);

  // Wall-mounted architectural linear sconces (anchored flush against North wall, zero floating ceiling rods)
  const lampEmissiveMat = new THREE.MeshStandardMaterial({
    color: 0xfffbeb,
    emissive: new THREE.Color(0xfef3c7),
    emissiveIntensity: 0.9,
    roughness: 0.25,
    metalness: 0.1,
  });
  interiorLampMaterials.push(lampEmissiveMat);

  const wallSconces = [
    { x: -7.6, y: 3.35, z: -7.9, len: 2.2 },
    { x: -3.6, y: 3.35, z: -7.9, len: 2.2 },
    { x: 7.7, y: 3.35, z: -7.9, len: 2.8 },
  ];
  for (const sc of wallSconces) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(sc.len, 0.08, 0.14), mats.matteBlackMetal);
    housing.position.set(sc.x, sc.y, sc.z);
    group.add(housing);

    const diffuser = new THREE.Mesh(new THREE.BoxGeometry(sc.len - 0.08, 0.03, 0.1), lampEmissiveMat);
    diffuser.position.set(sc.x, sc.y - 0.04, sc.z + 0.01);
    group.add(diffuser);
  }

  // Minimalist geometric studio emblem on North wall above Server Core
  const signBacking = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.46, 0.06), mats.matteBlackMetal);
  signBacking.position.set(2.6, 3.55, -7.86);
  group.add(signBacking);

  const signAccent = new THREE.Mesh(new THREE.BoxGeometry(2.46, 0.05, 0.07), mats.brassAccent);
  signAccent.position.set(2.6, 3.35, -7.85);
  group.add(signAccent);

  return group;
}

function createGlassPartition(
  x: number,
  z: number,
  w: number,
  d: number,
  h: number,
  mats: Record<string, THREE.Material>,
  alongZ: boolean
): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  // Top & bottom matte black aluminum rails
  const botRail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.09, d), mats.matteBlackMetal);
  botRail.position.y = 0.045;
  g.add(botRail);

  const topRail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.09, d), mats.matteBlackMetal);
  topRail.position.y = h - 0.045;
  g.add(topRail);

  // End jamb posts
  const span = alongZ ? d : w;
  const postCount = Math.max(2, Math.round(span / 2.2) + 1);
  for (let i = 0; i < postCount; i++) {
    const t = i / (postCount - 1) - 0.5;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, 0.08), mats.matteBlackMetal);
    if (alongZ) post.position.set(0, h / 2, t * (d - 0.08));
    else post.position.set(t * (w - 0.08), h / 2, 0);
    g.add(post);
  }

  // Glass pane
  const pane = new THREE.Mesh(
    new THREE.BoxGeometry(alongZ ? 0.025 : w - 0.08, h - 0.18, alongZ ? d - 0.08 : 0.025),
    mats.glassWall
  );
  pane.position.y = h / 2;
  pane.renderOrder = 3;
  g.add(pane);

  return g;
}

function createWorkstation(
  mats: Record<string, THREE.Material>,
  screenMat: THREE.MeshStandardMaterial,
  dualMonitor: boolean
): THREE.Group {
  const g = new THREE.Group();

  // Sleek 1.55m x 0.82m architectural studio desk slab (fits all 13 divisions cleanly)
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.065, 0.82), mats.oakDesk);
  top.position.y = 0.76;
  top.castShadow = true;
  top.receiveShadow = true;
  g.add(top);

  // Cantilevered matte black steel legs + modesty crossbar
  const legGeo = new THREE.BoxGeometry(0.055, 0.73, 0.66);
  const leftLeg = new THREE.Mesh(legGeo, mats.matteBlackMetal);
  leftLeg.position.set(-0.68, 0.365, 0);
  leftLeg.castShadow = true;
  g.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, mats.matteBlackMetal);
  rightLeg.position.set(0.68, 0.365, 0);
  rightLeg.castShadow = true;
  g.add(rightLeg);

  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.07, 0.045), mats.matteBlackMetal);
  crossbar.position.set(0, 0.56, -0.26);
  g.add(crossbar);

  // Desk mat
  const matMesh = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.008, 0.34), mats.chairFabric);
  matMesh.position.set(0, 0.798, 0.12);
  g.add(matMesh);

  // Mechanical keyboard + mouse
  const kb = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.02, 0.13), mats.matteBlackMetal);
  kb.position.set(-0.07, 0.812, 0.14);
  g.add(kb);

  const mouse = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.02, 0.1), mats.brushedSteel);
  mouse.position.set(0.22, 0.812, 0.14);
  g.add(mouse);

  // Main studio monitor on brushed steel arm (facing +Z toward seated agent)
  const standBase = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.16), mats.brushedSteel);
  standBase.position.set(0, 0.802, -0.25);
  g.add(standBase);

  const standPost = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.34, 10), mats.brushedSteel);
  standPost.position.set(0, 0.96, -0.27);
  g.add(standPost);

  const monitorHousing = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.44, 0.036), mats.matteBlackMetal);
  monitorHousing.position.set(0, 1.15, -0.21);
  monitorHousing.castShadow = true;
  g.add(monitorHousing);

  const monitorScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.79, 0.39), screenMat);
  monitorScreen.position.set(0, 1.15, -0.19);
  g.add(monitorScreen);

  // Optional vertical secondary Shorts 9:16 preview monitor
  if (dualMonitor) {
    const sideGroup = new THREE.Group();
    sideGroup.position.set(0.56, 1.16, -0.14);
    sideGroup.rotation.y = -0.34;

    const sideHousing = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.46, 0.032), mats.matteBlackMetal);
    sideHousing.castShadow = true;
    sideGroup.add(sideHousing);

    const sideScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.41), screenMat);
    sideScreen.position.z = 0.017;
    sideGroup.add(sideScreen);
    g.add(sideGroup);
  }

  // Compact brass-accent desk lamp on left side
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.072, 0.022, 12), mats.matteBlackMetal);
  lampBase.position.set(-0.56, 0.805, -0.2);
  g.add(lampBase);

  const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 8), mats.brassAccent);
  lampStem.position.set(-0.56, 0.98, -0.2);
  lampStem.rotation.z = -0.18;
  g.add(lampStem);

  const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.12, 12), mats.matteBlackMetal);
  lampShade.position.set(-0.48, 1.14, -0.17);
  lampShade.rotation.z = -0.45;
  g.add(lampShade);

  // Ceramic coffee mug on desk
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.034, 0.085, 10), mats.ceramicPot);
  mug.position.set(0.54, 0.835, 0.2);
  g.add(mug);

  return g;
}

function createOfficeChair(mats: Record<string, THREE.Material>): THREE.Group {
  const g = new THREE.Group();

  // 5-star caster base
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.29), mats.matteBlackMetal);
    arm.position.set(Math.sin(a) * 0.14, 0.06, Math.cos(a) * 0.14);
    arm.rotation.y = a;
    g.add(arm);
  }

  const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.4, 12), mats.brushedSteel);
  piston.position.y = 0.26;
  g.add(piston);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.48), mats.chairFabric);
  seat.position.y = 0.48;
  seat.castShadow = true;
  g.add(seat);

  const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.54, 0.06), mats.chairFabric);
  backrest.position.set(0, 0.78, -0.22);
  backrest.rotation.x = -0.12;
  backrest.castShadow = true;
  g.add(backrest);

  // Armrests
  const armGeo = new THREE.BoxGeometry(0.05, 0.035, 0.3);
  [-0.26, 0.26].forEach((ax) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.18, 0.04), mats.matteBlackMetal);
    post.position.set(ax, 0.58, -0.04);
    g.add(post);

    const rest = new THREE.Mesh(armGeo, mats.matteBlackMetal);
    rest.position.set(ax, 0.67, 0.02);
    g.add(rest);
  });

  return g;
}

function createMeetingRoomFurniture(
  mats: Record<string, THREE.Material>,
  meetingScreenMat: THREE.MeshStandardMaterial,
  interiorLampMaterials: THREE.MeshStandardMaterial[]
): { group: THREE.Group; tvScreen: THREE.Mesh } {
  const g = new THREE.Group();

  // Oval walnut conference table centered at (-6.5, 4.0)
  const tableGroup = new THREE.Group();
  tableGroup.position.set(-6.5, 0.025, 4.0);

  const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.08, 32), mats.walnutWood);
  tableTop.scale.set(1.85, 1, 0.92);
  tableTop.position.y = 0.75;
  tableTop.castShadow = true;
  tableTop.receiveShadow = true;
  tableGroup.add(tableTop);

  // Dual sculpted pedestal bases
  [-1.05, 1.05].forEach((px) => {
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 0.71, 18), mats.matteBlackMetal);
    ped.position.set(px, 0.355, 0);
    ped.castShadow = true;
    tableGroup.add(ped);
  });

  // Conference speakerphone puck
  const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.04, 18), mats.brushedSteel);
  puck.position.set(0, 0.81, 0);
  tableGroup.add(puck);

  g.add(tableGroup);

  // 6 Meeting chairs aligned to meet_1..meet_6
  const chairSpots = [
    { x: -8.0, z: 2.55, yaw: 0 },
    { x: -6.5, z: 2.55, yaw: 0 },
    { x: -5.0, z: 2.55, yaw: 0 },
    { x: -8.0, z: 5.45, yaw: Math.PI },
    { x: -6.5, z: 5.45, yaw: Math.PI },
    { x: -5.0, z: 5.45, yaw: Math.PI },
  ];
  for (const spot of chairSpots) {
    const c = createOfficeChair(mats);
    c.position.set(spot.x, 0.025, spot.z);
    c.rotation.y = spot.yaw;
    g.add(c);
  }

  // Wall-mounted presentation display mounted cleanly on solid West wall bay facing East (+X)
  const tvFrame = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.35, 2.35), mats.matteBlackMetal);
  tvFrame.position.set(-10.92, 2.15, 4.0);
  g.add(tvFrame);

  const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(2.22, 1.22), meetingScreenMat);
  tvScreen.position.set(-10.87, 2.15, 4.0);
  tvScreen.rotation.y = Math.PI / 2;
  g.add(tvScreen);

  // Architectural wall sconce mounted cleanly above the Meeting Room presentation screen
  const pendantMat = new THREE.MeshStandardMaterial({
    color: 0xfff7ed,
    emissive: new THREE.Color(0xfde68a),
    emissiveIntensity: 0.95,
    roughness: 0.2,
  });
  interiorLampMaterials.push(pendantMat);

  const sconceBar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 2.2), mats.brassAccent);
  sconceBar.position.set(-10.88, 3.12, 4.0);
  g.add(sconceBar);

  const sconceGlow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 2.08), pendantMat);
  sconceGlow.position.set(-10.86, 3.08, 4.0);
  g.add(sconceGlow);

  return { group: g, tvScreen };
}

function createMediaGalleryDisplay(
  mats: Record<string, THREE.Material>,
  galleryArtMat: THREE.MeshStandardMaterial,
  interiorLampMaterials: THREE.MeshStandardMaterial[]
): { group: THREE.Group; artMesh: THREE.Mesh } {
  const g = new THREE.Group();

  // 1. Recessed matte-black shadowbox backing (flush against North acoustic slats)
  const backing = new THREE.Mesh(new THREE.BoxGeometry(2.44, 1.44, 0.06), mats.matteBlackMetal);
  backing.castShadow = true;
  backing.receiveShadow = true;
  g.add(backing);

  // 2. Four sculpted walnut gallery frame rails (varying roughness vs matte metal)
  const railHGeo = new THREE.BoxGeometry(2.56, 0.09, 0.1);
  const railVGeo = new THREE.BoxGeometry(0.09, 1.48, 0.1);
  const topRail = new THREE.Mesh(railHGeo, mats.walnutWood);
  topRail.position.set(0, 0.72, 0.025);
  const botRail = new THREE.Mesh(railHGeo, mats.walnutWood);
  botRail.position.set(0, -0.72, 0.025);
  const leftRail = new THREE.Mesh(railVGeo, mats.walnutWood);
  leftRail.position.set(-1.235, 0, 0.025);
  const rightRail = new THREE.Mesh(railVGeo, mats.walnutWood);
  rightRail.position.set(1.235, 0, 0.025);
  g.add(topRail, botRail, leftRail, rightRail);

  // 3. Brushed-brass corner brackets (accent scale)
  const bracketGeo = new THREE.BoxGeometry(0.14, 0.14, 0.112);
  [
    [-1.235, 0.72],
    [1.235, 0.72],
    [-1.235, -0.72],
    [1.235, -0.72],
  ].forEach(([bx, by]) => {
    const bracket = new THREE.Mesh(bracketGeo, mats.brassAccent);
    bracket.position.set(bx, by, 0.028);
    g.add(bracket);
  });

  // 4. Museum matte off-white inner mat board
  const matBoard = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.3, 0.02), mats.wallPlaster);
  matBoard.position.set(0, 0, 0.032);
  g.add(matBoard);

  // 5. Swappable AI artwork canvas plane
  const artMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.12, 1.16), galleryArtMat);
  artMesh.position.set(0, 0, 0.048);
  g.add(artMesh);

  // 6. Curved brass gallery picture-light arm via TubeGeometry
  const armCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.76, 0.02),
    new THREE.Vector3(0, 0.94, 0.14),
    new THREE.Vector3(0, 0.92, 0.34),
  ]);
  const armTube = new THREE.Mesh(
    new THREE.TubeGeometry(armCurve, 14, 0.016, 10, false),
    mats.brassAccent
  );
  g.add(armTube);

  // 7. Gallery spotlight shade + warm emissive diffuser
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 1.18, 14), mats.matteBlackMetal);
  shade.rotation.z = Math.PI / 2;
  shade.position.set(0, 0.91, 0.35);
  g.add(shade);

  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xfffbeb,
    emissive: new THREE.Color(0xfde68a),
    emissiveIntensity: 0.85,
    roughness: 0.2,
  });
  interiorLampMaterials.push(glowMat);
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.02, 0.035), glowMat);
  diffuser.position.set(0, 0.885, 0.35);
  g.add(diffuser);

  return { group: g, artMesh };
}

function createMediaStudioPedestal(
  mats: Record<string, THREE.Material>,
  contactShadowTex: THREE.CanvasTexture,
  serverLeds: ServerLedRef[]
): THREE.Group {
  const g = new THREE.Group();

  // 1. Soft radial contact shadow disc grounded flush at y = 0.016
  const shadowDisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 24),
    new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    })
  );
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = 0.016;
  g.add(shadowDisc);

  // 2. Sculpted weighted pedestal base via LatheGeometry (bottom-center pivot y = 0)
  const lathePoints = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.42, 0.0),
    new THREE.Vector2(0.4, 0.06),
    new THREE.Vector2(0.24, 0.14),
    new THREE.Vector2(0.11, 0.24),
    new THREE.Vector2(0.075, 0.98),
    new THREE.Vector2(0.12, 1.04),
    new THREE.Vector2(0.12, 1.12),
    new THREE.Vector2(0.0, 1.12),
  ];
  const pedestalColumn = new THREE.Mesh(
    new THREE.LatheGeometry(lathePoints, 24),
    mats.matteBlackMetal
  );
  pedestalColumn.castShadow = true;
  pedestalColumn.receiveShadow = true;
  g.add(pedestalColumn);

  // 3. Brushed-steel height collar & walnut grip band (roughness contrast >= 0.25)
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.12, 20), mats.brushedSteel);
  collar.position.y = 0.62;
  g.add(collar);

  const walnutBand = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.07, 20), mats.walnutWood);
  walnutBand.position.y = 1.09;
  g.add(walnutBand);

  // 4. Dual-arm cinema gimbal yoke
  const yokeBase = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.12), mats.brushedSteel);
  yokeBase.position.y = 1.16;
  g.add(yokeBase);
  [-0.2, 0.2].forEach((yx) => {
    const yokeArm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.09), mats.brushedSteel);
    yokeArm.position.set(yx, 1.32, 0);
    g.add(yokeArm);
  });

  // 5. Composite cinema camera body + top carry handle
  const camHead = new THREE.Group();
  camHead.position.set(0, 1.44, 0);
  camHead.rotation.x = -0.06;

  const camBody = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.42), mats.plinth);
  camBody.castShadow = true;
  camHead.add(camBody);

  const handleBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.3), mats.walnutWood);
  handleBar.position.set(0, 0.19, -0.02);
  camHead.add(handleBar);
  [-0.1, 0.1].forEach((hz) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.08, 10), mats.brushedSteel);
    post.position.set(0, 0.15, hz);
    camHead.add(post);
  });

  // 6. Optical cinema lens barrel + brass aperture focus ring + glossy glass lens
  const lensBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.22, 20), mats.matteBlackMetal);
  lensBarrel.rotation.x = Math.PI / 2;
  lensBarrel.position.set(0, -0.01, 0.3);
  camHead.add(lensBarrel);

  const brassRing = new THREE.Mesh(new THREE.CylinderGeometry(0.094, 0.094, 0.045, 20), mats.brassAccent);
  brassRing.rotation.x = Math.PI / 2;
  brassRing.position.set(0, -0.01, 0.32);
  camHead.add(brassRing);

  const lensGlass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.072, 0.072, 0.02, 20),
    new THREE.MeshPhysicalMaterial({
      color: 0x0ea5e9,
      roughness: 0.06,
      metalness: 0.2,
      clearcoat: 1.0,
    })
  );
  lensGlass.rotation.x = Math.PI / 2;
  lensGlass.position.set(0, -0.01, 0.405);
  camHead.add(lensGlass);

  // 7. Matte-box lens hood
  const matteBox = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.07), mats.matteBlackMetal);
  matteBox.position.set(0, -0.01, 0.43);
  camHead.add(matteBox);

  // 8. Articulated side director preview monitor
  const previewFrame = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.15, 0.025), mats.matteBlackMetal);
  previewFrame.position.set(-0.24, 0.06, -0.06);
  previewFrame.rotation.y = -0.35;
  camHead.add(previewFrame);

  // 9. Subtle studio tally LED bar (reuses existing animated LED array)
  const tallyMat = new THREE.MeshStandardMaterial({
    color: 0xf43f5e,
    emissive: new THREE.Color(0xf43f5e),
    emissiveIntensity: 0.9,
    roughness: 0.2,
  });
  const tally = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.02), tallyMat);
  tally.position.set(0, 0.1, 0.215);
  camHead.add(tally);
  serverLeds.push({ mesh: tally, material: tallyMat, phase: 2.6 });

  g.add(camHead);
  return g;
}

function createServerRack(
  mats: Record<string, THREE.Material>,
  serverLeds: ServerLedRef[],
  rackIndex: number
): THREE.Group {
  const g = new THREE.Group();

  // Main chassis
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.55, 0.92), mats.matteBlackMetal);
  cabinet.position.y = 1.275;
  cabinet.castShadow = true;
  cabinet.receiveShadow = true;
  g.add(cabinet);

  // Brushed aluminum side trim rails
  [-0.48, 0.48].forEach((tx) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.5, 0.06), mats.brushedSteel);
    rail.position.set(tx, 1.275, 0.45);
    g.add(rail);
  });

  // Top cooling manifold
  const topCap = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.12, 0.84), mats.brushedSteel);
  topCap.position.y = 2.61;
  g.add(topCap);

  // 7 Stacked AI compute blade units + animated emissive LED strips
  const ledColors = [0x38bdf8, 0x818cf8, 0x34d399];
  const baseColor = ledColors[rackIndex % ledColors.length];

  for (let i = 0; i < 7; i++) {
    const y = 0.38 + i * 0.31;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.22, 0.05), mats.plinth);
    blade.position.set(0, y, 0.45);
    g.add(blade);

    const ledMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      emissive: new THREE.Color(baseColor),
      emissiveIntensity: 1.1,
      roughness: 0.2,
    });
    const ledStrip = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.028, 0.02), ledMat);
    ledStrip.position.set(-0.08, y + 0.03, 0.48);
    g.add(ledStrip);

    serverLeds.push({
      mesh: ledStrip,
      material: ledMat,
      phase: rackIndex * 1.7 + i * 0.85,
    });
  }

  return g;
}

function createCoffeeLounge(
  mats: Record<string, THREE.Material>,
  textures: OfficeTexturePack
): THREE.Group {
  const g = new THREE.Group();

  // Woven Scandinavian area rug (y = 0.025 for clean Z separation)
  const rugMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.rugColor,
    roughness: 0.94,
    metalness: 0.0,
  });
  const rug = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.025, 4.0), rugMat);
  rug.position.set(6.2, 0.0125, 4.7);
  rug.receiveShadow = true;
  g.add(rug);

  // 3-seat Scandinavian sofa at (6.6, 6.0) facing North
  const sofa = new THREE.Group();
  sofa.position.set(6.6, 0.025, 6.05);

  const sofaBase = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.26, 0.9), mats.sofaFabric);
  sofaBase.position.y = 0.34;
  sofaBase.castShadow = true;
  sofa.add(sofaBase);

  const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.56, 0.2), mats.sofaFabric);
  sofaBack.position.set(0, 0.68, 0.36);
  sofaBack.castShadow = true;
  sofa.add(sofaBack);

  [-1.16, 1.16].forEach((ax) => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.44, 0.9), mats.sofaFabric);
    arm.position.set(ax, 0.5, 0);
    sofa.add(arm);
  });

  // Tapered oak legs
  [
    [-1.08, -0.34],
    [1.08, -0.34],
    [-1.08, 0.34],
    [1.08, 0.34],
  ].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.018, 0.22, 10), mats.oakDesk);
    leg.position.set(lx, 0.11, lz);
    sofa.add(leg);
  });

  // Accent cushions
  [-0.78, 0.78].forEach((cx) => {
    const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.32, 0.14), mats.cushionFabric);
    cushion.position.set(cx, 0.62, 0.18);
    cushion.rotation.y = cx < 0 ? 0.2 : -0.2;
    sofa.add(cushion);
  });
  g.add(sofa);

  // Round oak coffee table
  const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.055, 28), mats.oakDesk);
  tableTop.position.set(6.4, 0.44, 4.55);
  tableTop.castShadow = true;
  tableTop.receiveShadow = true;
  g.add(tableTop);

  const tableBase = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.26, 0.4, 16), mats.matteBlackMetal);
  tableBase.position.set(6.4, 0.22, 4.55);
  g.add(tableBase);

  // Ceramic cups on coffee table
  const cup1 = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.08, 12), mats.ceramicPot);
  cup1.position.set(6.22, 0.51, 4.48);
  g.add(cup1);
  const cup2 = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.08, 12), mats.ceramicPot);
  cup2.position.set(6.55, 0.51, 4.65);
  g.add(cup2);

  // Lounge reading armchair at (4.35, 4.6) facing East
  const chair = new THREE.Group();
  chair.position.set(4.35, 0.025, 4.6);
  chair.rotation.y = Math.PI / 2;
  const chSeat = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.24, 0.8), mats.sofaFabric);
  chSeat.position.y = 0.34;
  chSeat.castShadow = true;
  chair.add(chSeat);
  const chBack = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.52, 0.18), mats.sofaFabric);
  chBack.position.set(0, 0.66, -0.32);
  chair.add(chBack);
  g.add(chair);

  // Espresso Coffee Bar along East perimeter (x = 9.55, z = 3.7)
  const barGroup = new THREE.Group();
  barGroup.position.set(9.55, 0, 3.7);

  const barBody = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.96, 3.1), mats.walnutWood);
  barBody.position.y = 0.48;
  barBody.castShadow = true;
  barBody.receiveShadow = true;
  barGroup.add(barBody);

  const barTop = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.06, 3.22), mats.ceramicPot);
  barTop.position.y = 0.99;
  barTop.receiveShadow = true;
  barGroup.add(barTop);

  // Brushed stainless + brass commercial espresso machine
  const espressoBody = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.42, 0.64), mats.brushedSteel);
  espressoBody.position.set(0.06, 1.23, -0.45);
  espressoBody.castShadow = true;
  barGroup.add(espressoBody);

  const espressoTrim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.66), mats.brassAccent);
  espressoTrim.position.set(0.06, 1.44, -0.45);
  barGroup.add(espressoTrim);

  // Grinder
  const grinder = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.36, 14), mats.matteBlackMetal);
  grinder.position.set(0.04, 1.2, 0.22);
  barGroup.add(grinder);

  // Stacked cups
  for (let i = 0; i < 3; i++) {
    const stackCup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.08, 12), mats.ceramicPot);
    stackCup.position.set(-0.08, 1.06, 0.68 + i * 0.14);
    barGroup.add(stackCup);
  }

  // 2 Bar stools
  [-0.65, 0.65].forEach((sz) => {
    const stool = new THREE.Group();
    stool.position.set(-0.82, 0, sz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.68, 10), mats.matteBlackMetal);
    pole.position.y = 0.34;
    stool.add(pole);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.03, 14), mats.matteBlackMetal);
    foot.position.y = 0.015;
    stool.add(foot);
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.18, 0.06, 16), mats.oakDesk);
    seat.position.y = 0.7;
    stool.add(seat);
    barGroup.add(stool);
  });

  g.add(barGroup);
  return g;
}

function createWhiteboardEasel(
  mats: Record<string, THREE.Material>,
  boardTexture: THREE.CanvasTexture
): THREE.Group {
  const g = new THREE.Group();

  // Aluminum frame legs
  [-0.86, 0.86].forEach((lx) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.95, 10), mats.brushedSteel);
    post.position.set(lx, 0.98, 0);
    g.add(post);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.62), mats.matteBlackMetal);
    foot.position.set(lx, 0.02, 0);
    g.add(foot);
  });

  const backing = new THREE.Mesh(new THREE.BoxGeometry(1.78, 1.12, 0.05), mats.brushedSteel);
  backing.position.set(0, 1.42, 0);
  backing.castShadow = true;
  g.add(backing);

  const faceMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: boardTexture,
    roughness: 0.35,
    metalness: 0.02,
  });
  const frontFace = new THREE.Mesh(new THREE.PlaneGeometry(1.68, 1.02), faceMat);
  frontFace.position.set(0, 1.42, 0.028);
  g.add(frontFace);

  const tray = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.03, 0.1), mats.matteBlackMetal);
  tray.position.set(0, 0.85, 0.06);
  g.add(tray);

  return g;
}

function createBookshelf(mats: Record<string, THREE.Material>): THREE.Group {
  const g = new THREE.Group();

  // Tall walnut + matte-black architectural shelving unit
  [-1.0, 1.0].forEach((sx) => {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.2, 0.38), mats.matteBlackMetal);
    side.position.set(sx, 1.1, 0);
    g.add(side);
  });

  const bookColors = [0xd97706, 0x2563eb, 0x0d9488, 0x475569, 0xe11d48, 0x4f46e5];
  for (let level = 0; level < 5; level++) {
    const sy = 0.25 + level * 0.45;
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.04, 0.38), mats.walnutWood);
    shelf.position.set(0, sy, 0);
    shelf.castShadow = true;
    g.add(shelf);

    if (level < 4) {
      for (let b = 0; b < 6; b++) {
        const bh = 0.22 + ((level * 3 + b * 7) % 10) * 0.012;
        const bookMat = new THREE.MeshStandardMaterial({
          color: bookColors[(level + b) % bookColors.length],
          roughness: 0.72,
        });
        const book = new THREE.Mesh(new THREE.BoxGeometry(0.08, bh, 0.24), bookMat);
        book.position.set(-0.78 + b * 0.24 + (level % 2) * 0.14, sy + 0.02 + bh / 2, 0);
        g.add(book);
      }
    }
  }

  return g;
}

function createIndoorPlant(mats: Record<string, THREE.Material>, scale = 1): THREE.Group {
  const g = new THREE.Group();
  g.scale.setScalar(scale);

  // Ceramic planter + soil
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.48, 18), mats.ceramicPot);
  pot.position.y = 0.24;
  pot.castShadow = true;
  g.add(pot);

  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.04, 16), mats.soil);
  soil.position.y = 0.46;
  g.add(soil);

  // Woody trunk & branches
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4632, roughness: 0.9 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.048, 1.05, 10), trunkMat);
  trunk.position.y = 0.95;
  g.add(trunk);

  // Layered broad architectural leaves (fiddle-leaf silhouette)
  const leafShades = [0x2e6f40, 0x3b844e, 0x245a33, 0x459258];
  const leafGeo = new THREE.SphereGeometry(0.24, 10, 8);
  leafGeo.scale(1.0, 0.16, 1.45);

  for (let i = 0; i < 11; i++) {
    const angle = i * 2.39996; // golden angle phyllotaxis
    const height = 0.92 + (i / 10) * 0.72;
    const radius = 0.22 + (1 - i / 12) * 0.24;
    const leafMat = new THREE.MeshStandardMaterial({
      color: leafShades[i % leafShades.length],
      roughness: 0.62,
      metalness: 0.02,
    });
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
    leaf.rotation.y = -angle + Math.PI / 2;
    leaf.rotation.x = 0.35 + (i % 3) * 0.12;
    leaf.castShadow = true;
    g.add(leaf);
  }

  return g;
}

function createNametagSprite(tagLabel: string, accentHex: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 84;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Dark-navy architectural label plate matching WORKSPACE aesthetic
    const r = 18;
    const x = 10;
    const y = 12;
    const w = canvas.width - 20;
    const h = canvas.height - 24;

    ctx.fillStyle = 'rgba(10, 19, 34, 0.90)';
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Accent square indicator
    ctx.fillStyle = accentHex;
    ctx.fillRect(28, 32, 16, 18);

    // Crisp white label text
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 24px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(tagLabel, 56, 42, 240);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.38, 0.36, 1);
  sprite.position.set(0, 1.94, 0);
  sprite.renderOrder = 6;
  return sprite;
}

interface HumanSharedPool {
  shadowDiscGeo: THREE.CircleGeometry;
  selectionRingGeo: THREE.RingGeometry;
  trouserLegGeo: THREE.CylinderGeometry;
  bareLegGeo: THREE.CylinderGeometry;
  ankleGeo: THREE.CylinderGeometry;
  shoeSoleGeo: THREE.BoxGeometry;
  shoeToeGeo: THREE.SphereGeometry;
  pelvisGeo: THREE.CylinderGeometry;
  skirtGeo: THREE.CylinderGeometry;
  torsoGeo: THREE.CylinderGeometry;
  shoulderBridgeGeo: THREE.CapsuleGeometry;
  collarRingGeo: THREE.TorusGeometry;
  shirtVPanelGeo: THREE.BoxGeometry;
  lapelGeo: THREE.BoxGeometry;
  shoulderCapGeo: THREE.SphereGeometry;
  upperSleeveGeo: THREE.CylinderGeometry;
  forearmGeo: THREE.CylinderGeometry;
  handGeo: THREE.SphereGeometry;
  neckGeo: THREE.CylinderGeometry;
  headGeo: THREE.SphereGeometry;
  earGeo: THREE.SphereGeometry;
  noseGeo: THREE.SphereGeometry;
  eyeScleraGeo: THREE.SphereGeometry;
  eyeIrisGeo: THREE.SphereGeometry;
  eyeCatchGeo: THREE.SphereGeometry;
  eyebrowGeo: THREE.BoxGeometry;
  cheekGeo: THREE.SphereGeometry;
  smileGeo: THREE.TorusGeometry;
  hairCapGeo: THREE.SphereGeometry;
  hairBackCupGeo: THREE.SphereGeometry;
  glassesRimGeo: THREE.TorusGeometry;
  headsetBandGeo: THREE.TorusGeometry;
  headsetCupGeo: THREE.CylinderGeometry;
  taskBeaconGeo: THREE.OctahedronGeometry;
  hitboxGeo: THREE.BoxGeometry;
  eyeWhiteMat: THREE.MeshStandardMaterial;
  eyeIrisMat: THREE.MeshStandardMaterial;
  smileMat: THREE.MeshStandardMaterial;
  cheekMat: THREE.MeshStandardMaterial;
  glassesMetalMat: THREE.MeshStandardMaterial;
  headsetDarkMat: THREE.MeshStandardMaterial;
  headsetCushionMat: THREE.MeshStandardMaterial;
  lanyardStrapMat: THREE.MeshStandardMaterial;
}

function createHumanSharedPool(): HumanSharedPool {
  return {
    shadowDiscGeo: new THREE.CircleGeometry(0.44, 20),
    selectionRingGeo: new THREE.RingGeometry(0.4, 0.5, 24),
    trouserLegGeo: new THREE.CylinderGeometry(0.061, 0.049, 0.56, 10),
    bareLegGeo: new THREE.CylinderGeometry(0.047, 0.037, 0.54, 10),
    ankleGeo: new THREE.CylinderGeometry(0.042, 0.042, 0.06, 8),
    shoeSoleGeo: new THREE.BoxGeometry(0.106, 0.075, 0.165),
    shoeToeGeo: new THREE.SphereGeometry(0.052, 8, 6),
    pelvisGeo: new THREE.CylinderGeometry(0.138, 0.146, 0.16, 12),
    skirtGeo: new THREE.CylinderGeometry(0.142, 0.194, 0.28, 14),
    torsoGeo: new THREE.CylinderGeometry(0.184, 0.132, 0.44, 14),
    shoulderBridgeGeo: new THREE.CapsuleGeometry(0.072, 0.25, 4, 8),
    collarRingGeo: new THREE.TorusGeometry(0.068, 0.017, 6, 14),
    shirtVPanelGeo: new THREE.BoxGeometry(0.095, 0.24, 0.03),
    lapelGeo: new THREE.BoxGeometry(0.046, 0.22, 0.025),
    shoulderCapGeo: new THREE.SphereGeometry(0.056, 8, 6),
    upperSleeveGeo: new THREE.CylinderGeometry(0.051, 0.044, 0.23, 8),
    forearmGeo: new THREE.CylinderGeometry(0.04, 0.033, 0.2, 8),
    handGeo: new THREE.SphereGeometry(0.041, 8, 6),
    neckGeo: new THREE.CylinderGeometry(0.048, 0.058, 0.11, 10),
    headGeo: new THREE.SphereGeometry(0.162, 18, 14),
    earGeo: new THREE.SphereGeometry(0.032, 8, 6),
    noseGeo: new THREE.SphereGeometry(0.02, 8, 6),
    eyeScleraGeo: new THREE.SphereGeometry(0.021, 8, 8),
    eyeIrisGeo: new THREE.SphereGeometry(0.015, 8, 8),
    eyeCatchGeo: new THREE.SphereGeometry(0.005, 6, 6),
    eyebrowGeo: new THREE.BoxGeometry(0.046, 0.01, 0.012),
    cheekGeo: new THREE.SphereGeometry(0.024, 8, 6),
    smileGeo: new THREE.TorusGeometry(0.025, 0.0055, 6, 12, Math.PI * 0.72),
    hairCapGeo: new THREE.SphereGeometry(0.172, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
    hairBackCupGeo: new THREE.SphereGeometry(0.164, 14, 10),
    glassesRimGeo: new THREE.TorusGeometry(0.036, 0.005, 6, 16),
    headsetBandGeo: new THREE.TorusGeometry(0.184, 0.014, 8, 18, Math.PI),
    headsetCupGeo: new THREE.CylinderGeometry(0.044, 0.044, 0.032, 12),
    taskBeaconGeo: new THREE.OctahedronGeometry(0.095, 0),
    hitboxGeo: new THREE.BoxGeometry(0.85, 1.95, 0.85),
    eyeWhiteMat: new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25, metalness: 0.0 }),
    eyeIrisMat: new THREE.MeshStandardMaterial({ color: 0x1c1614, roughness: 0.12, metalness: 0.05 }),
    smileMat: new THREE.MeshStandardMaterial({ color: 0xa6584b, roughness: 0.65, metalness: 0.0 }),
    cheekMat: new THREE.MeshStandardMaterial({ color: 0xe69586, roughness: 0.8, metalness: 0.0 }),
    glassesMetalMat: new THREE.MeshStandardMaterial({ color: 0x2a2d34, roughness: 0.26, metalness: 0.78 }),
    headsetDarkMat: new THREE.MeshStandardMaterial({ color: 0x1e242d, roughness: 0.34, metalness: 0.55 }),
    headsetCushionMat: new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.82, metalness: 0.05 }),
    lanyardStrapMat: new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.78, metalness: 0.05 }),
  };
}

function createAgentRig(
  id: AgentId,
  tagLabel: string,
  accentHex: string,
  contactShadowTex: THREE.CanvasTexture,
  pool: HumanSharedPool
): AgentVisualRig {
  const root = new THREE.Group();
  root.name = `agent_${id}`;

  const profile = getHumanAppearance(id);
  const accentColor = new THREE.Color(accentHex);

  const skinMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(profile.skinHex),
    roughness: 0.64,
    metalness: 0.0,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(profile.hairHex),
    roughness: 0.56,
    metalness: 0.04,
  });
  const topMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(profile.topHex),
    roughness: 0.82,
    metalness: 0.02,
  });
  const innerShirtMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(profile.innerShirtHex),
    roughness: 0.86,
    metalness: 0.0,
  });
  const bottomMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(profile.bottomHex),
    roughness: 0.86,
    metalness: 0.02,
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(profile.shoeHex),
    roughness: 0.38,
    metalness: 0.08,
  });
  const badgeGlow = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: 0.15,
    roughness: 0.35,
    metalness: 0.08,
  });

  // Contact shadow disc grounded at y = 0.016
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowTex,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const shadowDisc = new THREE.Mesh(pool.shadowDiscGeo, shadowMat);
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = 0.016;
  root.add(shadowDisc);

  // Subtle selection ring on floor (hidden unless hovered/selected/executing)
  const selectionRingMat = new THREE.MeshBasicMaterial({
    color: accentColor,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  const selectionRing = new THREE.Mesh(pool.selectionRingGeo, selectionRingMat);
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.position.y = 0.022;
  root.add(selectionRing);

  // Body container (anchored at y = 0 so shoes sit flush on floor even with organic height variation)
  const bodyGroup = new THREE.Group();
  const widthScale = 0.98 + (profile.heightScale - 1) * 0.35;
  bodyGroup.scale.set(widthScale, profile.heightScale, widthScale);
  root.add(bodyGroup);

  // Legs (articulated at hip y = 0.68; shoes rest flush at y = 0.0)
  const makeLeg = (xOffset: number): THREE.Group => {
    const legGroup = new THREE.Group();
    legGroup.position.set(xOffset, 0.68, 0);

    if (profile.bottomStyle === 'skirt') {
      const bareLeg = new THREE.Mesh(pool.bareLegGeo, skinMat);
      bareLeg.position.y = -0.32;
      bareLeg.castShadow = true;
      legGroup.add(bareLeg);
    } else {
      const trouser = new THREE.Mesh(pool.trouserLegGeo, bottomMat);
      trouser.position.y = -0.31;
      trouser.castShadow = true;
      legGroup.add(trouser);

      const sock = new THREE.Mesh(pool.ankleGeo, innerShirtMat);
      sock.position.y = -0.59;
      legGroup.add(sock);
    }

    const shoeSole = new THREE.Mesh(pool.shoeSoleGeo, shoeMat);
    shoeSole.position.set(0, -0.6425, 0.018);
    shoeSole.castShadow = true;
    legGroup.add(shoeSole);

    const shoeToe = new THREE.Mesh(pool.shoeToeGeo, shoeMat);
    shoeToe.scale.set(1.02, 0.72, 1.05);
    shoeToe.position.set(0, -0.6425, 0.095);
    shoeToe.castShadow = true;
    legGroup.add(shoeToe);

    return legGroup;
  };

  const leftLeg = makeLeg(-0.095);
  const rightLeg = makeLeg(0.095);
  bodyGroup.add(leftLeg, rightLeg);

  // Pelvis / Skirt & Elliptical Human Torso
  const pelvis = new THREE.Mesh(pool.pelvisGeo, bottomMat);
  pelvis.scale.set(1.04, 1.0, 0.76);
  pelvis.position.y = 0.72;
  pelvis.castShadow = true;
  bodyGroup.add(pelvis);

  if (profile.bottomStyle === 'skirt') {
    const skirt = new THREE.Mesh(pool.skirtGeo, bottomMat);
    skirt.scale.set(1.04, 1.0, 0.86);
    skirt.position.y = 0.59;
    skirt.castShadow = true;
    bodyGroup.add(skirt);
  }

  const torso = new THREE.Mesh(pool.torsoGeo, topMat);
  torso.scale.set(1.08, 1.0, 0.72);
  torso.position.y = 1.0;
  torso.castShadow = true;
  bodyGroup.add(torso);

  // Rounded human shoulders bridge
  const shoulderMat = profile.topStyle === 'vest' ? innerShirtMat : topMat;
  const shoulderBridge = new THREE.Mesh(pool.shoulderBridgeGeo, shoulderMat);
  shoulderBridge.rotation.z = Math.PI / 2;
  shoulderBridge.scale.set(1.0, 1.0, 0.85);
  shoulderBridge.position.set(0, 1.19, 0);
  shoulderBridge.castShadow = true;
  bodyGroup.add(shoulderBridge);

  // Shirt collar + outfit-specific front tailoring
  const collarRing = new THREE.Mesh(pool.collarRingGeo, innerShirtMat);
  collarRing.rotation.x = Math.PI / 2;
  collarRing.position.set(0, 1.23, 0.005);
  bodyGroup.add(collarRing);

  if (
    profile.topStyle === 'blazer' ||
    profile.topStyle === 'cardigan' ||
    profile.topStyle === 'jacket' ||
    profile.topStyle === 'vest'
  ) {
    const innerPanel = new THREE.Mesh(pool.shirtVPanelGeo, innerShirtMat);
    innerPanel.position.set(0, 1.08, 0.118);
    bodyGroup.add(innerPanel);

    if (profile.topStyle !== 'vest') {
      [-0.062, 0.062].forEach((lx) => {
        const lapel = new THREE.Mesh(pool.lapelGeo, topMat);
        lapel.position.set(lx, 1.09, 0.128);
        lapel.rotation.z = lx < 0 ? 0.12 : -0.12;
        bodyGroup.add(lapel);
      });
    }
  } else if (profile.topStyle === 'hoodie') {
    const hoodCollar = new THREE.Mesh(
      new THREE.TorusGeometry(0.115, 0.036, 6, 14, Math.PI * 1.25),
      topMat
    );
    hoodCollar.rotation.x = Math.PI / 2 + 0.25;
    hoodCollar.rotation.z = Math.PI * 0.88;
    hoodCollar.position.set(0, 1.22, -0.045);
    bodyGroup.add(hoodCollar);

    [-0.038, 0.038].forEach((dx) => {
      const stringMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.006, 0.16, 6),
        innerShirtMat
      );
      stringMesh.position.set(dx, 1.11, 0.135);
      bodyGroup.add(stringMesh);
    });
  }

  // Optional tie or soft pastoral scarf
  if (profile.accessory === 'tie' || profile.accessory === 'tie-glasses') {
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.22, 0.018), badgeGlow);
    tie.position.set(0, 1.06, 0.135);
    bodyGroup.add(tie);
  } else if (profile.accessory === 'scarf') {
    const scarfMat = new THREE.MeshStandardMaterial({
      color: accentColor.clone().lerp(new THREE.Color(0xffffff), 0.3),
      roughness: 0.88,
      metalness: 0.0,
    });
    const scarfRing = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.026, 6, 16), scarfMat);
    scarfRing.rotation.x = Math.PI / 2;
    scarfRing.position.set(0, 1.225, 0.01);
    bodyGroup.add(scarfRing);

    const scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.19, 0.022), scarfMat);
    scarfTail.position.set(0.055, 1.11, 0.132);
    scarfTail.rotation.z = -0.1;
    bodyGroup.add(scarfTail);
  }

  // Subtle studio ID card badge on chest (highlights gently only when executing a live AI task)
  const idCard = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.082, 0.014), innerShirtMat);
  idCard.position.set(-0.068, 0.99, 0.138);
  bodyGroup.add(idCard);

  const idStripe = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.024, 0.016), badgeGlow);
  idStripe.position.set(-0.068, 1.012, 0.139);
  bodyGroup.add(idStripe);

  const lanyardLeft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.005, 0.005, 0.22, 6),
    pool.lanyardStrapMat
  );
  lanyardLeft.position.set(-0.052, 1.12, 0.122);
  lanyardLeft.rotation.z = -0.18;
  bodyGroup.add(lanyardLeft);

  // Articulated human arms at shoulders y = 1.19
  const longSleeve =
    profile.topStyle === 'blazer' ||
    profile.topStyle === 'cardigan' ||
    profile.topStyle === 'jacket' ||
    profile.topStyle === 'hoodie' ||
    profile.topStyle === 'sweater';

  const makeArm = (xOffset: number): THREE.Group => {
    const armGroup = new THREE.Group();
    armGroup.position.set(xOffset, 1.19, 0);

    const shoulderCap = new THREE.Mesh(pool.shoulderCapGeo, shoulderMat);
    armGroup.add(shoulderCap);

    const upperArm = new THREE.Mesh(pool.upperSleeveGeo, shoulderMat);
    upperArm.position.y = -0.115;
    upperArm.castShadow = true;
    armGroup.add(upperArm);

    const forearm = new THREE.Mesh(pool.forearmGeo, longSleeve ? shoulderMat : skinMat);
    forearm.position.y = -0.31;
    forearm.castShadow = true;
    armGroup.add(forearm);

    const hand = new THREE.Mesh(pool.handGeo, skinMat);
    hand.scale.set(0.88, 1.14, 0.68);
    hand.position.y = -0.435;
    armGroup.add(hand);

    return armGroup;
  };

  const leftArm = makeArm(-0.22);
  const rightArm = makeArm(0.22);
  bodyGroup.add(leftArm, rightArm);

  // Sculpted Human Head Assembly (neck + oval head + ears + nose + eyes/brows + warm smile + sculpted hair + accessory)
  const headGroup = new THREE.Group();
  headGroup.position.y = 1.25;

  const neck = new THREE.Mesh(pool.neckGeo, skinMat);
  neck.position.y = 0.045;
  headGroup.add(neck);

  const head = new THREE.Mesh(pool.headGeo, skinMat);
  head.scale.set(0.94, 1.08, 0.96);
  head.position.y = 0.235;
  head.castShadow = true;
  headGroup.add(head);

  // Ears
  [-0.148, 0.148].forEach((ex) => {
    const ear = new THREE.Mesh(pool.earGeo, skinMat);
    ear.scale.set(0.55, 1.15, 0.8);
    ear.position.set(ex, 0.23, 0.0);
    headGroup.add(ear);
  });

  // Soft sculpted nose
  const nose = new THREE.Mesh(pool.noseGeo, skinMat);
  nose.scale.set(0.85, 1.15, 1.15);
  nose.position.set(0, 0.22, 0.155);
  headGroup.add(nose);

  // Expressive human eyes with white sclera, dark glossy iris, tiny catchlight & eyebrows
  [-0.054, 0.054].forEach((ex) => {
    const sclera = new THREE.Mesh(pool.eyeScleraGeo, pool.eyeWhiteMat);
    sclera.scale.set(1.05, 0.92, 0.55);
    sclera.position.set(ex, 0.248, 0.141);
    headGroup.add(sclera);

    const iris = new THREE.Mesh(pool.eyeIrisGeo, pool.eyeIrisMat);
    iris.scale.set(1.0, 1.0, 0.55);
    iris.position.set(ex, 0.248, 0.149);
    headGroup.add(iris);

    const catchlight = new THREE.Mesh(pool.eyeCatchGeo, pool.eyeWhiteMat);
    catchlight.position.set(ex + 0.005, 0.254, 0.156);
    headGroup.add(catchlight);

    const brow = new THREE.Mesh(pool.eyebrowGeo, hairMat);
    brow.position.set(ex, 0.287, 0.144);
    brow.rotation.z = ex < 0 ? 0.08 : -0.08;
    headGroup.add(brow);

    const cheek = new THREE.Mesh(pool.cheekGeo, pool.cheekMat);
    cheek.scale.set(1.1, 0.72, 0.35);
    cheek.position.set(ex * 1.56, 0.205, 0.123);
    headGroup.add(cheek);
  });

  // Warm gentle human smile
  const smile = new THREE.Mesh(pool.smileGeo, pool.smileMat);
  smile.position.set(0, 0.194, 0.145);
  smile.rotation.z = Math.PI * 1.14;
  headGroup.add(smile);

  // Base hair skullcap + nape back volume (frames face cleanly without z-fighting)
  const hairCap = new THREE.Mesh(pool.hairCapGeo, hairMat);
  hairCap.scale.set(0.97, 1.06, 1.0);
  hairCap.position.set(0, 0.248, -0.015);
  hairCap.rotation.x = -0.3;
  hairCap.castShadow = true;
  headGroup.add(hairCap);

  const hairBack = new THREE.Mesh(pool.hairBackCupGeo, hairMat);
  hairBack.scale.set(0.96, 0.95, 0.72);
  hairBack.position.set(0, 0.228, -0.058);
  hairBack.castShadow = true;
  headGroup.add(hairBack);

  // Distinct sculpted human hairstyles
  switch (profile.hairStyle) {
    case 'sleek-bob': {
      [-0.132, 0.132].forEach((sx) => {
        const sideLock = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.14, 5, 8), hairMat);
        sideLock.position.set(sx, 0.185, -0.008);
        sideLock.rotation.z = sx < 0 ? 0.08 : -0.08;
        sideLock.castShadow = true;
        headGroup.add(sideLock);
      });
      const backBob = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.11, 5, 10), hairMat);
      backBob.scale.set(1.18, 1.0, 0.56);
      backBob.position.set(0, 0.155, -0.095);
      backBob.castShadow = true;
      headGroup.add(backBob);

      const bang = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.14, 4, 8), hairMat);
      bang.position.set(-0.02, 0.34, 0.102);
      bang.rotation.z = 1.42;
      bang.rotation.y = -0.18;
      headGroup.add(bang);
      break;
    }
    case 'long-wavy': {
      const backFlow = new THREE.Mesh(new THREE.CapsuleGeometry(0.125, 0.24, 6, 10), hairMat);
      backFlow.scale.set(1.16, 1.0, 0.54);
      backFlow.position.set(0, 0.095, -0.105);
      backFlow.castShadow = true;
      headGroup.add(backFlow);

      [-0.136, 0.136].forEach((sx) => {
        const waveLock = new THREE.Mesh(new THREE.CapsuleGeometry(0.046, 0.21, 5, 8), hairMat);
        waveLock.position.set(sx, 0.145, -0.012);
        waveLock.rotation.z = sx < 0 ? 0.11 : -0.11;
        waveLock.castShadow = true;
        headGroup.add(waveLock);
      });

      const sweepBang = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.15, 4, 8), hairMat);
      sweepBang.position.set(0.025, 0.342, 0.102);
      sweepBang.rotation.z = 1.32;
      sweepBang.rotation.y = 0.2;
      headGroup.add(sweepBang);
      break;
    }
    case 'bun-updo': {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.086, 12, 10), hairMat);
      bun.position.set(0, 0.365, -0.115);
      bun.castShadow = true;
      headGroup.add(bun);

      const hairTie = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.013, 6, 14), topMat);
      hairTie.rotation.x = Math.PI / 3;
      hairTie.position.set(0, 0.335, -0.09);
      headGroup.add(hairTie);

      const neatBang = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.13, 4, 8), hairMat);
      neatBang.position.set(-0.015, 0.345, 0.104);
      neatBang.rotation.z = 1.46;
      headGroup.add(neatBang);
      break;
    }
    case 'ponytail': {
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 12), topMat);
      tie.position.set(0, 0.265, -0.165);
      headGroup.add(tie);

      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.2, 5, 10), hairMat);
      tail.position.set(0, 0.145, -0.21);
      tail.rotation.x = 0.32;
      tail.castShadow = true;
      headGroup.add(tail);

      const frontFringe = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.14, 4, 8), hairMat);
      frontFringe.position.set(0.02, 0.345, 0.102);
      frontFringe.rotation.z = 1.36;
      headGroup.add(frontFringe);
      break;
    }
    case 'side-sweep': {
      const sweep = new THREE.Mesh(new THREE.CapsuleGeometry(0.044, 0.16, 5, 8), hairMat);
      sweep.position.set(0.03, 0.34, 0.106);
      sweep.rotation.z = 1.24;
      sweep.rotation.y = 0.25;
      headGroup.add(sweep);

      const leftLock = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.12, 5, 8), hairMat);
      leftLock.position.set(-0.135, 0.195, -0.01);
      headGroup.add(leftLock);

      const rightLock = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.17, 5, 8), hairMat);
      rightLock.position.set(0.138, 0.17, -0.005);
      headGroup.add(rightLock);
      break;
    }
    case 'short-part': {
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.108, 12, 8), hairMat);
      crown.scale.set(1.25, 0.5, 1.15);
      crown.position.set(0.022, 0.378, 0.012);
      crown.rotation.z = -0.1;
      crown.castShadow = true;
      headGroup.add(crown);

      const sideWave = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.11, 4, 8), hairMat);
      sideWave.position.set(-0.04, 0.355, 0.095);
      sideWave.rotation.z = 1.38;
      headGroup.add(sideWave);
      break;
    }
    case 'cropped-fade': {
      const topVolume = new THREE.Mesh(new THREE.CapsuleGeometry(0.088, 0.11, 5, 10), hairMat);
      topVolume.scale.set(1.22, 0.62, 1.16);
      topVolume.rotation.x = Math.PI / 2;
      topVolume.position.set(0, 0.382, 0.018);
      topVolume.castShadow = true;
      headGroup.add(topVolume);
      break;
    }
    case 'curly-short': {
      const curlOffsets: Array<[number, number, number]> = [
        [0, 0.395, 0.02],
        [-0.075, 0.38, 0.04],
        [0.075, 0.38, 0.04],
        [-0.11, 0.34, -0.02],
        [0.11, 0.34, -0.02],
        [-0.045, 0.365, 0.095],
        [0.045, 0.365, 0.095],
      ];
      const curlGeo = new THREE.SphereGeometry(0.056, 8, 8);
      for (const [cx, cy, cz] of curlOffsets) {
        const curl = new THREE.Mesh(curlGeo, hairMat);
        curl.position.set(cx, cy, cz);
        curl.castShadow = true;
        headGroup.add(curl);
      }
      break;
    }
  }

  // Human role accessories (glasses or studio headset)
  if (profile.accessory === 'glasses' || profile.accessory === 'tie-glasses') {
    [-0.054, 0.054].forEach((gx) => {
      const rim = new THREE.Mesh(pool.glassesRimGeo, pool.glassesMetalMat);
      rim.position.set(gx, 0.248, 0.16);
      headGroup.add(rim);

      const temple = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.15), pool.glassesMetalMat);
      temple.position.set(gx < 0 ? -0.112 : 0.112, 0.252, 0.085);
      temple.rotation.y = gx < 0 ? -0.22 : 0.22;
      headGroup.add(temple);
    });
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.008, 0.008), pool.glassesMetalMat);
    bridge.position.set(0, 0.252, 0.162);
    headGroup.add(bridge);
  } else if (profile.accessory === 'headset' || profile.accessory === 'headset-mic') {
    const band = new THREE.Mesh(pool.headsetBandGeo, pool.headsetDarkMat);
    band.position.set(0, 0.248, 0);
    headGroup.add(band);

    [-0.168, 0.168].forEach((hx) => {
      const cup = new THREE.Mesh(pool.headsetCupGeo, pool.headsetDarkMat);
      cup.rotation.z = Math.PI / 2;
      cup.position.set(hx, 0.235, 0);
      headGroup.add(cup);

      const cushion = new THREE.Mesh(pool.headsetCupGeo, pool.headsetCushionMat);
      cushion.scale.set(0.86, 0.5, 0.86);
      cushion.rotation.z = Math.PI / 2;
      cushion.position.set(hx * 0.92, 0.235, 0);
      headGroup.add(cushion);
    });

    if (profile.accessory === 'headset-mic') {
      const boom = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.006, 0.16, 6),
        pool.headsetDarkMat
      );
      boom.rotation.z = Math.PI / 2.35;
      boom.rotation.y = -0.35;
      boom.position.set(0.115, 0.185, 0.128);
      headGroup.add(boom);

      const micFoam = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), pool.headsetCushionMat);
      micFoam.position.set(0.052, 0.178, 0.162);
      headGroup.add(micFoam);
    }
  }

  bodyGroup.add(headGroup);

  // Floating 3D nametag sprite (always clearly identifies each of the 13 team members)
  const nameSprite = createNametagSprite(tagLabel, accentHex);
  root.add(nameSprite);

  // Floating task indicator diamond (visible only when executing a user task)
  const taskBeaconMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: 1.5,
    roughness: 0.2,
  });
  const taskBeacon = new THREE.Mesh(pool.taskBeaconGeo, taskBeaconMat);
  taskBeacon.position.set(0, 2.3, 0);
  taskBeacon.visible = false;
  root.add(taskBeacon);

  // Invisible simplified raycast hitbox
  const hitbox = new THREE.Mesh(pool.hitboxGeo, new THREE.MeshBasicMaterial({ visible: false }));
  hitbox.position.y = 0.95;
  hitbox.userData.agentId = id;
  root.add(hitbox);

  return {
    id,
    root,
    bodyGroup,
    headGroup,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    badgeGlow,
    selectionRing,
    selectionRingMat,
    taskBeacon,
    nameSprite,
    hitbox,
  };
}
