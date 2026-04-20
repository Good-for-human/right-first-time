import { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Loader2, Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';

type Tab = 'login' | 'register';

const FIREBASE_ERRORS: Record<string, string> = {
  'auth/user-not-found':       '该邮箱尚未注册',
  'auth/wrong-password':       '密码错误，请重试',
  'auth/email-already-in-use': '该邮箱已被注册',
  'auth/invalid-email':        '邮箱格式不正确',
  'auth/weak-password':        '密码至少需要 6 位',
  'auth/too-many-requests':    '登录尝试过多，请稍后再试',
  'auth/network-request-failed': '网络错误，请检查网络连接',
  'auth/invalid-credential':   '邮箱或密码错误',
};

function friendlyError(code: string): string {
  return FIREBASE_ERRORS[code] ?? `登录失败 (${code})`;
}

export function AuthModal() {
  const [tab, setTab]             = useState<Tab>('login');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [resetSent, setResetSent] = useState(false);

  const clearError = () => setError('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (tab === 'register' && password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      if (tab === 'login') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
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
    if (!email.trim()) { setError('请先输入邮箱地址'); return; }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
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
            <p className="text-xs text-slate-500 mt-0.5">TP-Link 亚马逊内容管理平台</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-slate-100">
            {(['login', 'register'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); clearError(); setResetSent(false); }}
                className={`flex-1 py-3.5 text-sm font-semibold transition ${
                  tab === t
                    ? 'text-[#0052D9] border-b-2 border-[#0052D9] bg-blue-50/30'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t === 'login' ? '登录' : '注册'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Email */}
            <div>
              <label className="block text-[12px] font-medium text-slate-600 mb-1.5">邮箱</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  autoFocus
                  required
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); clearError(); }}
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:border-[#0052D9] focus:ring-1 focus:ring-[#0052D9] outline-none shadow-inner"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[12px] font-medium text-slate-600 mb-1.5">密码</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  minLength={6}
                  placeholder="至少 6 位"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearError(); }}
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
              <div>
                <label className="block text-[12px] font-medium text-slate-600 mb-1.5">确认密码</label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPw ? 'text' : 'password'}
                    required
                    placeholder="再次输入密码"
                    value={confirm}
                    onChange={(e) => { setConfirm(e.target.value); clearError(); }}
                    className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:border-[#0052D9] focus:ring-1 focus:ring-[#0052D9] outline-none shadow-inner"
                  />
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 text-xs text-red-600">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            {/* Reset sent confirmation */}
            {resetSent && (
              <div className="bg-green-50 border border-green-100 rounded-lg px-3 py-2.5 text-xs text-green-600">
                重置密码邮件已发送，请查收邮箱。
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0052D9] hover:bg-blue-800 text-white py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition shadow-sm disabled:opacity-60 mt-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {tab === 'login' ? '登录' : '创建账号'}
            </button>

            {/* Forgot password */}
            {tab === 'login' && (
              <button
                type="button"
                onClick={handleReset}
                disabled={loading}
                className="w-full text-center text-xs text-slate-400 hover:text-[#0052D9] transition mt-1"
              >
                忘记密码？发送重置邮件
              </button>
            )}
          </form>
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-4">
          每个账户的数据独立存储，注册即同意服务条款。
        </p>
      </div>
    </div>
  );
}
