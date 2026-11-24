import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ActivityLogEntry } from '../office/activityLog';
import type { AgentId, LightingPreset } from '../office/types';

interface ActivityLogPanelProps {
  entries: ActivityLogEntry[];
  lighting: LightingPreset;
  selectedAgentId: AgentId | null;
  onSelectAgent: (agentId: AgentId) => void;
}

export function ActivityLogPanel({
  entries,
  lighting,
  selectedAgentId,
  onSelectAgent,
}: ActivityLogPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const isDark = lighting === 'malam';

  const surfaceClass = isDark
    ? 'border-slate-700/90 bg-[#0f172a]/94 text-slate-100'
    : 'border-slate-200/95 bg-[#fcfbf8]/95 text-slate-900';

  const mutedTextClass = isDark ? 'text-slate-400' : 'text-slate-500';
  const dividerClass = isDark ? 'border-slate-800' : 'border-slate-200/90';

  return (
    <section
      aria-label="Log aktivitas agen AI"
      data-testid="activity-log-panel"
      data-entry-count={entries.length}
      className={`pointer-events-auto w-full rounded-xl border shadow-sm transition-colors duration-200 sm:w-[310px] ${surfaceClass}`}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="truncate text-xs font-semibold tracking-tight">
            Log Aktivitas
          </h2>
          <span className={`font-mono text-[11px] tabular-nums ${mutedTextClass}`}>
            {entries.length} catatan
          </span>
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Tampilkan log aktivitas' : 'Ringkas log aktivitas'}
          className={`inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
            isDark
              ? 'text-slate-300 hover:bg-slate-800 hover:text-white'
              : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
          }`}
        >
          <span>{collapsed ? 'Buka' : 'Ringkas'}</span>
          {collapsed ? (
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ChevronUp className="h-3 w-3" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Scrolling Timestamped Event Feed */}
      {!collapsed && (
        <div
          className={`max-h-[148px] overflow-y-auto border-t px-2 py-1.5 ${dividerClass}`}
        >
          {entries.length === 0 ? (
            <p className={`px-2 py-3 text-center text-xs ${mutedTextClass}`}>
              Belum ada perubahan status agen.
            </p>
          ) : (
            <ol
              className="space-y-0.5"
              aria-label="Daftar perubahan status agen terbaru"
              aria-live="polite"
            >
              {entries.map((entry) => {
                const isSelected = selectedAgentId === entry.agentId;
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => onSelectAgent(entry.agentId)}
                      className={`flex w-full items-start gap-2 rounded-md px-2 py-1 text-left text-xs leading-snug transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                        isSelected
                          ? isDark
                            ? 'bg-slate-800 text-white'
                            : 'bg-slate-200/80 text-slate-950'
                          : isDark
                          ? 'text-slate-200 hover:bg-slate-800/65'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <time
                        className={`mt-0.5 shrink-0 font-mono text-[11px] tabular-nums ${mutedTextClass}`}
                      >
                        {entry.timestamp}
                      </time>
                      <span
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-xs"
                        style={{ backgroundColor: entry.accentHex }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 break-words">
                        {entry.message}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
