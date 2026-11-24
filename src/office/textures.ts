import * as THREE from 'three';

const OAK_FLOOR_URL = '/src/assets/images/tex_oak_parquet_1795215228232.jpg';
const TERRAZZO_FLOOR_URL = '/src/assets/images/tex_concrete_terrazzo_1795215230046.jpg';

export interface OfficeTexturePack {
  oakColor: THREE.Texture;
  oakBump: THREE.CanvasTexture;
  terrazzoColor: THREE.Texture;
  terrazzoBump: THREE.CanvasTexture;
  rugColor: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  whiteboard: THREE.CanvasTexture;
  screens: Record<'roadmap' | 'code' | 'design' | 'analytics' | 'coordination' | 'meeting', THREE.CanvasTexture>;
  dispose: () => void;
}

function makeWoodBumpTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 512, 512);

  // Horizontal plank seams + subtle wood grain fibers
  const plankHeight = 64;
  for (let row = 0; row < 8; row++) {
    const y = row * plankHeight;
    for (let i = 0; i < 45; i++) {
      const gy = y + Math.random() * plankHeight;
      const shade = 116 + Math.floor(Math.random() * 28);
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.fillRect(0, gy, 512, 1.5);
    }
    ctx.fillStyle = '#3c3c3c';
    ctx.fillRect(0, y, 512, 2);
    const offset = (row % 2) * 180 + 90;
    ctx.fillRect(offset % 512, y, 2, plankHeight);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 3);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function makeTerrazzoBumpTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#848484';
  ctx.fillRect(0, 0, 256, 256);

  // Tile joints
  ctx.strokeStyle = '#5a5a5a';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 126, 126);
  ctx.strokeRect(129, 1, 126, 126);
  ctx.strokeRect(1, 129, 126, 126);
  ctx.strokeRect(129, 129, 126, 126);

  // Subtle aggregate grain
  for (let i = 0; i < 450; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const s = 1 + Math.random() * 2.5;
    const v = 115 + Math.floor(Math.random() * 32);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, y, s, s);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function makeRugTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 384;
  const ctx = canvas.getContext('2d')!;

  // Warm architectural oatmeal woven rug with subtle geometric lines
  ctx.fillStyle = '#d7d1c5';
  ctx.fillRect(0, 0, 512, 384);

  // Woven threads
  for (let y = 0; y < 384; y += 3) {
    ctx.fillStyle = y % 6 === 0 ? 'rgba(120, 112, 98, 0.14)' : 'rgba(255, 252, 245, 0.18)';
    ctx.fillRect(0, y, 512, 1.5);
  }
  for (let x = 0; x < 512; x += 6) {
    ctx.fillStyle = 'rgba(105, 98, 86, 0.08)';
    ctx.fillRect(x, 0, 2, 384);
  }

  // Minimalist Scandinavian inset border
  ctx.strokeStyle = '#9c9282';
  ctx.lineWidth = 6;
  ctx.strokeRect(24, 24, 464, 336);
  ctx.strokeStyle = '#6f675b';
  ctx.lineWidth = 2;
  ctx.strokeRect(36, 36, 440, 312);

  // Subtle cross motif
  ctx.strokeStyle = 'rgba(95, 88, 78, 0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(36, 192);
  ctx.lineTo(476, 192);
  ctx.moveTo(256, 36);
  ctx.lineTo(256, 348);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function makeContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.58)');
  grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.24)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeWhiteboardTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 512, 320);

  // Subtle dot grid
  ctx.fillStyle = '#cbd5e1';
  for (let x = 24; x < 500; x += 24) {
    for (let y = 24; y < 300; y += 24) {
      ctx.fillRect(x, y, 2, 2);
    }
  }

  // Title
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('ALUR AGEN AI STUDIO', 28, 42);

  // Architecture boxes
  const boxes = [
    { x: 32, y: 74, w: 120, h: 64, color: '#d97706', label: '1. Riset' },
    { x: 196, y: 74, w: 120, h: 64, color: '#2563eb', label: '2. Kode' },
    { x: 360, y: 74, w: 120, h: 64, color: '#0d9488', label: '3. Desain' },
    { x: 114, y: 196, w: 130, h: 68, color: '#4f46e5', label: '4. Klaster AI' },
    { x: 288, y: 196, w: 140, h: 68, color: '#e11d48', label: '5. Rilis Tim' },
  ];

  // Connecting lines
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(152, 106);
  ctx.lineTo(196, 106);
  ctx.moveTo(316, 106);
  ctx.lineTo(360, 106);
  ctx.moveTo(256, 138);
  ctx.lineTo(180, 196);
  ctx.moveTo(244, 230);
  ctx.lineTo(288, 230);
  ctx.stroke();

  for (const b of boxes) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, 8);
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(b.label, b.x + 12, b.y + 38);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function makeScreenTexture(
  variant: 'roadmap' | 'code' | 'design' | 'analytics' | 'coordination' | 'meeting',
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Crisp dark studio UI backdrop
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 512, 256);

  // Top bar
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 512, 28);
  ctx.fillStyle = '#64748b';
  ctx.fillRect(14, 10, 8, 8);
  ctx.fillRect(28, 10, 8, 8);
  ctx.fillRect(42, 10, 8, 8);

  if (variant === 'code') {
    const colors = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#94a3b8'];
    for (let i = 0; i < 12; i++) {
      const y = 44 + i * 16;
      const indent = (i % 4) * 18 + 20;
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(indent, y, 50 + ((i * 37) % 120), 6);
      ctx.fillStyle = '#475569';
      ctx.fillRect(indent + 135, y, 40 + ((i * 23) % 90), 6);
    }
    // Right sidebar diff block
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(360, 38, 136, 202);
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(372, 52, 112, 12);
    ctx.fillStyle = '#10b981';
    ctx.fillRect(372, 78, 84, 8);
    ctx.fillRect(372, 94, 96, 8);
  } else if (variant === 'analytics') {
    // Bar chart + sparkline
    const heights = [62, 94, 78, 120, 104, 142, 128, 152];
    heights.forEach((h, i) => {
      ctx.fillStyle = i >= 5 ? '#6366f1' : '#334155';
      ctx.fillRect(32 + i * 32, 218 - h, 20, h);
    });
    // Right metric cards
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(310, 44, 180, 80);
    ctx.fillRect(310, 136, 180, 80);
    ctx.fillStyle = '#818cf8';
    ctx.fillRect(326, 62, 92, 16);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(326, 154, 120, 16);
  } else if (variant === 'design') {
    // Wireframe layout canvas
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(24, 42, 280, 196);
    ctx.fillStyle = '#0d9488';
    ctx.fillRect(40, 58, 140, 46);
    ctx.fillStyle = '#334155';
    ctx.fillRect(40, 116, 248, 42);
    ctx.fillRect(40, 170, 118, 52);
    ctx.fillRect(170, 170, 118, 52);
    // Color swatches panel
    const swatches = ['#0d9488', '#f59e0b', '#3b82f6', '#f43f5e'];
    swatches.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(328 + (i % 2) * 76, 48 + Math.floor(i / 2) * 76, 64, 64);
    });
  } else if (variant === 'roadmap' || variant === 'meeting') {
    // Sprint kanban / timeline bars
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(
      variant === 'meeting' ? 'SINKRONISASI STUDIO AI · Q4' : 'PETA JALAN PRODUK',
      24,
      56
    );
    const bars = [
      { y: 78, x: 24, w: 190, color: '#d97706' },
      { y: 112, x: 96, w: 220, color: '#2563eb' },
      { y: 146, x: 168, w: 210, color: '#0d9488' },
      { y: 180, x: 240, w: 180, color: '#e11d48' },
    ];
    for (const b of bars) {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(24, b.y, 464, 24);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y + 4, b.w, 16);
    }
  } else {
    // Coordination board (3 columns)
    const cols = ['#e11d48', '#2563eb', '#10b981'];
    cols.forEach((c, i) => {
      const cx = 24 + i * 160;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(cx, 42, 144, 196);
      ctx.fillStyle = c;
      ctx.fillRect(cx, 42, 144, 10);
      ctx.fillStyle = '#334155';
      ctx.fillRect(cx + 12, 66, 120, 38);
      ctx.fillRect(cx + 12, 114, 120, 38);
      ctx.fillRect(cx + 12, 162, 120, 38);
    });
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createOfficeTexturePack(
  renderer: THREE.WebGLRenderer,
  onTextureLoaded?: () => void
): OfficeTexturePack {
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const loader = new THREE.TextureLoader();

  const oakColor = loader.load(OAK_FLOOR_URL, () => onTextureLoaded?.());
  oakColor.colorSpace = THREE.SRGBColorSpace;
  oakColor.wrapS = THREE.RepeatWrapping;
  oakColor.wrapT = THREE.RepeatWrapping;
  oakColor.repeat.set(4, 3);
  oakColor.anisotropy = maxAniso;

  const terrazzoColor = loader.load(TERRAZZO_FLOOR_URL, () => onTextureLoaded?.());
  terrazzoColor.colorSpace = THREE.SRGBColorSpace;
  terrazzoColor.wrapS = THREE.RepeatWrapping;
  terrazzoColor.wrapT = THREE.RepeatWrapping;
  terrazzoColor.repeat.set(2.5, 2.5);
  terrazzoColor.anisotropy = maxAniso;

  const oakBump = makeWoodBumpTexture(maxAniso);
  const terrazzoBump = makeTerrazzoBumpTexture(maxAniso);
  const rugColor = makeRugTexture(maxAniso);
  const contactShadow = makeContactShadowTexture();
  const whiteboard = makeWhiteboardTexture(maxAniso);

  const screens = {
    roadmap: makeScreenTexture('roadmap', maxAniso),
    code: makeScreenTexture('code', maxAniso),
    design: makeScreenTexture('design', maxAniso),
    analytics: makeScreenTexture('analytics', maxAniso),
    coordination: makeScreenTexture('coordination', maxAniso),
    meeting: makeScreenTexture('meeting', maxAniso),
  };

  return {
    oakColor,
    oakBump,
    terrazzoColor,
    terrazzoBump,
    rugColor,
    contactShadow,
    whiteboard,
    screens,
    dispose: () => {
      oakColor.dispose();
      oakBump.dispose();
      terrazzoColor.dispose();
      terrazzoBump.dispose();
      rugColor.dispose();
      contactShadow.dispose();
      whiteboard.dispose();
      Object.values(screens).forEach((t) => t.dispose());
    },
  };
}
