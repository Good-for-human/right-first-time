import { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
  type User,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { upsertUserProfileByUid } from '@/services/firestoreService';
import type { CountryCode, UserRole } from '@/types';
import { Loader2, Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';

type Tab = 'login' | 'register';

const REGISTER_COUNTRIES: CountryCode[] = ['UK', 'DE', 'IT', 'ES', 'FR', 'BE', 'NL', 'PL', 'SE'];
const ADMIN_EMAIL = 'admin@tp-link.com';
const ADMIN_PASSWORD = 'tp-link123';
const pendingCountryStorageKey = (email: string) => `rft.pendingCountry.${email.trim().toLowerCase()}`;
const authNoticeStorageKey = 'rft.auth.notice';

const FIREBASE_ERRORS: Record<string, string> = {
  'auth/user-not-found': 'This email is not registered.',
  'auth/wrong-password': 'Incorrect password. Please try again.',
  'auth/email-already-in-use': 'This email is already registered.',
  'auth/invalid-email': 'Invalid email format.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/too-many-requests': 'Too many login attempts. Please try again later.',
  'auth/network-request-failed': 'Network error. Please check your connection.',
  'auth/invalid-credential': 'Invalid email or password.',
  'auth/invalid-login-credentials': 'Invalid email or password.',
  'auth/user-disabled': 'This account has been disabled. Please contact admin.',
  'auth/unauthorized-domain': 'This domain is not authorized for Firebase Auth. Add your Netlify domain in Firebase Console > Authentication > Settings > Authorized domains.',
  'auth/operation-not-allowed': 'Email/password sign-up is disabled in Firebase Authentication.',
};

function friendlyError(code: string): string {
  return FIREBASE_ERRORS[code] ?? `Request failed (${code || 'unknown'})`;
}

function timeoutErrorMessage(action: 'login' | 'register' | 'reset'): string {
  if (action === 'reset') return 'Reset email request timed out. Please try again.';
  return action === 'login'
    ? 'Login request timed out. Please try again.'
    : 'Registration request timed out. Please try again.';
}

async function withTimeout<T>(promise: Promise<T>, ms: number, action: 'login' | 'register' | 'reset'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutErrorMessage(action))), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function sendVerificationEmailIfNeeded(user: User): Promise<void> {
  if (!user.email) return;
  if (user.email.toLowerCase() === ADMIN_EMAIL) return;
  if (user.emailVerified) return;
  await sendEmailVerification(user);
}

async function bootstrapAdminIfNeeded(email: string, password: string): Promise<boolean> {
  const isAdminSeedCredential =
    email.toLowerCase() === ADMIN_EMAIL && password === ADMIN_PASSWORD;
  if (!isAdminSeedCredential) return false;
  const cred = await withTimeout(
    createUserWithEmailAndPassword(auth, email, password),
    15_000,
    'register',
  );
  await upsertUserProfileByUid({
    uid: cred.user.uid,
    email,
    role: 'admin' as UserRole,
  });
  return true;
}

export function AuthModal() {
  const [tab, setTab]             = useState<Tab>('login');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [countryCode, setCountryCode] = useState<CountryCode>('UK');
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [notice, setNotice]       = useState('');
  const [resetSent, setResetSent] = useState(false);

  const clearMessages = () => {
    setError('');
    setNotice('');
  };

  const finalizeRegisteredUser = async (params: {
    user: User;
    normalizedEmail: string;
    selectedCountryCode: CountryCode;
    clearPendingCountry: () => void;
    fromRecovery?: boolean;
  }): Promise<boolean> => {
    await upsertUserProfileByUid({
      uid: params.user.uid,
      email: params.normalizedEmail,
      countryCode: params.selectedCountryCode,
    });
    params.clearPendingCountry();
    if (params.normalizedEmail !== ADMIN_EMAIL) {
      const alreadyVerified = params.user.emailVerified;
      try {
        await sendVerificationEmailIfNeeded(params.user);
        setNotice(
          params.fromRecovery
            ? (
              alreadyVerified
                ? 'This email account already exists and is already verified. Please switch to Login and sign in.'
                : 'This email account already exists. We updated your profile and sent a verification email. Please verify your email before logging in.'
            )
            : 'Registration successful. Verification email sent. Please verify your email before logging in. Check your Spam/Junk folder if you cannot find it.',
        );
      } catch {
        setError(
          params.fromRecovery
            ? 'This email account already exists. Profile update succeeded, but we could not resend the verification email right now.'
            : 'Registration succeeded, but we could not send the verification email. Please try logging in later to resend.',
        );
      } finally {
        await signOut(auth);
      }
      setTab('login');
      setPassword('');
      setConfirm('');
      return true;
    }
    return false;
  };

  useEffect(() => {
    try {
      const msg = localStorage.getItem(authNoticeStorageKey);
      if (msg) {
        setNotice(msg);
        localStorage.removeItem(authNoticeStorageKey);
      }
    } catch {
      // ignore localStorage failures
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (tab === 'register' && password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    setLoading(true);
    try {
      if (tab === 'login') {
        try {
          await withTimeout(
            signInWithEmailAndPassword(auth, normalizedEmail, password),
            15_000,
            'login',
          );
        } catch (err) {
          const code = (err as { code?: string }).code ?? '';
          const isAdminSeedCredential =
            normalizedEmail === ADMIN_EMAIL && password === ADMIN_PASSWORD;
          // Firebase email-enumeration protection can return `invalid-credential`
          // even when the account doesn't exist yet, so we bootstrap on both.
          if (isAdminSeedCredential && (code === 'auth/user-not-found' || code === 'auth/invalid-credential')) {
            try {
              const bootstrapped = await bootstrapAdminIfNeeded(normalizedEmail, password);
              if (!bootstrapped) throw err;
            } catch (bootstrapErr) {
              const bootstrapCode = (bootstrapErr as { code?: string }).code ?? '';
              if (bootstrapCode === 'auth/email-already-in-use') {
                await withTimeout(
                  signInWithEmailAndPassword(auth, normalizedEmail, password),
                  15_000,
                  'login',
                );
              } else {
                throw bootstrapErr;
              }
            }
          } else {
            throw err;
          }
        }
        const signedUser = auth.currentUser;
        if (signedUser) {
          await signedUser.reload();
        }
        if (signedUser && signedUser.email?.toLowerCase() !== ADMIN_EMAIL && !signedUser.emailVerified) {
          try {
            await sendVerificationEmailIfNeeded(signedUser);
            setNotice('Email not verified yet. We have re-sent the verification email. Please verify your email before logging in. Check your Spam/Junk folder as well.');
          } catch {
            setError('Email not verified. Please verify your email before logging in. We could not resend the verification email right now.');
          } finally {
            await signOut(auth);
          }
          return;
        }
      } else {
        const pendingCountryKey = pendingCountryStorageKey(normalizedEmail);
        const clearPendingCountry = () => {
          try {
            localStorage.removeItem(pendingCountryKey);
          } catch {
            // ignore localStorage failures
          }
        };
        try {
          localStorage.setItem(pendingCountryKey, countryCode);
        } catch {
          // ignore localStorage failures
        }

        try {
          const cred = await withTimeout(
            createUserWithEmailAndPassword(auth, normalizedEmail, password),
            15_000,
            'register',
          );
          const shouldReturn = await finalizeRegisteredUser({
            user: cred.user,
            normalizedEmail,
            selectedCountryCode: countryCode,
            clearPendingCountry,
          });
          if (shouldReturn) return;
        } catch (registerErr) {
          const registerCode = (registerErr as { code?: string }).code ?? '';
          if (registerCode === 'auth/email-already-in-use') {
            try {
              const recoverCred = await withTimeout(
                signInWithEmailAndPassword(auth, normalizedEmail, password),
                15_000,
                'login',
              );
              const shouldReturn = await finalizeRegisteredUser({
                user: recoverCred.user,
                normalizedEmail,
                selectedCountryCode: countryCode,
                clearPendingCountry,
                fromRecovery: true,
              });
              if (shouldReturn) return;
            } catch (recoverErr) {
              clearPendingCountry();
              const recoverCode = (recoverErr as { code?: string }).code ?? '';
              if (
                recoverCode === 'auth/wrong-password'
                || recoverCode === 'auth/invalid-credential'
                || recoverCode === 'auth/invalid-login-credentials'
              ) {
                setTab('login');
                setConfirm('');
                setError('');
                setNotice('This email is already registered. Switched to Login. Please enter the existing password, or use reset email.');
                return;
              }
              throw recoverErr;
            }
          }
          clearPendingCountry();
          throw registerErr;
        }
      }
      // onAuthStateChanged in useFirestoreSync will handle the rest
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? '';
      setError(friendlyError(code));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!email.trim()) { setError('Please enter your email first.'); return; }
    setNotice('');
    setLoading(true);
    try {
      await withTimeout(
        sendPasswordResetEmail(auth, email.trim()),
        15_000,
        'reset',
      );
      setResetSent(true);
      setError('');
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? '';
      setError(friendlyError(code));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/40 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo + title */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="w-14 h-14 bg-white rounded-2xl shadow-md border border-slate-100 flex items-center justify-center">
            <img src="/logo.png" alt="RFT" className="w-9 h-9 object-contain" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-[#0052D9]">Right First Time</h1>
            <p className="text-xs text-slate-500 mt-0.5">TP-Link Amazon Content Management</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-slate-100">
            {(['login', 'register'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); clearMessages(); setResetSent(false); }}
                className={`flex-1 py-3.5 text-sm font-semibold transition ${
                  tab === t
                    ? 'text-[#0052D9] border-b-2 border-[#0052D9] bg-blue-50/30'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t === 'login' ? 'Login' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Email */}
            <div>
              <label className="block text-[12px] font-medium text-slate-600 mb-1.5">Email</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  autoFocus
                  required
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); }}
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:border-[#0052D9] focus:ring-1 focus:ring-[#0052D9] outline-none shadow-inner"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[12px] font-medium text-slate-600 mb-1.5">Password</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  minLength={6}
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); }}
                  className="w-full pl-9 pr-10 py-2.5 border border-slate-200 rounded-lg text-sm focus:border-[#0052D9] focus:ring-1 focus:ring-[#0052D9] outline-none shadow-inner"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Confirm password (register only) */}
            {tab === 'register' && (
              <>
                <div>
                  <label className="block text-[12px] font-medium text-slate-600 mb-1.5">Country Workspace</label>
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value as CountryCode)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:border-[#0052D9] focus:ring-1 focus:ring-[#0052D9] outline-none shadow-inner bg-white"
                  >
                    {REGISTER_COUNTRIES.map((code) => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-slate-600 mb-1.5">Confirm Password</label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPw ? 'text' : 'password'}
                      required
                      placeholder="Re-enter password"
                      value={confirm}
                      onChange={(e) => { setConfirm(e.target.value); }}
                      className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:border-[#0052D9] focus:ring-1 focus:ring-[#0052D9] outline-none shadow-inner"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 text-xs text-red-600">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            {notice && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 text-xs text-blue-700">
                {notice}
              </div>
            )}

            {/* Reset sent confirmation */}
            {resetSent && (
              <div className="bg-green-50 border border-green-100 rounded-lg px-3 py-2.5 text-xs text-green-600">
                Password reset email sent. Please check your inbox (and Spam/Junk).
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0052D9] hover:bg-blue-800 text-white py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition shadow-sm disabled:opacity-60 mt-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {tab === 'login' ? 'Login' : 'Create Account'}
            </button>

            {tab === 'register' && error.includes('already registered') && (
              <button
                type="button"
                onClick={() => {
                  setTab('login');
                  setConfirm('');
                  setError('');
                  setNotice('Switched to Login. Please enter your existing password, or use reset email.');
                }}
                className="w-full text-center text-xs text-slate-500 hover:text-[#0052D9] transition mt-1"
              >
                This email is already registered - switch to Login
              </button>
            )}

            {/* Forgot password */}
            {tab === 'login' && (
              <button
                type="button"
                onClick={handleReset}
                disabled={loading}
                className="w-full text-center text-xs text-slate-400 hover:text-[#0052D9] transition mt-1"
              >
                Forgot password? Send reset email
              </button>
            )}
          </form>
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-4">
          Account data is stored independently. By registering, you agree to the terms of service.
        </p>
      </div>
    </div>
  );
}
