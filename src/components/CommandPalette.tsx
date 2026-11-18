import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Command, Moon, Plus, Search, Shield, Sun, Upload, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { NavSection, PanelNode, Workspace } from '../types/panel';
import { buildBridgeLaunchUrl, buildPanelTargetUrl } from '../utils/userscript';

interface CommandPaletteProps {
  open: boolean;
  nodes: PanelNode[];
  workspaces: Workspace[];
  theme: 'light' | 'dark';
  onClose: () => void;
  onLaunch: (node: PanelNode) => void;
  onAddNew: () => void;
  onOpenBatchImport: () => void;
  onNavigate: (section: NavSection) => void;
  onToggleTheme: () => void;
}

export function CommandPalette({
  open,
  nodes,
  workspaces,
  theme,
  onClose,
  onLaunch,
  onAddNew,
  onOpenBatchImport,
  onNavigate,
  onToggleTheme,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const workspaceMap = useMemo(() => {
    const map = new Map<string, Workspace>();
    for (const ws of workspaces) map.set(ws.id, ws);
    return map;
  }, [workspaces]);

  const matchedNodes = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...nodes].sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      return (b.lastAccessedAt || '').localeCompare(a.lastAccessedAt || '');
    });
    if (!q) return sorted.slice(0, 8);
    return sorted
      .filter((n) => {
        const wsName = workspaceMap.get(n.workspaceId || '')?.name || '';
        return (
          n.name.toLowerCase().includes(q) ||
          n.baseUrl.toLowerCase().includes(q) ||
          n.entrance.toLowerCase().includes(q) ||
          n.group.toLowerCase().includes(q) ||
          wsName.toLowerCase().includes(q) ||
          n.provider.toLowerCase().includes(q) ||
          n.region.toLowerCase().includes(q)
        );
      })
      .slice(0, 12);
  }, [nodes, query, workspaceMap]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (matchedNodes.length > 0) {
        setActiveIndex((prev) => (prev + 1) % matchedNodes.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (matchedNodes.length > 0) {
        setActiveIndex((prev) => (prev - 1 + matchedNodes.length) % matchedNodes.length);
      }
    } else if (e.key === 'Enter') {
      const selected = matchedNodes[activeIndex];
      if (selected) {
        e.preventDefault();
        anchorRefs.current[selected.id]?.click();
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-black/40 backdrop-blur-[2px]"
          onKeyDown={handleKeyDown}
        >
          <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="快速跳转与快捷指令"
            initial={{ opacity: 0, y: -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-xl bg-white dark:bg-[#111113] border border-black/[0.1] dark:border-white/[0.12] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.16)] overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 h-12 border-b border-black/[0.06] dark:border-white/[0.08]">
              <Search className="w-4 h-4 text-[#71717A] shrink-0" aria-hidden="true" />
              <label htmlFor="cmd-palette-input" className="sr-only">
                跨工作空间搜索站点或执行快捷操作
              </label>
              <input
                id="cmd-palette-input"
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                spellCheck={false}
                placeholder="跨工作空间搜索名称、地址、空间或分组，Enter 直接打开..."
                className="flex-1 bg-transparent text-sm text-[#09090B] dark:text-[#FAFAFA] placeholder:text-[#A1A1AA] focus:outline-none"
              />
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭搜索框"
                className="p-1 text-[#71717A] hover:text-[#09090B] dark:hover:text-white rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-[52vh] overflow-y-auto overscroll-contain p-2 space-y-1">
              {matchedNodes.length > 0 ? (
                <div>
                  <div className="px-2.5 py-1.5 text-[11px] font-medium text-[#71717A]">
                    一键直达
                  </div>
                  {matchedNodes.map((node, idx) => {
                    const isActive = idx === activeIndex;
                    const ws = node.workspaceId ? workspaceMap.get(node.workspaceId) : undefined;
                    const metaLabel = [ws?.name, node.group].filter(Boolean).join(' · ');
                    return (
                      <a
                        key={node.id}
                        ref={(el) => {
                          anchorRefs.current[node.id] = el;
                        }}
                        href={buildBridgeLaunchUrl(node, ws?.panelType)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => {
                          onLaunch(node);
                          onClose();
                        }}
                        className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg transition-colors duration-100 focus-visible:outline-none ${
                          isActive
                            ? 'bg-[#F4F4F5] dark:bg-[#1C1C1F] text-[#09090B] dark:text-white'
                            : 'text-[#52525B] dark:text-[#A1A1AA]'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-[#09090B] dark:text-white truncate">
                              {node.name}
                            </span>
                            <span className="text-xs text-[#71717A] truncate">
                              {metaLabel}
                            </span>
                          </div>
                          <div className="font-mono text-[11px] text-[#71717A] truncate mt-0.5">
                            {buildPanelTargetUrl(node)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs font-medium text-[#09090B] dark:text-white shrink-0">
                          <span>
                            {!node.username && !node.password
                              ? '打开访问'
                              : node.autoSubmit
                              ? '一键登录'
                              : '填充打开'}
                          </span>
                          <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                        </div>
                      </a>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-[#71717A]">
                  {nodes.length === 0 ? '尚未添加任何站点' : '没有匹配该关键词的站点'}
                </div>
              )}

              <div className="pt-2 mt-2 border-t border-black/[0.06] dark:border-white/[0.08]">
                <div className="px-2.5 py-1.5 text-[11px] font-medium text-[#71717A]">
                  快捷操作
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onAddNew();
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-left text-[#3F3F46] dark:text-[#D4D4D8] hover:bg-[#F4F4F5] dark:hover:bg-[#1C1C1F] rounded-lg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#71717A]" aria-hidden="true" />
                    <span>添加站点</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenBatchImport();
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-left text-[#3F3F46] dark:text-[#D4D4D8] hover:bg-[#F4F4F5] dark:hover:bg-[#1C1C1F] rounded-lg transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#71717A]" aria-hidden="true" />
                    <span>批量导入站点</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigate('bridge');
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-left text-[#3F3F46] dark:text-[#D4D4D8] hover:bg-[#F4F4F5] dark:hover:bg-[#1C1C1F] rounded-lg transition-colors"
                  >
                    <Command className="w-3.5 h-3.5 text-[#71717A]" aria-hidden="true" />
                    <span>自动登录脚本设置</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onToggleTheme();
                      onClose();
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-left text-[#3F3F46] dark:text-[#D4D4D8] hover:bg-[#F4F4F5] dark:hover:bg-[#1C1C1F] rounded-lg transition-colors"
                  >
                    {theme === 'light' ? (
                      <Moon className="w-3.5 h-3.5 text-[#71717A]" aria-hidden="true" />
                    ) : (
                      <Sun className="w-3.5 h-3.5 text-[#71717A]" aria-hidden="true" />
                    )}
                    <span>{theme === 'light' ? '切换深色外观' : '切换浅色外观'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigate('security');
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-left text-[#3F3F46] dark:text-[#D4D4D8] hover:bg-[#F4F4F5] dark:hover:bg-[#1C1C1F] rounded-lg transition-colors col-span-2"
                  >
                    <Shield className="w-3.5 h-3.5 text-[#71717A]" aria-hidden="true" />
                    <span>管理员安全与数据备份</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="px-4 py-2 border-t border-black/[0.06] dark:border-white/[0.08] bg-[#FAFAFA] dark:bg-[#0D0D0F] flex items-center justify-between text-[11px] text-[#71717A]">
              <div className="flex items-center gap-3">
                <span>↑↓ 选择</span>
                <span>Enter 打开目标</span>
              </div>
              <span>Esc 关闭</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
