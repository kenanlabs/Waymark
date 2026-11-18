import { useId, useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
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
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#FAFAFA] dark:bg-[#09090B]">
      <motion.div
        key={shakeTick}
        initial={shakeTick === 0 ? { opacity: 0, y: 12, scale: 0.98 } : { x: 0 }}
        animate={shakeTick === 0 ? { opacity: 1, y: 0, scale: 1 } : { x: [-6, 6, -4, 4, 0] }}
        transition={
          shakeTick === 0
            ? { duration: 0.24, ease: [0.16, 1, 0.3, 1] }
            : { duration: 0.32 }
        }
        className="w-full max-w-sm bg-white dark:bg-[#111113] border border-black/[0.08] dark:border-white/[0.1] rounded-xl p-7 shadow-[0_8px_30px_rgba(0,0,0,0.06)]"
      >
        <div className="flex items-center gap-2.5 text-[#09090B] dark:text-[#FAFAFA]">
          <Lock className="w-4 h-4" aria-hidden="true" />
          <h1 className="font-display text-base font-semibold">Waymark 保险库已锁定</h1>
        </div>
        <p className="mt-2 text-xs text-[#71717A] dark:text-[#A1A1AA] leading-relaxed">
          本地凭据受 AES-256-GCM 加密保护。请输入主密码解锁进入。
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <div>
            <label htmlFor={inputId} className="sr-only">
              保险库主密码
            </label>
            <input
              id={inputId}
              type="password"
              autoFocus
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="输入主密码"
              className="w-full px-3 py-2 text-sm bg-[#FAFAFA] dark:bg-[#18181B] border border-black/[0.1] dark:border-white/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#09090B] dark:focus:ring-white transition-shadow"
            />
          </div>
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
            className="w-full inline-flex items-center justify-center gap-2 py-2 text-xs font-medium text-white bg-[#09090B] hover:bg-[#27272A] dark:bg-[#FAFAFA] dark:text-[#09090B] rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
            <span>{submitting ? '正在解密...' : '解锁进入'}</span>
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}
