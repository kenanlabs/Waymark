import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Copy,
  Globe,
  LayoutGrid,
  List,
  Moon,
  Search,
  Sun,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Tooltip } from './Tooltip';
import type { PublicWorkspaceViewData, ViewMode } from '../types/panel';
import { copyTextToClipboard } from '../utils/crypto';
import { resolveNodeCustomEntries } from '../utils/workspacePresets';

interface PublicWorkspaceViewProps {
  loading: boolean;
  workspace: PublicWorkspaceViewData | null;
  errorMessage?: string;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

function formatHostDisplay(targetUrl: string): string {
  try {
    const u = new URL(targetUrl);
    return u.pathname && u.pathname !== '/' ? `${u.host}${u.pathname}` : u.host;
  } catch {
    return targetUrl.replace(/^https?:\/\//i, '');
  }
}

const PUBLIC_VIEW_MODE_KEY = 'waymark_public_view_mode_v1';

export function PublicWorkspaceView({
  loading,
  workspace,
  errorMessage,
  theme,
  onToggleTheme,
}: PublicWorkspaceViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'grid';
    try {
      const saved = localStorage.getItem(PUBLIC_VIEW_MODE_KEY);
      return saved === 'table' ? 'table' : 'grid';
    } catch {
      return 'grid';
    }
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(PUBLIC_VIEW_MODE_KEY, viewMode);
    } catch {
      // Ignore storage errors
    }
  }, [viewMode]);

  const groupCounts = useMemo(() => {
    if (!workspace) return [];
    const map = new Map<string, number>();
    for (const node of workspace.nodes) {
      const g = node.group || '默认分组';
      map.set(g, (map.get(g) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [workspace]);

  const filteredNodes = useMemo(() => {
    if (!workspace) return [];
    const q = searchQuery.trim().toLowerCase();
    return [...workspace.nodes]
      .filter((n) => {
        if (selectedGroup !== 'all' && (n.group || '默认分组') !== selectedGroup) return false;
        if (!q) return true;
        const customMatch = Object.values(n.customValues || {}).some((val) =>
          (val || '').toLowerCase().includes(q)
        );
        return (
          n.name.toLowerCase().includes(q) ||
          n.targetUrl.toLowerCase().includes(q) ||
          n.group.toLowerCase().includes(q) ||
          customMatch
        );
      })
      .sort((a, b) => {
        if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
        return 0;
      });
  }, [workspace, searchQuery, selectedGroup]);

  const handleCopyUrl = async (id: string, url: string) => {
    const ok = await copyTextToClipboard(url);
    if (ok) {
      setCopiedId(id);
      window.setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 1400);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] dark:bg-[#09090B] text-[#71717A]">
        <span className="text-xs">正在加载工作空间...</span>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[#FAFAFA] dark:bg-[#09090B] text-[#09090B] dark:text-[#FAFAFA]">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-sm bg-white dark:bg-[#111113] border border-[#E4E4E7] dark:border-[#27272A] rounded-2xl p-7 text-center"
        >
          <div className="w-10 h-10 mx-auto rounded-xl bg-[#F4F4F5] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] flex items-center justify-center text-[#71717A]">
            <Globe className="w-4 h-4" aria-hidden="true" />
          </div>
          <h1 className="mt-4 font-display text-[15px] font-semibold">
            {errorMessage || '未找到该公开工作空间'}
          </h1>
          <p className="mt-1.5 text-xs text-[#71717A] dark:text-[#A1A1AA] leading-relaxed">
            请确认访问路径是否正确，或联系管理员确认该空间已启用公开访问。
          </p>
          <a
            href="/"
            className="mt-5 inline-flex items-center gap-1.5 h-8 px-3.5 text-xs font-medium text-white bg-[#09090B] hover:bg-[#27272A] dark:bg-[#FAFAFA] dark:text-[#09090B] rounded-lg transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>返回首页</span>
          </a>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col text-[#09090B] dark:text-[#FAFAFA]">
      <header className="sticky top-0 z-30 h-14 bg-white/85 dark:bg-[#09090B]/85 backdrop-blur-md border-b border-[#E4E4E7] dark:border-[#27272A]">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 h-full flex items-center justify-between gap-4 sm:gap-8">
          <span className="font-display text-[15px] font-semibold tracking-[-0.02em] text-[#09090B] dark:text-[#FAFAFA] whitespace-nowrap shrink-0 truncate max-w-[180px] sm:max-w-xs">
            {workspace.name}
          </span>

          <div className="relative flex-1 max-w-sm">
            <label htmlFor="public-search" className="sr-only">
              搜索站点
            </label>
            <Search
              className="w-3.5 h-3.5 text-[#A1A1AA] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="public-search"
              type="text"
              spellCheck={false}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索名称、地址或分组..."
              className="w-full h-8 pl-8 pr-3 text-[13px] bg-[#F4F4F5]/80 dark:bg-[#18181B] border border-transparent focus:border-[#09090B] dark:focus:border-[#FAFAFA] ring-inset focus:ring-1 focus:ring-[#09090B] dark:focus:ring-[#FAFAFA] focus:bg-white dark:focus:bg-[#111113] rounded-lg transition-all duration-150 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Tooltip side="bottom" content={theme === 'light' ? '深色模式' : '浅色模式'}>
              <motion.button
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={onToggleTheme}
                aria-label={theme === 'light' ? '切换深色模式' : '切换浅色模式'}
                className="h-8 w-8 inline-flex items-center justify-center text-[#52525B] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-white hover:bg-[#F4F4F5] dark:hover:bg-[#18181B] rounded-lg transition-colors"
              >
                {theme === 'light' ? (
                  <Moon className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Sun className="w-4 h-4" aria-hidden="true" />
                )}
              </motion.button>
            </Tooltip>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1240px] mx-auto px-4 sm:px-6 py-7 space-y-6">
        {workspace.description && (
          <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] max-w-3xl leading-relaxed">
            {workspace.description}
          </p>
        )}

        {workspace.nodes.length === 0 ? (
          <div className="py-20 text-center text-xs text-[#71717A]">
            该公开工作空间暂无可访问的站点
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#E4E4E7] dark:border-[#27272A]">
              <div className="flex items-center gap-6 overflow-x-auto no-scrollbar" role="tablist" aria-label="公开分组筛选">
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedGroup === 'all'}
                  onClick={() => setSelectedGroup('all')}
                  className={`relative pb-3 text-[13px] font-medium transition-colors whitespace-nowrap ${
                    selectedGroup === 'all'
                      ? 'text-[#09090B] dark:text-[#FAFAFA]'
                      : 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#FAFAFA]'
                  }`}
                >
                  <span>全部</span>
                  <span className="ml-1.5 font-mono text-[11px] tabular-nums text-[#A1A1AA] dark:text-[#71717A]">
                    {workspace.nodes.length}
                  </span>
                  {selectedGroup === 'all' && (
                    <motion.span
                      layoutId="public-group-underline"
                      transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                      className="absolute inset-x-0 bottom-0 h-[2px] bg-[#09090B] dark:bg-[#FAFAFA]"
                    />
                  )}
                </button>

                {groupCounts.map((grp) => {
                  const active = selectedGroup === grp.name;
                  return (
                    <button
                      key={grp.name}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setSelectedGroup(grp.name)}
                      className={`relative pb-3 text-[13px] font-medium transition-colors whitespace-nowrap ${
                        active
                          ? 'text-[#09090B] dark:text-[#FAFAFA]'
                          : 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#FAFAFA]'
                      }`}
                    >
                      <span>{grp.name}</span>
                      <span className="ml-1.5 font-mono text-[11px] tabular-nums text-[#A1A1AA] dark:text-[#71717A]">
                        {grp.count}
                      </span>
                      {active && (
                        <motion.span
                          layoutId="public-group-underline"
                          transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                          className="absolute inset-x-0 bottom-0 h-[2px] bg-[#09090B] dark:bg-[#FAFAFA]"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 pb-2">
                <div className="inline-flex h-8 p-0.5 bg-[#F4F4F5] dark:bg-[#18181B] rounded-lg border border-[#E4E4E7] dark:border-[#27272A]">
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    aria-label="卡片模式"
                    className={`relative inline-flex items-center gap-1.5 px-2.5 text-[12px] font-medium rounded-md transition-colors whitespace-nowrap ${
                      viewMode === 'grid'
                        ? 'text-[#09090B] dark:text-white'
                        : 'text-[#71717A] hover:text-[#09090B] dark:hover:text-white'
                    }`}
                  >
                    {viewMode === 'grid' && (
                      <motion.span
                        layoutId="public-view-pill"
                        transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                        className="absolute inset-0 bg-white dark:bg-[#27272A] rounded-md shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                      />
                    )}
                    <LayoutGrid className="relative z-10 w-3.5 h-3.5" aria-hidden="true" />
                    <span className="relative z-10">卡片</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    aria-label="详细模式"
                    className={`relative inline-flex items-center gap-1.5 px-2.5 text-[12px] font-medium rounded-md transition-colors whitespace-nowrap ${
                      viewMode === 'table'
                        ? 'text-[#09090B] dark:text-white'
                        : 'text-[#71717A] hover:text-[#09090B] dark:hover:text-white'
                    }`}
                  >
                    {viewMode === 'table' && (
                      <motion.span
                        layoutId="public-view-pill"
                        transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                        className="absolute inset-0 bg-white dark:bg-[#27272A] rounded-md shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                      />
                    )}
                    <List className="relative z-10 w-3.5 h-3.5" aria-hidden="true" />
                    <span className="relative z-10">详细</span>
                  </button>
                </div>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {filteredNodes.length === 0 ? (
                <motion.div
                  key="public-empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="py-16 text-center text-xs text-[#71717A]"
                >
                  未找到匹配的站点
                </motion.div>
              ) : viewMode === 'grid' ? (
                <motion.div
                  key="public-grid"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5"
                >
                  {filteredNodes.map((node, idx) => {
                    const entries = resolveNodeCustomEntries(node, workspace.customFields);
                    const topEntries = entries.filter((e) => e.placement === 'card_top');
                    const bottomEntries = entries.filter((e) => e.placement === 'card_bottom');
                    const subtitle = [node.group || '默认分组', ...topEntries.map((e) => e.value)]
                      .filter(Boolean)
                      .join(' · ');
                    const bottomText = bottomEntries.map((e) => e.value).join(' · ');
                    const bottomTooltip = bottomEntries
                      .map((e) => `${e.label}: ${e.value}`)
                      .join(' · ');
                    return (
                      <motion.a
                        key={node.id}
                        href={node.targetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.18,
                          delay: Math.min(idx * 0.02, 0.14),
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.99 }}
                        className="group relative block p-5 pr-12 bg-white dark:bg-[#111113] border border-[#E4E4E7] dark:border-[#27272A] hover:border-[#09090B]/30 dark:hover:border-white/25 hover:shadow-[0_6px_20px_rgba(0,0,0,0.04)] dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.28)] rounded-xl transition-[border-color,box-shadow] duration-150"
                      >
                        <div className="text-[12px] text-[#71717A] dark:text-[#A1A1AA] truncate">
                          {subtitle || '默认分组'}
                        </div>
                        <h3 className="mt-1.5 font-display text-[15px] font-semibold text-[#09090B] dark:text-[#FAFAFA] truncate">
                          {node.name}
                        </h3>
                        <div className="mt-3 flex items-center justify-between gap-2 text-[12px] text-[#71717A] dark:text-[#A1A1AA] min-w-0">
                          <span className="font-mono truncate">
                            {formatHostDisplay(node.targetUrl)}
                          </span>
                          {bottomText && (
                            <Tooltip content={bottomTooltip}>
                              <span className="text-[11px] text-[#71717A] dark:text-[#A1A1AA] truncate max-w-[46%] shrink-0">
                                {bottomText}
                              </span>
                            </Tooltip>
                          )}
                        </div>
                        <span
                          aria-hidden="true"
                          className="absolute top-5 right-5 text-[#A1A1AA] group-hover:text-[#09090B] dark:group-hover:text-white group-hover:translate-x-[1px] group-hover:-translate-y-[1px] transition-all duration-150"
                        >
                          <ArrowUpRight className="w-4 h-4" />
                        </span>
                      </motion.a>
                    );
                  })}
                </motion.div>
              ) : (
                <motion.div
                  key="public-table"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="bg-white dark:bg-[#111113] border border-[#E4E4E7] dark:border-[#27272A] rounded-xl overflow-hidden"
                >
                  <table className="w-full table-fixed text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#E4E4E7] dark:border-[#27272A] bg-[#FAFAFA] dark:bg-[#141417] text-[12px] font-medium text-[#71717A] dark:text-[#A1A1AA]">
                        <th className="py-3 px-4 w-[28%]">名称与分组</th>
                        <th className="py-3 px-3 w-[38%]">访问地址</th>
                        <th className="hidden sm:table-cell py-3 px-3 w-[20%]">补充信息</th>
                        <th className="py-3 px-4 text-right w-[110px]">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F4F4F5] dark:divide-[#1F1F23]">
                      {filteredNodes.map((node) => {
                        const entries = resolveNodeCustomEntries(node, workspace.customFields);
                        const topEntries = entries.filter((e) => e.placement === 'card_top');
                        const extraEntries = entries.filter(
                          (e) => e.placement === 'card_bottom' || e.placement === 'detail_only'
                        );
                        const extraText = extraEntries
                          .map((e) => `${e.label}: ${e.value}`)
                          .join(' · ');
                        return (
                          <tr
                            key={node.id}
                            className="group hover:bg-[#FAFAFA] dark:hover:bg-[#18181B] transition-colors"
                          >
                            <td className="py-3 px-4 align-middle min-w-0">
                              <div className="font-medium text-[13px] text-[#09090B] dark:text-[#FAFAFA] truncate">
                                {node.name}
                              </div>
                              <div className="mt-0.5 text-[11px] text-[#71717A] truncate">
                                {[node.group || '默认分组', ...topEntries.map((e) => e.value)]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                            </td>
                            <td className="py-3 px-3 align-middle min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Tooltip content={node.targetUrl}>
                                  <span className="font-mono text-xs text-[#27272A] dark:text-[#E4E4E7] truncate">
                                    {node.targetUrl}
                                  </span>
                                </Tooltip>
                                <Tooltip content="复制完整地址">
                                  <button
                                    type="button"
                                    onClick={() => handleCopyUrl(node.id, node.targetUrl)}
                                    aria-label={`复制 ${node.name} 地址`}
                                    className="p-1 text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-white rounded shrink-0"
                                  >
                                    {copiedId === node.id ? (
                                      <Check className="w-3.5 h-3.5 text-[#16A34A]" aria-hidden="true" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                                    )}
                                  </button>
                                </Tooltip>
                              </div>
                            </td>
                            <td className="hidden sm:table-cell py-3 px-3 align-middle text-xs text-[#71717A] truncate">
                              <Tooltip content={extraText || undefined}>
                                <span className="block truncate">{extraText || '—'}</span>
                              </Tooltip>
                            </td>
                            <td className="py-3 px-4 align-middle text-right">
                              <a
                                href={node.targetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-[#09090B] hover:bg-[#27272A] dark:bg-[#FAFAFA] dark:text-[#09090B] rounded-md transition-colors whitespace-nowrap"
                              >
                                <span>打开</span>
                                <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}
