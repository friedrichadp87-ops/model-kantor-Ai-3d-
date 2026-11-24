import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Clapperboard,
  Diamond,
  FileText,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Scissors,
  Settings,
  Shield,
} from 'lucide-react';
import { AGENT_PROFILES } from '../office/layout';
import {
  WORKSPACE_DIVISIONS,
  getDivisionById,
  type WorkspaceDivisionId,
} from '../office/workspaceDivisions';

interface WorkspaceSidebarProps {
  activeDivision: WorkspaceDivisionId;
  collapsed: boolean;
  onSelectDivision: (divisionId: WorkspaceDivisionId) => void;
  onToggleCollapse: () => void;
}

const DIVISION_ICONS: Record<WorkspaceDivisionId, typeof LayoutGrid> = {
  dashboard: LayoutGrid,
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

export function WorkspaceSidebar({
  activeDivision,
  collapsed,
  onSelectDivision,
  onToggleCollapse,
}: WorkspaceSidebarProps) {
  const current = getDivisionById(activeDivision);

  return (
    <aside
      aria-label="Navigasi Divisi Workspace Kantor AI 3D"
      className={`pointer-events-auto fixed top-0 bottom-0 left-0 z-20 flex flex-col border-r border-slate-800/95 bg-[#0c1421] text-slate-200 shadow-2xl transition-[width] duration-200 ${
        collapsed ? 'w-[58px]' : 'w-[228px]'
      }`}
    >
      {/* Top WORKSPACE label & collapse button */}
      <div
        className={`flex items-center border-b border-slate-800/80 px-3 py-3 ${
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

      {/* 11 Division Navigation Items */}
      <nav
        aria-label="Daftar divisi kantor AI"
        className="flex-1 space-y-1 overflow-y-auto px-2 py-2.5"
      >
        {WORKSPACE_DIVISIONS.map((div) => {
          const Icon = DIVISION_ICONS[div.id];
          const isActive = activeDivision === div.id;
          return (
            <button
              key={div.id}
              type="button"
              onClick={() => onSelectDivision(div.id)}
              aria-current={isActive ? 'page' : undefined}
              title={collapsed ? `${div.label} — ${div.divisionName}` : div.divisionName}
              className={`group flex w-full items-center rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 ${
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5 text-left'
              } ${
                isActive
                  ? 'bg-[#192942] text-white font-semibold shadow-xs'
                  : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
              }`}
            >
              <Icon
                className={`h-[17px] w-[17px] shrink-0 transition-colors ${
                  isActive ? 'text-sky-300' : 'text-slate-400 group-hover:text-slate-200'
                }`}
                aria-hidden="true"
              />
              {!collapsed && <span className="truncate text-[13px]">{div.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Compact Active Division & 3D Lead Agents Footer */}
      {!collapsed && (
        <div className="border-t border-slate-800/90 bg-[#09101b] px-3 py-2.5">
          <p className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
            Divisi Aktif
          </p>
          <p className="mt-0.5 truncate text-xs font-semibold text-slate-100">
            {current.divisionName}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {current.leadAgents.map((agentId) => {
              const profile = AGENT_PROFILES[agentId];
              return (
                <span
                  key={agentId}
                  title={`${profile.name} — ${profile.role}`}
                  className="inline-flex items-center gap-1 rounded bg-slate-800/90 px-1.5 py-0.5 text-[10px] text-slate-200"
                >
                  <span
                    className="h-2 w-2 rounded-xs"
                    style={{ backgroundColor: profile.accentHex }}
                    aria-hidden="true"
                  />
                  {profile.shortName}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}
