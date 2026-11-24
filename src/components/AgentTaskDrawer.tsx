import { useState, type FormEvent } from 'react';
import { Send, X, Loader2, AlertCircle, Users } from 'lucide-react';
import { getSpecialistById } from '../office/agentRoster';
import { AGENT_PROFILES, ZONE_LABELS } from '../office/layout';
import { validateTaskPrompt } from '../office/simulation';
import type { AgentRuntimeState, LightingPreset, TaskEntry } from '../office/types';

interface AgentTaskDrawerProps {
  agent: AgentRuntimeState;
  tasks: TaskEntry[];
  lighting: LightingPreset;
  onClose: () => void;
  onOpenAgentRoster?: () => void;
  onSubmitTask: (prompt: string) => void;
}

export function AgentTaskDrawer({
  agent,
  tasks,
  lighting,
  onClose,
  onOpenAgentRoster,
  onSubmitTask,
}: AgentTaskDrawerProps) {
  const [prompt, setPrompt] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const profile = AGENT_PROFILES[agent.id];
  const specialist = getSpecialistById(agent.id);
  const isDark = lighting === 'malam';
  const isRunning = Boolean(agent.activeTaskId);
  const latestTasks = tasks.slice(0, 3);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const check = validateTaskPrompt(prompt);
    if (!check.valid) {
      setValidationError(check.error ?? 'Instruksi tidak valid.');
      return;
    }
    setValidationError(null);
    onSubmitTask(check.trimmed);
    setPrompt('');
  };

  return (
    <section
      aria-label={`Panel tugas untuk ${agent.name}`}
      className={`pointer-events-auto mb-2.5 w-full rounded-xl border p-4 shadow-lg transition-colors duration-200 ${
        isDark
          ? 'border-slate-700/90 bg-[#0f172a]/95 text-slate-100'
          : 'border-slate-200 bg-[#fcfbf8]/96 text-slate-900'
      }`}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: agent.accentHex }}
              aria-hidden="true"
            />
            <h2 className="truncate text-base font-semibold tracking-tight">
              {agent.name}
            </h2>
            <span
              className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}
            >
              {agent.role}
            </span>
          </div>
          <p
            className={`mt-1 text-xs ${
              isDark ? 'text-slate-300' : 'text-slate-600'
            }`}
          >
            <span>{ZONE_LABELS[agent.currentZone]}</span>
            <span className="mx-1.5" aria-hidden="true">
              ·
            </span>
            <span>{agent.statusLabel}</span>
            {specialist && (
              <>
                <span className="mx-1.5" aria-hidden="true">
                  ·
                </span>
                <span>
                  {specialist.jobTitleId} · Divisi {specialist.divisionLabel}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {onOpenAgentRoster && (
            <button
              type="button"
              onClick={onOpenAgentRoster}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                isDark
                  ? 'border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-700 hover:text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              Direktori 13 Agen
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={`Tutup panel ${agent.name}`}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
              isDark
                ? 'border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
                : 'border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Concrete Role Responsibilities */}
      {specialist && (
        <ul
          className={`mt-2.5 grid grid-cols-1 gap-1 border-t pt-2 text-[11px] leading-relaxed sm:grid-cols-3 sm:gap-2.5 ${
            isDark ? 'border-slate-800 text-slate-300' : 'border-slate-200/80 text-slate-600'
          }`}
        >
          {specialist.responsibilities.map((item, idx) => (
            <li key={idx}>
              <span
                className={`font-mono text-[10px] font-semibold ${
                  isDark ? 'text-amber-400' : 'text-amber-700'
                }`}
              >
                0{idx + 1}.{' '}
              </span>
              {item}
            </li>
          ))}
        </ul>
      )}

      {/* Task Assignment Form */}
      <form onSubmit={handleSubmit} className="mt-3" noValidate>
        <label
          htmlFor="agent-task-input"
          className={`block text-xs font-medium ${
            isDark ? 'text-slate-300' : 'text-slate-700'
          }`}
        >
          Beri tugas nyata ke {agent.name}
        </label>

        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <input
            id="agent-task-input"
            type="text"
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              if (validationError) setValidationError(null);
            }}
            placeholder={`Contoh: ${profile.samplePrompts[0]}`}
            disabled={isRunning}
            className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 disabled:opacity-60 ${
              isDark
                ? 'border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500'
                : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'
            }`}
          />
          <button
            type="submit"
            disabled={isRunning}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold whitespace-nowrap text-white transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500"
            style={
              isDark
                ? { backgroundColor: agent.accentHex, color: '#ffffff' }
                : undefined
            }
          >
            {isRunning ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Memproses
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                Kirim Tugas
              </>
            )}
          </button>
        </div>

        {validationError && (
          <p
            role="alert"
            className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600"
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {validationError}
          </p>
        )}

        {/* Quick sample prompts */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
            Saran cepat:
          </span>
          {profile.samplePrompts.map((sample, idx) => (
            <button
              key={idx}
              type="button"
              disabled={isRunning}
              onClick={() => {
                setPrompt(sample);
                setValidationError(null);
              }}
              className={`max-w-[260px] truncate text-left underline decoration-dotted underline-offset-2 transition-colors disabled:opacity-50 ${
                isDark
                  ? 'text-slate-300 hover:text-white'
                  : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              {sample}
            </button>
          ))}
        </div>
      </form>

      {/* Latest Output / History */}
      {latestTasks.length > 0 && (
        <div
          className={`mt-3 max-h-44 space-y-2.5 overflow-y-auto border-t pt-3 ${
            isDark ? 'border-slate-800' : 'border-slate-200'
          }`}
        >
          {latestTasks.map((entry) => (
            <div key={entry.id} className="text-xs leading-relaxed">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{entry.prompt}</span>
                <span
                  className={`shrink-0 font-mono text-[11px] tabular-nums ${
                    entry.status === 'error'
                      ? 'text-red-500'
                      : entry.status === 'running'
                      ? isDark
                        ? 'text-amber-300'
                        : 'text-amber-700'
                      : isDark
                      ? 'text-emerald-400'
                      : 'text-emerald-700'
                  }`}
                >
                  {entry.status === 'running'
                    ? 'Sedang berjalan'
                    : entry.status === 'error'
                    ? 'Gagal'
                    : 'Selesai'}
                </span>
              </div>

              {entry.output && (
                <div
                  className={`mt-1.5 whitespace-pre-wrap rounded-lg border px-3 py-2 text-xs leading-relaxed ${
                    isDark
                      ? 'border-slate-800 bg-slate-900/90 text-slate-200'
                      : 'border-slate-200/80 bg-white text-slate-700'
                  }`}
                >
                  {entry.output}
                </div>
              )}

              {entry.error && (
                <p className="mt-1 text-xs text-red-500">{entry.error}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
