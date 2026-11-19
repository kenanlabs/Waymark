import { useId, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
  User,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { loginAdminAccount, setupAdminAccount } from '../utils/auth';

interface AdminAuthScreenProps {
  initialized: boolean;
  onAuthenticated: (username: string) => void;
}

export function AdminAuthScreen({ initialized, onAuthenticated }: AdminAuthScreenProps) {
  const uid = useId();
  const [username, setUsername] = useState(initialized ? '' : 'admin');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [shakeTick, setShakeTick] = useState(0);

  const triggerError = (msg: string) => {
    setError(msg);
    setShakeTick((t) => t + 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUser = username.trim();
    if (trimmedUser.length < 2) {
      triggerError('请输入管理员账号（至少 2 个字符）。');
      return;
    }
    if (password.length < (initialized ? 1 : 6)) {
      triggerError(initialized ? '请输入管理员密码。' : '管理员密码至少需要 6 位字符。');
      return;
    }
    if (!initialized && password !== confirmPassword) {
      triggerError('两次输入的管理员密码不一致。');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const result = initialized
        ? await loginAdminAccount(trimmedUser, password)
        : await setupAdminAccount(trimmedUser, password);

      if (result.ok) {
        onAuthenticated(result.username || trimmedUser);
      } else {
        triggerError(result.message || '验证未通过，请重试。');
      }
    } catch {
      triggerError('无法连接认证服务，请确认后端服务正常运行。');
    } finally {
      setSubmitting(false);
    }
  };

  const passwordsMatch = !initialized && password.length >= 6 && password === confirmPassword;

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-4 py-10 bg-[#FAFAFA] dark:bg-[#09090B] text-[#09090B] dark:text-[#FAFAFA] overflow-hidden">
      {/* Subtle tone-coordinated ambient glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-36 left-1/2 -translate-x-1/2 w-[540px] h-[300px] rounded-full blur-3xl opacity-65 dark:opacity-35"
        style={{
          background:
            'radial-gradient(circle, var(--wm-select-bg) 0%, transparent 72%)',
        }}
      />

      <motion.div
        key={shakeTick}
        initial={shakeTick === 0 ? { opacity: 0, y: 12, scale: 0.985 } : { x: 0 }}
        animate={shakeTick === 0 ? { opacity: 1, y: 0, scale: 1 } : { x: [-6, 6, -4, 4, 0] }}
        transition={
          shakeTick === 0
            ? { duration: 0.24, ease: [0.16, 1, 0.3, 1] }
            : { duration: 0.32 }
        }
        className="relative z-10 w-full max-w-[400px] p-1.5 rounded-[22px] bg-[#F4F4F5]/75 dark:bg-[#16161A]/85 border border-[#E4E4E7]/90 dark:border-[#27272A] shadow-[0_20px_60px_rgba(0,0,0,0.06)] dark:shadow-[0_24px_64px_rgba(0,0,0,0.5)] backdrop-blur-md"
      >
        <div className="bg-white dark:bg-[#111113] border border-[#E4E4E7]/70 dark:border-[#27272A]/80 rounded-[17px] p-6 sm:p-7 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
          {/* Brand & Status Header */}
          <div className="flex items-center justify-between gap-3 pb-5 border-b border-[#F4F4F5] dark:border-[#1F1F23]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] flex items-center justify-center text-[#09090B] dark:text-[#FAFAFA] shadow-2xs shrink-0">
                <ShieldCheck className="w-4.5 h-4.5 text-[var(--wm-accent-ink)]" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-[16px] font-semibold tracking-tight text-[#09090B] dark:text-[#FAFAFA]">
                    Waymark
                  </span>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-[#F4F4F5] dark:bg-[#18181B] text-[#52525B] dark:text-[#A1A1AA] border border-[#E4E4E7]/80 dark:border-[#27272A]">
                    {initialized ? '管理控制台' : '首次配置'}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-[#71717A] dark:text-[#A1A1AA]">
                  {initialized ? '验证管理员身份以访问工作空间' : '创建管理员账号以保护站点与凭据'}
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor={`${uid}-username`}
                className="block text-xs font-medium text-[#27272A] dark:text-[#E4E4E7] mb-1.5"
              >
                管理员账号
              </label>
              <div className="relative">
                <User
                  className="w-3.5 h-3.5 text-[#A1A1AA] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id={`${uid}-username`}
                  type="text"
                  autoFocus
                  autoComplete="username"
                  spellCheck={false}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="请输入管理员账号（如 admin）"
                  className="w-full h-10 pl-9 pr-3 text-[13px] bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-xl focus:outline-none focus:border-[#09090B] dark:focus:border-[#FAFAFA] ring-inset focus:ring-1 focus:ring-[#09090B] dark:focus:ring-[#FAFAFA] transition-[border-color,box-shadow,background-color]"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor={`${uid}-password`}
                  className="block text-xs font-medium text-[#27272A] dark:text-[#E4E4E7]"
                >
                  管理员密码
                </label>
                {!initialized && (
                  <span className="text-[11px] text-[#A1A1AA]">不少于 6 位字符</span>
                )}
              </div>
              <div className="relative overflow-x-clip rounded-xl">
                <Lock
                  className="w-3.5 h-3.5 text-[#A1A1AA] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id={`${uid}-password`}
                  type={showPass ? 'text' : 'password'}
                  autoComplete={initialized ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={initialized ? '请输入登录密码' : '设置管理员登录密码'}
                  className="w-full h-10 pl-9 pr-9 text-[13px] bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-xl focus:outline-none focus:border-[#09090B] dark:focus:border-[#FAFAFA] ring-inset focus:ring-1 focus:ring-[#09090B] dark:focus:ring-[#FAFAFA] transition-[border-color,box-shadow,background-color]"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? '隐藏密码' : '显示密码'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#71717A] hover:text-[#09090B] dark:hover:text-white rounded-md transition-colors"
                >
                  {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {!initialized && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor={`${uid}-confirm`}
                    className="block text-xs font-medium text-[#27272A] dark:text-[#E4E4E7]"
                  >
                    确认管理员密码
                  </label>
                  {passwordsMatch && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-[#16A34A] dark:text-[#4ADE80]">
                      <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                      密码一致
                    </span>
                  )}
                </div>
                <div className="relative overflow-x-clip rounded-xl">
                  <KeyRound
                    className="w-3.5 h-3.5 text-[#A1A1AA] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id={`${uid}-confirm`}
                    type={showPass ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="再次输入管理员密码"
                    className="w-full h-10 pl-9 pr-3 text-[13px] bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-xl focus:outline-none focus:border-[#09090B] dark:focus:border-[#FAFAFA] ring-inset focus:ring-1 focus:ring-[#09090B] dark:focus:ring-[#FAFAFA] transition-[border-color,box-shadow,background-color]"
                  />
                </div>
              </div>
            )}

            <AnimatePresence>
              {error && (
                <motion.div
                  role="alert"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl bg-[#FEF2F2] dark:bg-[#2B1414] border border-[#FECACA] dark:border-[#7F1D1D] text-xs text-[#B91C1C] dark:text-[#FCA5A5]"
                >
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="pt-1">
              <motion.button
                type="submit"
                whileTap={{ scale: 0.985 }}
                disabled={submitting}
                className="group wm-btn-primary w-full h-10 inline-flex items-center justify-center gap-2 text-[13px] font-medium rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.6)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.06)] transition-all disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : null}
                <span>
                  {submitting
                    ? initialized
                      ? '正在验证身份...'
                      : '正在创建账户...'
                    : initialized
                    ? '登录管理控制台'
                    : '创建管理员并进入'}
                </span>
                {!submitting && (
                  <ArrowRight
                    className="w-3.5 h-3.5 text-[var(--wm-accent-ink)] transition-transform duration-150 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                )}
              </motion.button>
            </div>
          </form>
        </div>

        {/* Subtle card footer caption */}
        <div className="px-3.5 pt-2.5 pb-1 flex items-center justify-between text-[11px] text-[#71717A] dark:text-[#A1A1AA]">
          <span>多工作空间站点导航与自动填充</span>
          <span className="font-mono text-[10px] opacity-80">Waymark</span>
        </div>
      </motion.div>
    </div>
  );
}
