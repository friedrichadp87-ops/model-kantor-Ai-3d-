import { useCallback, useEffect, useId, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  ExternalLink,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { firebaseConfig } from '../firebase/client';
import type { FirebaseAuthUserSummary } from '../firebase/officeSync';
import {
  AI_STUDIO_API_KEY_URL,
  FIREBASE_CONSOLE_BASE_URL,
  GEMINI_SECRET_VARIABLES,
  SETUP_GUIDE_STEPS,
  computeChecklistProgress,
} from '../office/setupGuide';
import type { LightingPreset } from '../office/types';

interface SetupGuideModalProps {
  open: boolean;
  lighting: LightingPreset;
  firebaseUser: FirebaseAuthUserSummary | null;
  onOpenFirebaseAuth: () => void;
  onOpenProviderSettings: () => void;
  onClose: (dontShowAgain: boolean) => void;
}

interface ServerKeyProbeState {
  loading: boolean;
  geminiConfigured: boolean | null;
  reachable: boolean;
}

export function SetupGuideModal({
  open,
  lighting,
  firebaseUser,
  onOpenFirebaseAuth,
  onOpenProviderSettings,
  onClose,
}: SetupGuideModalProps) {
  const [checkedStepIds, setCheckedStepIds] = useState<string[]>([]);
  const [dontShowAgain, setDontShowAgain] = useState<boolean>(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [serverProbe, setServerProbe] = useState<ServerKeyProbeState>({
    loading: false,
    geminiConfigured: null,
    reachable: false,
  });

  const checkboxId = useId();
  const headingId = useId();

  const checkServerStatus = useCallback(async () => {
    setServerProbe((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch('/api/providers/status');
      const contentType = res.headers.get('content-type') ?? '';
      if (res.ok && contentType.includes('application/json')) {
        const data = (await res.json()) as { gemini?: { configured?: boolean } };
        setServerProbe({
          loading: false,
          geminiConfigured: Boolean(data.gemini?.configured),
          reachable: true,
        });
        return;
      }
      setServerProbe({ loading: false, geminiConfigured: null, reachable: false });
    } catch {
      setServerProbe({ loading: false, geminiConfigured: null, reachable: false });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void checkServerStatus();
  }, [open, checkServerStatus]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose(dontShowAgain);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, dontShowAgain, onClose]);

  if (!open) return null;

  const isDark = lighting === 'malam';
  const progress = computeChecklistProgress(checkedStepIds);
  const firebaseProjectUrl = `${FIREBASE_CONSOLE_BASE_URL}/project/${firebaseConfig.projectId}/settings/general`;

  const modalSurface = isDark
    ? 'border-slate-700/90 bg-[#0b1526] text-slate-100'
    : 'border-slate-200 bg-[#fcfbf8] text-slate-900';
  const subtleBorder = isDark ? 'border-slate-800' : 'border-slate-200/90';
  const mutedText = isDark ? 'text-slate-400' : 'text-slate-600';
  const cardBg = isDark ? 'border-slate-800 bg-[#101e34]' : 'border-slate-200 bg-white';
  const subSurface = isDark
    ? 'border-slate-700/80 bg-[#0a1322]'
    : 'border-slate-200/90 bg-slate-50/90';

  const toggleStep = (stepId: string) => {
    setCheckedStepIds((prev) =>
      prev.includes(stepId) ? prev.filter((id) => id !== stepId) : [...prev, stepId]
    );
  };

  const handleCopyEnvVar = async (varName: string) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(varName);
      setCopiedKey(varName);
      setTimeout(() => {
        setCopiedKey((current) => (current === varName ? null : current));
      }, 1800);
    } catch {
      // Ignore clipboard permission restrictions
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      data-testid="setup-guide-modal"
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(dontShowAgain);
      }}
    >
      <div
        className={`flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-2xl ${modalSurface}`}
      >
        {/* Header */}
        <div className={`flex items-start justify-between gap-3 border-b px-5 py-4 ${subtleBorder}`}>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                  isDark
                    ? 'border-sky-500/40 bg-sky-500/15 text-sky-300'
                    : 'border-sky-200 bg-sky-50 text-sky-700'
                }`}
              >
                <KeyRound className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p
                  className={`text-[10.5px] font-semibold tracking-wider uppercase ${
                    isDark ? 'text-sky-300' : 'text-sky-700'
                  }`}
                >
                  Panduan Awal Kantor AI 3D
                </p>
                <h2 id={headingId} className="truncate text-base font-bold tracking-tight">
                  Cara Mendapatkan Gemini API Key &amp; Sinkronisasi Firebase
                </h2>
              </div>
            </div>
            <p className={`mt-1.5 text-xs leading-relaxed ${mutedText}`}>
              Ikuti 3 langkah berikut agar seluruh 39 agen AI (Lantai 1–3) aktif dengan kunci API
              aman di server dan tersinkron ke project Firebase{' '}
              <code className="font-mono font-semibold">{firebaseConfig.projectId}</code>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onClose(dontShowAgain)}
            aria-label="Tutup panduan awal"
            className={`rounded-lg p-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
              isDark
                ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
                : 'text-slate-500 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="space-y-3.5 overflow-y-auto px-5 py-4">
          {/* Live Status & Progress Strip */}
          <div
            className={`flex flex-wrap items-center justify-between gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs ${cardBg}`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <ShieldCheck
                  className={`h-4 w-4 shrink-0 ${
                    serverProbe.geminiConfigured ? 'text-emerald-500' : 'text-amber-500'
                  }`}
                  aria-hidden="true"
                />
                <span>
                  Gemini API:{' '}
                  <strong
                    className={
                      serverProbe.geminiConfigured
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : isDark
                        ? 'text-amber-300'
                        : 'text-amber-700'
                    }
                  >
                    {serverProbe.loading
                      ? 'Memeriksa...'
                      : serverProbe.geminiConfigured
                      ? 'Aktif di Server'
                      : 'Perlu Diatur di Secrets'}
                  </strong>
                </span>
              </div>

              <span className={`hidden h-3.5 w-px sm:inline-block ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />

              <div className="flex items-center gap-1.5">
                <Cloud
                  className={`h-4 w-4 shrink-0 ${
                    firebaseUser ? 'text-emerald-500' : 'text-sky-500'
                  }`}
                  aria-hidden="true"
                />
                <span>
                  Firebase:{' '}
                  <strong>
                    {firebaseUser
                      ? firebaseUser.email ?? 'Sudah Masuk'
                      : 'Belum Masuk'}
                  </strong>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-medium ${mutedText}`}>
                Checklist {progress.completed}/{progress.total}
              </span>
              <button
                type="button"
                onClick={() => void checkServerStatus()}
                disabled={serverProbe.loading}
                aria-label="Cek ulang status Gemini server"
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-60 ${
                  isDark
                    ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <RefreshCw
                  className={`h-3 w-3 ${serverProbe.loading ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>Cek Status</span>
              </button>
            </div>
          </div>

          {/* 3-Step Detailed Instructions */}
          <ol className="space-y-3">
            {SETUP_GUIDE_STEPS.map((step) => {
              const isDone = checkedStepIds.includes(step.id);
              return (
                <li
                  key={step.id}
                  data-testid={`setup-step-${step.id}`}
                  className={`rounded-xl border p-3.5 transition-colors ${
                    isDone
                      ? isDark
                        ? 'border-emerald-700/70 bg-emerald-950/20'
                        : 'border-emerald-300 bg-emerald-50/45'
                      : cardBg
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <span
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold ${
                          isDone
                            ? 'bg-emerald-600 text-white'
                            : isDark
                            ? 'bg-slate-800 text-sky-300'
                            : 'bg-slate-900 text-white'
                        }`}
                      >
                        {isDone ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : step.stepNumber}
                      </span>
                      <div>
                        <h3 className="text-sm font-bold leading-snug">{step.title}</h3>
                        <p className={`mt-0.5 text-xs ${mutedText}`}>{step.summary}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleStep(step.id)}
                      aria-pressed={isDone}
                      className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        isDone
                          ? isDark
                            ? 'border-emerald-600/60 bg-emerald-900/50 text-emerald-200'
                            : 'border-emerald-300 bg-emerald-100 text-emerald-800'
                          : isDark
                          ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{isDone ? 'Selesai' : 'Tandai'}</span>
                    </button>
                  </div>

                  <ul className={`mt-2.5 space-y-1.5 pl-8 text-xs leading-relaxed ${mutedText}`}>
                    {step.bullets.map((bullet, idx) => (
                      <li key={idx} className="list-disc">
                        {bullet}
                      </li>
                    ))}
                  </ul>

                  {/* Step 1 Direct Link */}
                  {step.id === 'get-gemini-key' && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 pl-8">
                      <a
                        href={AI_STUDIO_API_KEY_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                          isDark
                            ? 'bg-sky-600 text-white hover:bg-sky-500'
                            : 'bg-slate-900 text-white hover:bg-slate-800'
                        }`}
                      >
                        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Buka Google AI Studio API Keys</span>
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                      <a
                        href={firebaseProjectUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                          isDark
                            ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                            : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                        }`}
                      >
                        <span>Buka Project Firebase ({firebaseConfig.projectId})</span>
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    </div>
                  )}

                  {/* Step 2 Copyable Secret Variable Names */}
                  {step.id === 'set-secrets' && (
                    <div className={`mt-3 ml-8 rounded-lg border p-2.5 ${subSurface}`}>
                      <p className="text-[11px] font-semibold">
                        Nama Variabel yang Dimasukkan di Settings &gt; Secrets:
                      </p>
                      <div className="mt-2 space-y-1.5">
                        {GEMINI_SECRET_VARIABLES.map((item) => (
                          <div
                            key={item.key}
                            className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 ${
                              isDark
                                ? 'border-slate-800 bg-[#0e1a2e]'
                                : 'border-slate-200 bg-white'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <code className="font-mono text-[11px] font-bold">
                                  {item.key}
                                </code>
                                <span
                                  className={`text-[10px] font-semibold ${
                                    item.required
                                      ? isDark
                                        ? 'text-emerald-300'
                                        : 'text-emerald-700'
                                      : mutedText
                                  }`}
                                >
                                  · {item.required ? 'Wajib' : 'Opsional'}
                                </span>
                              </div>
                              <p className={`text-[10.5px] ${mutedText}`}>{item.scope}</p>
                            </div>

                            <button
                              type="button"
                              onClick={() => void handleCopyEnvVar(item.key)}
                              aria-label={`Salin nama variabel ${item.key}`}
                              className={`inline-flex shrink-0 items-center gap-1 rounded border px-2 py-1 text-[10.5px] font-semibold transition-colors ${
                                isDark
                                  ? 'border-slate-700 text-slate-200 hover:border-sky-500'
                                  : 'border-slate-300 bg-slate-50 text-slate-700 hover:border-sky-500'
                              }`}
                            >
                              {copiedKey === item.key ? (
                                <>
                                  <Check className="h-3 w-3 text-emerald-500" aria-hidden="true" />
                                  <span>Tersalin</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" aria-hidden="true" />
                                  <span>Salin</span>
                                </>
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Step 3 Quick Actions Inside Kantor AI */}
                  {step.id === 'sync-firebase' && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 pl-8">
                      <button
                        type="button"
                        data-testid="setup-open-firebase-btn"
                        onClick={() => {
                          onClose(dontShowAgain);
                          onOpenFirebaseAuth();
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                          isDark
                            ? 'border-amber-500/50 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
                            : 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                        }`}
                      >
                        <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>
                          {firebaseUser ? 'Buka Status Firebase Cloud' : 'Buka Login Firebase'}
                        </span>
                      </button>

                      <button
                        type="button"
                        data-testid="setup-open-settings-btn"
                        onClick={() => {
                          onClose(dontShowAgain);
                          onOpenProviderSettings();
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                          isDark
                            ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                            : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                        }`}
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Buka Pengaturan Gemini</span>
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {/* Footer */}
        <div
          className={`flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3.5 ${subtleBorder}`}
        >
          <label
            htmlFor={checkboxId}
            className={`inline-flex cursor-pointer items-center gap-2 text-xs select-none ${mutedText}`}
          >
            <input
              id={checkboxId}
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 accent-sky-600"
            />
            <span>Jangan tampilkan otomatis lagi saat membuka aplikasi</span>
          </label>

          <button
            type="button"
            data-testid="setup-guide-dismiss-btn"
            onClick={() => onClose(dontShowAgain)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
              isDark
                ? 'bg-sky-600 text-white hover:bg-sky-500'
                : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            <span>Saya Mengerti, Mulai Kantor AI 3D</span>
          </button>
        </div>
      </div>
    </div>
  );
}
