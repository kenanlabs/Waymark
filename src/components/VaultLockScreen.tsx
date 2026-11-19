import { useId, useState } from 'react';
import { AlertCircle, ArrowRight, KeyRound, Loader2, Lock } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

interface VaultLockScreenProps {
  onUnlock: (passphrase: string) => Promise<boolean>;
}

export function VaultLockScreen({ onUnlock }: VaultLockScreenProps) {
  const inputId = useId();
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [shakeTick, setShakeTick] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase) {
      setError('请输入解锁主密码。');
      setShakeTick((t) => t + 1);
      return;
    }
    setSubmitting(true);
    setError('');
    const ok = await onUnlock(passphrase);
    if (!ok) {
      setError('主密码不正确，无法解密本地保险库，请核对后重试。');
      setShakeTick((t) => t + 1);
    }
    setSubmitting(false);
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-4 py-10 bg-[#FAFAFA] dark:bg-[#09090B] text-[#09090B] dark:text-[#FAFAFA] overflow-hidden">
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
          <div className="flex items-center gap-3 pb-5 border-b border-[#F4F4F5] dark:border-[#1F1F23]">
            <div className="w-10 h-10 rounded-xl bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] flex items-center justify-center text-[#09090B] dark:text-[#FAFAFA] shadow-2xs shrink-0">
              <Lock className="w-4 h-4 text-[var(--wm-accent-ink)]" aria-hidden="true" />
            </div>
            <div>
              <h1 className="font-display text-[16px] font-semibold tracking-tight text-[#09090B] dark:text-[#FAFAFA]">
                Waymark 凭据锁已启用
              </h1>
              <p className="mt-0.5 text-[11px] text-[#71717A] dark:text-[#A1A1AA]">
                本地凭据受 AES-256-GCM 加密保护，请输入主密码解锁
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor={inputId}
                className="block text-xs font-medium text-[#27272A] dark:text-[#E4E4E7] mb-1.5"
              >
                二次加密主密码
              </label>
              <div className="relative overflow-x-clip rounded-xl">
                <KeyRound
                  className="w-3.5 h-3.5 text-[#A1A1AA] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id={inputId}
                  type="password"
                  autoFocus
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="请输入主密码解锁"
                  className="w-full h-10 pl-9 pr-3 text-[13px] bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-xl focus:outline-none focus:border-[#09090B] dark:focus:border-[#FAFAFA] ring-inset focus:ring-1 focus:ring-[#09090B] dark:focus:ring-[#FAFAFA] transition-[border-color,box-shadow,background-color]"
                />
              </div>
            </div>

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

            <motion.button
              type="submit"
              whileTap={{ scale: 0.985 }}
              disabled={submitting}
              className="group wm-btn-primary w-full h-10 inline-flex items-center justify-center gap-2 text-[13px] font-medium rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.6)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.06)] transition-all disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              <span>{submitting ? '正在解密...' : '解锁进入'}</span>
              {!submitting && (
                <ArrowRight
                  className="w-3.5 h-3.5 text-[var(--wm-accent-ink)] transition-transform duration-150 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              )}
            </motion.button>
          </form>
        </div>

        <div className="px-3.5 pt-2.5 pb-1 flex items-center justify-between text-[11px] text-[#71717A] dark:text-[#A1A1AA]">
          <span>AES-256-GCM 本地保险库保护</span>
          <span className="font-mono text-[10px] opacity-80">Waymark</span>
        </div>
      </motion.div>
    </div>
  );
}
