import { AlertTriangle, LogOut, Moon, Plus, Search, SlidersHorizontal, Sun } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Tooltip } from './Tooltip';

interface TopBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onOpenBridge?: () => void;
  bridgeStatus?: 'ok' | 'stale';
  bridgeVersion?: string | null;
  bridgeMode?: 'extension' | 'userscript';
  onAddNew: () => void;
  adminUsername?: string;
  onLogout: () => void;
}

export function TopBar({
  searchQuery,
  onSearchChange,
  searchInputRef,
  theme,
  onToggleTheme,
  onOpenSettings,
  onOpenBridge,
  bridgeStatus,
  bridgeVersion,
  bridgeMode = 'userscript',
  onAddNew,
  adminUsername,
  onLogout,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 h-14 bg-white/85 dark:bg-[#09090B]/85 backdrop-blur-md border-b border-[#E4E4E7] dark:border-[#27272A]">
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 h-full flex items-center justify-between gap-4 sm:gap-8">
        {/* Zone 1: Clean wordmark */}
        <span className="font-display text-[15px] font-semibold tracking-[-0.02em] text-[#09090B] dark:text-[#FAFAFA] whitespace-nowrap shrink-0 select-none">
          Waymark
        </span>

        {/* Zone 2: Minimal Spotlight Search */}
        <div className="relative flex-1 max-w-sm">
          <label htmlFor="topbar-search" className="sr-only">
            搜索站点
          </label>
          <Search
            className="w-3.5 h-3.5 text-[#A1A1AA] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="topbar-search"
            ref={searchInputRef}
            type="text"
            spellCheck={false}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索名称、地址或分组..."
            className="w-full h-8 pl-8 pr-11 text-[13px] bg-[#F4F4F5]/80 dark:bg-[#18181B] border border-transparent focus:border-[#09090B] dark:focus:border-[#FAFAFA] ring-inset focus:ring-1 focus:ring-[#09090B] dark:focus:ring-[#FAFAFA] focus:bg-white dark:focus:bg-[#111113] rounded-lg transition-all duration-150 focus:outline-none"
          />
          <kbd className="hidden sm:inline-block absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-[#27272A] text-[#71717A] border border-[#E4E4E7] dark:border-[#3F3F46]">
            ⌘K
          </kbd>
        </div>

        {/* Zone 3: Compact utility & primary action */}
        <div className="flex items-center gap-1.5 shrink-0">
          {bridgeStatus === 'stale' && (
            <Tooltip
              side="bottom"
              content={`检测到${bridgeMode === 'extension' ? '插件' : '脚本'} v${bridgeVersion || '未知'}，请更新至最新版本`}
            >
              <button
                type="button"
                onClick={onOpenBridge}
                className="h-8 inline-flex items-center gap-1 px-2 text-[11px] font-medium text-[#B45309] dark:text-[#FCD34D] bg-[#FFFBEB] dark:bg-[#271C0B] border border-[#FDE68A] dark:border-[#78350F] rounded-lg hover:bg-[#FEF3C7] dark:hover:bg-[#2D210E] transition-colors whitespace-nowrap shrink-0"
              >
                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">{bridgeMode === 'extension' ? '插件需更新' : '脚本需刷新'}</span>
              </button>
            </Tooltip>
          )}

          <Tooltip side="bottom" content="外观与背景 · 浏览器插件 · 批量导入 · 备份">
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={onOpenSettings}
              aria-label="系统设置"
              className="h-8 w-8 inline-flex items-center justify-center text-[#52525B] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-white hover:bg-[#F4F4F5] dark:hover:bg-[#18181B] rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-white"
            >
              <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
            </motion.button>
          </Tooltip>

          <Tooltip side="bottom" content={theme === 'light' ? '深色模式' : '浅色模式'}>
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={onToggleTheme}
              aria-label={theme === 'light' ? '切换深色模式' : '切换浅色模式'}
              className="h-8 w-8 inline-flex items-center justify-center text-[#52525B] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-white hover:bg-[#F4F4F5] dark:hover:bg-[#18181B] rounded-lg transition-colors overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-white"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={theme}
                  initial={{ opacity: 0, rotate: -30, scale: 0.8 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, rotate: 30, scale: 0.8 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="inline-flex items-center justify-center"
                >
                  {theme === 'light' ? (
                    <Moon className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Sun className="w-4 h-4" aria-hidden="true" />
                  )}
                </motion.span>
              </AnimatePresence>
            </motion.button>
          </Tooltip>

          <Tooltip
            side="bottom"
            content={adminUsername ? `退出管理员 (${adminUsername})` : '退出管理员登录'}
          >
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={onLogout}
              aria-label="退出管理员登录"
              className="h-8 w-8 inline-flex items-center justify-center text-[#52525B] dark:text-[#A1A1AA] hover:text-[#DC2626] dark:hover:text-[#F87171] hover:bg-[#F4F4F5] dark:hover:bg-[#18181B] rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-white"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
            </motion.button>
          </Tooltip>

          <Tooltip side="bottom" content="添加站点">
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={onAddNew}
              aria-label="添加站点"
              className="h-8 w-8 inline-flex items-center justify-center text-[#09090B] dark:text-[#FAFAFA] bg-[#F4F4F5] dark:bg-[#18181B] hover:bg-[#E4E4E7]/75 dark:hover:bg-[#27272A] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-white"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
            </motion.button>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}
