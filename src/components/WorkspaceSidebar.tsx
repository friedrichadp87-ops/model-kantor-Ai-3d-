import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Clapperboard,
  ClipboardList,
  Cloud,
  Diamond,
  FileText,
  Layers,
  LayoutGrid,
  LogIn,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Scissors,
  Settings,
  Shield,
  SlidersHorizontal,
} from 'lucide-react';
import type { FirebaseAuthUserSummary } from '../firebase/officeSync';
import {
  BUILDING_FLOORS,
  FLOOR_ORDER,
  type FloorId,
  type FloorViewMode,
} from '../office/buildingFloors';
import { CHANNEL_WORKFLOW_BLUEPRINTS } from '../office/productionPipeline';
import { getFloorIdFromDivision } from '../office/floorWorkflowView';
import {
  WORKSPACE_DIVISIONS,
  type WorkspaceDivisionConfig,
  type WorkspaceDivisionId,
} from '../office/workspaceDivisions';
import type { UsePWAResult } from '../pwa/usePWA';
import { PWASidebarAction } from './PWAInstallAndUpdate';

interface WorkspaceSidebarProps {
  activeDivision: WorkspaceDivisionId;
  collapsed: boolean;
  floorView: FloorViewMode;
  utilizationPercent: number;
  activeEmployeeCount: number;
  totalEmployeeCount: number;
  firebaseUser: FirebaseAuthUserSummary | null;
  pwa: UsePWAResult;
  onSelectDivision: (divisionId: WorkspaceDivisionId) => void;
  onSelectFloorView: (view: FloorViewMode) => void;
  onToggleCollapse: () => void;
  onOpenFirebaseAuth: () => void;
}

const DIVISION_ICONS: Record<WorkspaceDivisionId, typeof LayoutGrid> = {
  dashboard: LayoutGrid,
  'performa-lantai': ClipboardList,
  'kontrol-3d': SlidersHorizontal,
  'lantai-1': Layers,
  'lantai-2': Layers,
  'lantai-3': Layers,
  'channel-youtube': Play,
  'ai-agent': Diamond,
  'guardian-komunitas': Shield,
  'bible-series': BookOpen,
  'church-shorts': Scissors,
  'video-editor': Clapperboard,
  'produksi-konten': FileText,
  'jadwal-publikasi': CalendarDays,
  'analitik-laporan': BarChart3,
  pengaturan: Settings,
};

const CORE_IDS = new Set<WorkspaceDivisionId>(['dashboard', 'performa-lantai', 'kontrol-3d']);
const FLOOR_MENU_IDS = new Set<WorkspaceDivisionId>(['lantai-1', 'lantai-2', 'lantai-3']);

