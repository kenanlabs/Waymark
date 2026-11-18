import { useId, useState } from 'react';
import { Eye, EyeOff, Loader2, Shield } from 'lucide-react';
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

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#FAFAFA] dark:bg-[#09090B] text-[#09090B] dark:text-[#FAFAFA]">
      <motion.div
        key={shakeTick}
        initial={shakeTick === 0 ? { opacity: 0, y: 12, scale: 0.98 } : { x: 0 }}
        animate={shakeTick === 0 ? { opacity: 1, y: 0, scale: 1 } : { x: [-6, 6, -4, 4, 0] }}
        transition={
          shakeTick === 0
            ? { duration: 0.24, ease: [0.16, 1, 0.3, 1] }
            : { duration: 0.32 }
        }
        className="w-full max-w-sm bg-white dark:bg-[#111113] border border-[#E4E4E7] dark:border-[#27272A] rounded-2xl p-7 shadow-[0_12px_40px_rgba(0,0,0,0.06)] dark:shadow-[0_16px_44px_rgba(0,0,0,0.45)]"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#F4F4F5] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] flex items-center justify-center text-[#09090B] dark:text-[#FAFAFA]">
            <Shield className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-display text-[15px] font-semibold tracking-tight">
              {initialized ? 'Waymark 管理员登录' : '初始化管理员账户'}
            </h1>
            {!initialized && (
              <p className="text-[11px] text-[#71717A] dark:text-[#A1A1AA]">
                首次使用请设置管理员账号与密码
              </p>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3.5">
          <div>
            <label
              htmlFor={`${uid}-username`}
              className="block text-xs font-medium text-[#27272A] dark:text-[#E4E4E7] mb-1.5"
            >
              管理员账号
            </label>
            <input
              id={`${uid}-username`}
              type="text"
              autoFocus
              autoComplete="username"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              className="w-full h-9 px-3 text-[13px] bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#09090B] dark:focus:ring-white transition-shadow"
            />
          </div>

          <div>
            <label
              htmlFor={`${uid}-password`}
              className="block text-xs font-medium text-[#27272A] dark:text-[#E4E4E7] mb-1.5"
            >
              管理员密码
            </label>
            <div className="relative">
              <input
                id={`${uid}-password`}
                type={showPass ? 'text' : 'password'}
                autoComplete={initialized ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={initialized ? '输入管理员密码' : '设置不少于 6 位密码'}
                className="w-full h-9 pl-3 pr-9 text-[13px] bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#09090B] dark:focus:ring-white transition-shadow"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? '隐藏密码' : '显示密码'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#71717A] hover:text-[#09090B] dark:hover:text-white rounded"
              >
                {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {!initialized && (
            <div>
              <label
                htmlFor={`${uid}-confirm`}
                className="block text-xs font-medium text-[#27272A] dark:text-[#E4E4E7] mb-1.5"
              >
                确认管理员密码
              </label>
              <input
                id={`${uid}-confirm`}
                type={showPass ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入密码"
                className="w-full h-9 px-3 text-[13px] bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#09090B] dark:focus:ring-white transition-shadow"
              />
            </div>
          )}

          <AnimatePresence>
            {error && (
              <motion.p
                role="alert"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="text-xs text-[#DC2626] dark:text-[#F87171]"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <motion.button
            type="submit"
            whileTap={{ scale: 0.98 }}
            disabled={submitting}
            className="w-full h-9 inline-flex items-center justify-center gap-2 text-xs font-medium text-white bg-[#09090B] hover:bg-[#27272A] dark:bg-[#FAFAFA] dark:text-[#09090B] dark:hover:bg-[#E4E4E7] rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition-colors disabled:opacity-50"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
            <span>
              {submitting
                ? initialized
                  ? '正在验证...'
                  : '正在初始化...'
                : initialized
                ? '管理员登录'
                : '创建管理员并进入'}
            </span>
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}
