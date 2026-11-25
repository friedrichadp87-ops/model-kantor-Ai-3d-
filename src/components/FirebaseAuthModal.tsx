import { useId, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  Database,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  Mail,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
  X,
} from 'lucide-react';
import {
  firebaseConfig,
  registerWithEmailPassword,
  signInWithEmailPassword,
  signInWithGooglePopup,
  signOutFirebase,
  type FirestoreSyncStatus,
} from '../firebase/client';
import {
  FIRESTORE_PATHS,
  formatFirebaseAuthError,
  type FirebaseAuthUserSummary,
} from '../firebase/officeSync';
import type { LightingPreset } from '../office/types';

interface FirebaseAuthModalProps {
  open: boolean;
  lighting: LightingPreset;
  authLoading: boolean;
  user: FirebaseAuthUserSummary | null;
  syncStatus: FirestoreSyncStatus;
  onSyncNow: () => Promise<void>;
  onClose: () => void;
}

export function FirebaseAuthModal({
  open,
  lighting,
  authLoading,
  user,
  syncStatus,
  onSyncNow,
  onClose,
}: FirebaseAuthModalProps) {
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedHost, setCopiedHost] = useState(false);

  const emailId = useId();
  const passwordId = useId();
  const nameId = useId();

  if (!open) return null;

  const isDark = lighting === 'malam';
  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';

  const modalSurface = isDark
    ? 'border-slate-700/90 bg-[#0b1526] text-slate-100'
    : 'border-slate-200 bg-[#fcfbf8] text-slate-900';
  const subtleBorder = isDark ? 'border-slate-800' : 'border-slate-200/90';
  const mutedText = isDark ? 'text-slate-400' : 'text-slate-600';
  const cardBg = isDark ? 'border-slate-800 bg-[#101e34]' : 'border-slate-200 bg-white';
  const inputBg = isDark
    ? 'border-slate-700 bg-[#0e1a2e] text-slate-100 placeholder:text-slate-500'
    : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400';

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setGoogleLoading(true);
    try {
      await signInWithGooglePopup();
      setSuccessMsg('Berhasil masuk dengan akun Google Firebase.');
    } catch (error) {
      setErrorMsg(formatFirebaseAuthError(error, currentHost));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!email.trim() || !password) {
      setErrorMsg('Masukkan alamat email dan kata sandi terlebih dahulu.');
      return;
    }

    setSubmitting(true);
    try {
      if (authTab === 'login') {
        await signInWithEmailPassword(email, password);
        setSuccessMsg('Berhasil masuk ke akun Firebase Anda.');
      } else {
        await registerWithEmailPassword(email, password, displayName);
        setSuccessMsg('Akun Firebase berhasil dibuat dan langsung masuk.');
      }
      setPassword('');
    } catch (error) {
      setErrorMsg(formatFirebaseAuthError(error, currentHost));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setSignOutLoading(true);
    try {
      await signOutFirebase();
      setSuccessMsg('Berhasil keluar. Kantor AI 3D tetap berjalan lancar dalam mode pratinjau.');
    } catch (error) {
      setErrorMsg(formatFirebaseAuthError(error, currentHost));
    } finally {
      setSignOutLoading(false);
    }
  };

  const handleManualSync = async () => {
    setSyncingNow(true);
    try {
      await onSyncNow();
    } finally {
      setSyncingNow(false);
    }
  };

  const handleCopyHost = async () => {
    if (!currentHost || typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(currentHost);
      setCopiedHost(true);
      setTimeout(() => setCopiedHost(false), 1800);
    } catch {
      // Ignore clipboard restrictions
    }
  };

  const initials = (user?.displayName || user?.email || 'KA')
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Autentikasi & Sinkronisasi Firebase Kantor AI"
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border shadow-2xl ${modalSurface}`}
      >
        {/* Header */}
        <div className={`flex items-start justify-between gap-3 border-b px-5 py-4 ${subtleBorder}`}>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Cloud className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
              <h2 className="truncate text-base font-bold tracking-tight">
                Firebase Authentication &amp; Cloud Sync
              </h2>
            </div>
            <p className={`mt-0.5 truncate font-mono text-[11px] ${mutedText}`}>
              Proyek: {firebaseConfig.projectId} · {firebaseConfig.authDomain}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup panel login Firebase"
            className={`rounded-lg p-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
              isDark
                ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
                : 'text-slate-500 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {/* Connection Status Strip */}
          <div className={`flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-xs ${cardBg}`}>
            <div className="flex items-center gap-2">
              <Database
                className={`h-4 w-4 shrink-0 ${
                  syncStatus.connection === 'offline' ? 'text-rose-500' : 'text-emerald-500'
                }`}
                aria-hidden="true"
              />
              <div>
                <p className="font-semibold">
                  {syncStatus.connection === 'checking'
                    ? 'Memeriksa koneksi Firebase...'
                    : syncStatus.connection === 'offline'
                    ? 'Firebase Offline'
                    : 'Tersambung ke proyek kantor-ai-agent-creator'}
                </p>
                <p className={`text-[11px] ${mutedText}`}>
                  {user
                    ? `Masuk sebagai ${user.email ?? user.displayName ?? user.uid}`
                    : 'Mode pratinjau aktif — masuk untuk menyinkronkan data ke Firestore'}
                </p>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed ${
                isDark
                  ? 'border-rose-500/40 bg-rose-950/50 text-rose-200'
                  : 'border-rose-300 bg-rose-50 text-rose-800'
              }`}
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div
              role="status"
              className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed ${
                isDark
                  ? 'border-emerald-500/40 bg-emerald-950/50 text-emerald-200'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-900'
              }`}
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{successMsg}</span>
            </div>
          )}

          {authLoading ? (
            <div className={`flex items-center justify-center gap-2 rounded-xl border py-8 text-xs ${cardBg}`}>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>Memeriksa sesi Firebase Authentication...</span>
            </div>
          ) : user ? (
            /* Signed-in View */
            <div className="space-y-3">
              <div className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 ${cardBg}`}>
                <div className="flex min-w-0 items-center gap-3">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName ?? 'Pengguna Firebase'}
                      referrerPolicy="no-referrer"
                      className="h-11 w-11 shrink-0 rounded-full border border-slate-300 object-cover"
                    />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white">
                      {initials}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">
                      {user.displayName || 'Pengguna Kantor AI'}
                    </p>
                    <p className={`truncate text-xs ${mutedText}`}>{user.email ?? 'Akun Firebase'}</p>
                    <p className={`mt-0.5 truncate font-mono text-[10px] ${mutedText}`}>
                      UID: {user.uid}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  disabled={signOutLoading}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                    isDark
                      ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {signOutLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Keluar
                </button>
              </div>

              {/* Firestore Sync Diagnostics */}
              <div className={`space-y-2.5 rounded-xl border p-3.5 ${cardBg}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {syncStatus.state === 'permission-denied' ? (
                      <ShieldAlert className="h-4 w-4 text-amber-500" aria-hidden="true" />
                    ) : (
                      <ShieldCheck className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                    )}
                    <h3 className="text-xs font-bold">Status Sinkronisasi Cloud Firestore</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleManualSync()}
                    disabled={syncingNow}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-60 ${
                      isDark
                        ? 'bg-sky-600 text-white hover:bg-sky-500'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${syncingNow ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                    Sinkronkan Sekarang
                  </button>
                </div>

                <p className={`text-xs leading-relaxed ${mutedText}`}>{syncStatus.message}</p>

                {syncStatus.state === 'permission-denied' && (
                  <div
                    className={`rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${
                      isDark
                        ? 'border-amber-500/40 bg-amber-950/40 text-amber-200'
                        : 'border-amber-300 bg-amber-50 text-amber-900'
                    }`}
                  >
                    <strong>Butuh penyesuaian Firestore Rules / Google Auth:</strong> Path{' '}
                    <code className="font-mono">{syncStatus.blockedPath ?? 'users/{uid}'}</code>{' '}
                    ditolak oleh aturan Firestore proyek Anda.{' '}
                    {!user.providerIds.includes('google.com')
                      ? 'Akun Anda saat ini masuk tanpa Google — gunakan tombol Masuk dengan Google agar cocok dengan fungsi isGoogleOwner(uid).'
                      : 'Pastikan rules terbaru untuk workspace, shortsQueue, dan agentTasks sudah dipublikasikan di Firebase Console.'}
                  </div>
                )}

                <div className="space-y-1 pt-1">
                  <p className={`text-[11px] font-semibold ${mutedText}`}>
                    Path koleksi yang digunakan akun ini:
                  </p>
                  <ul className="space-y-1 font-mono text-[11px]">
                    <li className="truncate">{FIRESTORE_PATHS.userDoc(user.uid)}</li>
                    <li className="truncate">{FIRESTORE_PATHS.workspaceSettingsDoc(user.uid)}</li>
                    <li className="truncate">{FIRESTORE_PATHS.shortsQueueCollection(user.uid)}</li>
                    <li className="truncate">{FIRESTORE_PATHS.agentTasksCollection(user.uid)}</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            /* Signed-out Login & Register Form */
            <div className="space-y-3.5">
              {/* Primary Google Sign-In Popup */}
              <button
                type="button"
                onClick={() => void handleGoogleSignIn()}
                disabled={googleLoading || submitting}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-xs transition-colors disabled:opacity-60 ${
                  isDark
                    ? 'border-slate-600 bg-white text-slate-950 hover:bg-slate-100'
                    : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-50'
                }`}
              >
                {googleLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <LogIn className="h-4 w-4 text-sky-600" aria-hidden="true" />
                )}
                Masuk dengan Google (Firebase Auth)
              </button>
              <p className={`text-center text-[11px] leading-snug ${mutedText}`}>
                Direkomendasikan — Firestore Rules proyek <code className="font-mono">kantor-ai-agent-creator</code>{' '}
                memverifikasi login Google (<code className="font-mono">isGoogleOwner</code>).
              </p>

              <div className="flex items-center gap-3">
                <div className={`h-px flex-1 ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
                <span className={`text-[11px] font-medium ${mutedText}`}>atau dengan Email</span>
                <div className={`h-px flex-1 ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
              </div>

              {/* Email / Password Tabs */}
              <div className={`rounded-xl border p-3.5 ${cardBg}`}>
                <div
                  className={`mb-3 grid grid-cols-2 gap-1 rounded-lg p-1 ${
                    isDark ? 'bg-[#09111f]' : 'bg-slate-100'
                  }`}
                  role="tablist"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={authTab === 'login'}
                    onClick={() => {
                      setAuthTab('login');
                      setErrorMsg(null);
                    }}
                    className={`rounded-md py-1.5 text-xs font-semibold transition-colors ${
                      authTab === 'login'
                        ? isDark
                          ? 'bg-[#192942] text-white'
                          : 'bg-white text-slate-950 shadow-xs'
                        : mutedText
                    }`}
                  >
                    Masuk Email
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={authTab === 'register'}
                    onClick={() => {
                      setAuthTab('register');
                      setErrorMsg(null);
                    }}
                    className={`rounded-md py-1.5 text-xs font-semibold transition-colors ${
                      authTab === 'register'
                        ? isDark
                          ? 'bg-[#192942] text-white'
                          : 'bg-white text-slate-950 shadow-xs'
                        : mutedText
                    }`}
                  >
                    Daftar Akun Baru
                  </button>
                </div>

                <form onSubmit={(e) => void handleEmailSubmit(e)} className="space-y-2.5">
                  {authTab === 'register' && (
                    <div>
                      <label htmlFor={nameId} className="block text-xs font-semibold">
                        Nama Tampilan
                      </label>
                      <input
                        id={nameId}
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Nama pemilik studio"
                        className={`mt-1 w-full rounded-lg border px-3 py-2 text-xs focus:border-blue-500 focus:outline-none ${inputBg}`}
                      />
                    </div>
                  )}

                  <div>
                    <label htmlFor={emailId} className="block text-xs font-semibold">
                      Alamat Email
                    </label>
                    <div className="relative mt-1">
                      <Mail
                        className={`pointer-events-none absolute top-2.5 left-3 h-3.5 w-3.5 ${mutedText}`}
                        aria-hidden="true"
                      />
                      <input
                        id={emailId}
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="nama@email.com"
                        className={`w-full rounded-lg border py-2 pr-3 pl-8 text-xs focus:border-blue-500 focus:outline-none ${inputBg}`}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor={passwordId} className="block text-xs font-semibold">
                      Kata Sandi
                    </label>
                    <div className="relative mt-1">
                      <KeyRound
                        className={`pointer-events-none absolute top-2.5 left-3 h-3.5 w-3.5 ${mutedText}`}
                        aria-hidden="true"
                      />
                      <input
                        id={passwordId}
                        type="password"
                        required
                        minLength={6}
                        autoComplete={authTab === 'login' ? 'current-password' : 'new-password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Minimal 6 karakter"
                        className={`w-full rounded-lg border py-2 pr-3 pl-8 text-xs focus:border-blue-500 focus:outline-none ${inputBg}`}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || googleLoading}
                    className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-60 ${
                      isDark
                        ? 'bg-sky-600 text-white hover:bg-sky-500'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    {submitting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : authTab === 'login' ? (
                      <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {authTab === 'login' ? 'Masuk ke Kantor AI' : 'Buat Akun & Masuk'}
                  </button>
                </form>
              </div>

              {/* Authorized Domain Quick Helper for Preview */}
              {currentHost && (
                <div className={`rounded-xl border px-3.5 py-2.5 text-[11px] leading-relaxed ${cardBg}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">Domain Pratinjau (Authorized Domain)</span>
                    <button
                      type="button"
                      onClick={() => void handleCopyHost()}
                      className="inline-flex items-center gap-1 rounded border border-slate-300/60 px-2 py-0.5 text-[10px] font-medium hover:border-sky-500"
                    >
                      {copiedHost ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-500" aria-hidden="true" />
                          Tersalin
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" aria-hidden="true" />
                          Salin Domain
                        </>
                      )}
                    </button>
                  </div>
                  <p className={`mt-1 break-all font-mono text-[10px] ${mutedText}`}>{currentHost}</p>
                  <p className={`mt-1 ${mutedText}`}>
                    Jika login Google menampilkan <em>unauthorized-domain</em>, tambahkan domain di
                    atas pada Firebase Console → Authentication → Settings → Authorized domains.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`flex items-center justify-between gap-2 border-t px-5 py-3 text-xs ${subtleBorder}`}
        >
          <span className={`text-[11px] ${mutedText}`}>
            Pratinjau 3D tetap berjalan lancar dengan atau tanpa login.
          </span>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              isDark
                ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
            }`}
          >
            {user ? 'Kembali ke Kantor 3D' : 'Lanjutkan Mode Pratinjau'}
          </button>
        </div>
      </div>
    </div>
  );
}