export function WorkspaceSidebar({
  activeDivision,
  collapsed,
  floorView,
  utilizationPercent,
  activeEmployeeCount,
  totalEmployeeCount,
  firebaseUser,
  pwa,
  onSelectDivision,
  onSelectFloorView,
  onToggleCollapse,
  onOpenFirebaseAuth,
}: WorkspaceSidebarProps) {
  const coreDivisions = WORKSPACE_DIVISIONS.filter((d) => CORE_IDS.has(d.id));
  const floorDivisions = WORKSPACE_DIVISIONS.filter((d) => FLOOR_MENU_IDS.has(d.id));
  const studioDivisions = WORKSPACE_DIVISIONS.filter(
    (d) => !CORE_IDS.has(d.id) && !FLOOR_MENU_IDS.has(d.id)
  );

  const renderNavButton = (div: WorkspaceDivisionConfig) => {
    const Icon = DIVISION_ICONS[div.id];
    const isActive = activeDivision === div.id;
    const floorId: FloorId | null = getFloorIdFromDivision(div.id);
    const floorCfg = floorId ? BUILDING_FLOORS[floorId] : null;

    return (
      <button
        key={div.id}
        type="button"
        data-testid={`sidebar-nav-${div.id}`}
        onClick={() => onSelectDivision(div.id)}
        aria-current={isActive ? 'page' : undefined}
        title={collapsed ? `${div.label} — ${div.divisionName}` : div.divisionName}
        className={`group flex w-full items-center rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 ${
          collapsed ? 'justify-center px-0 py-1.5' : 'gap-2.5 px-3 py-1.5 text-left'
        } ${
          isActive
            ? 'bg-[#192942] text-white font-semibold shadow-xs'
            : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
        }`}
      >
        {floorCfg ? (
          <span
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm font-mono text-[9px] font-bold text-white"
            style={{ backgroundColor: floorCfg.accentHex }}
            aria-hidden="true"
          >
            L{floorCfg.floorId}
          </span>
        ) : (
          <Icon
            className={`h-[15px] w-[15px] shrink-0 transition-colors ${
              isActive ? 'text-sky-300' : 'text-slate-400 group-hover:text-slate-200'
            }`}
            aria-hidden="true"
          />
        )}
        {!collapsed && (
          <span className="min-w-0 flex-1 truncate text-[12.5px]">
            {floorCfg ? floorCfg.channelName : div.label}
          </span>
        )}
        {!collapsed && div.id === 'performa-lantai' && (
          <span className="shrink-0 font-mono text-[10.5px] font-medium text-emerald-300 tabular-nums">
            {utilizationPercent}%
          </span>
        )}
        {!collapsed && floorCfg && (
          <span className="shrink-0 font-mono text-[10px] text-slate-400 tabular-nums">
            {CHANNEL_WORKFLOW_BLUEPRINTS[floorCfg.channelId].stages.length} alur
          </span>
        )}
      </button>
    );
  };

  return (
    <aside
      aria-label="Navigasi Divisi Workspace Kantor AI 3D"
      className={`pointer-events-auto fixed top-0 bottom-0 left-0 z-20 flex flex-col border-r border-slate-800/95 bg-[#0c1421] text-slate-200 shadow-2xl transition-[width] duration-200 ${
        collapsed ? 'w-[58px]' : 'w-[232px]'
      }`}
    >
      {/* Top WORKSPACE label & collapse button */}
      <div
        className={`flex items-center border-b border-slate-800/80 px-3 py-2.5 ${
          collapsed ? 'justify-center' : 'justify-between'
        }`}
      >
        {!collapsed && (
          <span className="pl-1 text-[11px] font-semibold tracking-[0.14em] text-slate-400 uppercase">
            WORKSPACE
          </span>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Perluas sidebar workspace' : 'Ringkas sidebar workspace'}
          title={collapsed ? 'Perluas sidebar workspace' : 'Ringkas sidebar workspace'}
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800/80 hover:text-white focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Grouped Navigation: Core + Dedicated Per-Floor YouTube Menus + Studio Divisions */}
      <nav
        aria-label="Daftar divisi dan lantai kantor AI"
        className="flex-1 overflow-y-auto px-2 py-2"
      >
        <div className="space-y-0.5">{coreDivisions.map(renderNavButton)}</div>

        <div className="mt-2.5 border-t border-slate-800/80 pt-2">
          {!collapsed && (
            <div className="mb-1 px-2.5 text-[10px] font-semibold tracking-[0.12em] text-slate-400 uppercase">
              Alur Lantai & YouTube
            </div>
          )}
          <div className="space-y-0.5">{floorDivisions.map(renderNavButton)}</div>
        </div>

        <div className="mt-2.5 border-t border-slate-800/80 pt-2">
          {!collapsed && (
            <div className="mb-1 px-2.5 text-[10px] font-semibold tracking-[0.12em] text-slate-400 uppercase">
              Divisi Studio
            </div>
          )}
          <div className="space-y-0.5">{studioDivisions.map(renderNavButton)}</div>
        </div>
      </nav>

      {/* Compact In-Menu Floor Switcher & Live Utilization Summary */}
      {!collapsed && (
        <div className="border-t border-slate-800/80 bg-[#09111d] px-2.5 py-2">
          <div className="mb-1.5 flex items-center justify-between text-[11px]">
            <span className="font-medium text-slate-400">Tampilan 3D</span>
            <span className="font-mono text-slate-300 tabular-nums">
              {activeEmployeeCount}/{totalEmployeeCount} aktif
            </span>
          </div>
          <div
            className="grid grid-cols-4 gap-1 rounded-lg bg-slate-900/90 p-0.5"
            role="group"
            aria-label="Pilih tampilan lantai 3D cepat"
          >
            <button
              type="button"
              data-testid="sidebar-floor-all"
              onClick={() => onSelectFloorView('all')}
              aria-pressed={floorView === 'all'}
              title="Tampilkan seluruh 3 lantai"
              className={`rounded-md py-1 text-[11px] font-medium transition-colors ${
                floorView === 'all'
                  ? 'bg-slate-100 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              3L
            </button>
            {FLOOR_ORDER.map((fid) => {
              const cfg = BUILDING_FLOORS[fid];
              const active = floorView === fid;
              return (
                <button
                  key={fid}
                  type="button"
                  data-testid={`sidebar-floor-${fid}`}
                  onClick={() => onSelectFloorView(fid)}
                  aria-pressed={active}
                  title={`${cfg.label} — ${cfg.channelName}`}
                  className={`inline-flex items-center justify-center gap-1 rounded-md py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? 'bg-slate-100 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-xs"
                    style={{ backgroundColor: cfg.accentHex }}
                    aria-hidden="true"
                  />
                  <span>L{fid}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* PWA Install (PC & Android) & Browser Update via officecontent.netlify.app */}
      <PWASidebarAction pwa={pwa} collapsed={collapsed} />

      {/* Firebase Authentication Entry / Account Card */}
      <div className="border-t border-slate-800/80 px-2 py-2">
        <button
          type="button"
          onClick={onOpenFirebaseAuth}
          title={
            firebaseUser
              ? `Akun Firebase: ${firebaseUser.displayName || firebaseUser.email}`
              : 'Masuk Firebase Authentication (kantor-ai-agent-creator)'
          }
          className={`flex w-full items-center rounded-xl border transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 ${
            collapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-2.5 py-2 text-left'
          } ${
            firebaseUser
              ? 'border-emerald-500/35 bg-emerald-950/35 text-emerald-100 hover:bg-emerald-950/60'
              : 'border-slate-700/80 bg-[#121f35] text-slate-100 hover:border-sky-400/60 hover:bg-[#192942]'
          }`}
        >
          {firebaseUser ? (
            firebaseUser.photoURL ? (
              <img
                src={firebaseUser.photoURL}
                alt=""
                referrerPolicy="no-referrer"
                className="h-6 w-6 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
                {(firebaseUser.displayName || firebaseUser.email || 'U')[0]?.toUpperCase()}
              </span>
            )
          ) : (
            <LogIn className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
          )}
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-xs font-semibold">
                  {firebaseUser ? firebaseUser.displayName || 'Akun Firebase' : 'Masuk Firebase'}
                </span>
              </div>
              <p className="flex items-center gap-1 truncate text-[10px] text-slate-400">
                <Cloud className="h-2.5 w-2.5 shrink-0 text-amber-400/90" aria-hidden="true" />
                <span className="truncate">
                  {firebaseUser ? firebaseUser.email || 'Tersinkronisasi' : 'kantor-ai-agent-creator'}
                </span>
              </p>
            </div>
          )}
        </button>
      </div>
    </aside>
  );
}
