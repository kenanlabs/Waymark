import { ArrowUpRight, Eye, Globe, Pencil, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import type { Workspace } from '../types/panel';
import { buildWorkspacePublicUrl } from '../utils/workspacePresets';

interface WorkspaceBarProps {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  nodeCountsByWorkspace: Record<string, number>;
  onSelectWorkspace: (id: string) => void;
  onCreateWorkspace: () => void;
  onEditWorkspace: (workspace: Workspace) => void;
}

export function WorkspaceBar({
  workspaces,
  activeWorkspaceId,
  nodeCountsByWorkspace,
  onSelectWorkspace,
  onCreateWorkspace,
  onEditWorkspace,
}: WorkspaceBarProps) {
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0];
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const isActivePublic = Boolean(
    activeWorkspace?.isPublic && (activeWorkspace.publicRoute || activeWorkspace.publicDomain)
  );
  const publicJumpUrl =
    isActivePublic && activeWorkspace ? buildWorkspacePublicUrl(activeWorkspace, origin) : '';
  const publicPreviewUrl =
    isActivePublic && activeWorkspace
      ? activeWorkspace.publicDomain
        ? `${origin}/?preview=${encodeURIComponent(activeWorkspace.id)}`
        : publicJumpUrl
      : '';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div
        role="tablist"
        aria-label="工作空间切换"
        className="inline-flex flex-wrap items-center gap-1 p-1 bg-[#F4F4F5]/90 dark:bg-[#141417] border border-[#E4E4E7] dark:border-[#27272A] rounded-xl max-w-full"
      >
        {workspaces.map((ws) => {
          const active = ws.id === activeWorkspaceId;
          const count = nodeCountsByWorkspace[ws.id] || 0;
          const wsPublicUrl = ws.isPublic ? buildWorkspacePublicUrl(ws, origin) : '';

          return (
            <button
              key={ws.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelectWorkspace(ws.id)}
              className={`relative inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-white ${
                active
                  ? 'text-[#09090B] dark:text-[#FAFAFA]'
                  : 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#FAFAFA]'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="workspace-active-bg"
                  transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                  className="absolute inset-0 bg-white dark:bg-[#232329] rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.06)] border border-black/[0.04] dark:border-white/[0.06]"
                />
              )}
              {ws.isPublic && (
                <span
                  title={wsPublicUrl ? `公开访问：${wsPublicUrl}` : '已开启公开访问'}
                  className="relative z-10 inline-flex shrink-0"
                >
                  <Globe
                    className="w-3 h-3 text-[#71717A] dark:text-[#A1A1AA]"
                    aria-label="已开启公开访问"
                  />
                </span>
              )}
              <span className="relative z-10 truncate max-w-[160px]">{ws.name}</span>
              <span className="relative z-10 font-mono text-[11px] tabular-nums text-[#A1A1AA] dark:text-[#71717A]">
                {count}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onCreateWorkspace}
          className="inline-flex items-center gap-1 h-8 px-2.5 text-[12px] font-medium text-[#71717A] hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA] rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-white"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>新建空间</span>
        </button>
      </div>

      {activeWorkspace && (
        <div className="flex items-center gap-2 shrink-0">
          {isActivePublic && activeWorkspace.publicDomain ? (
            <>
              <a
                href={publicPreviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="在当前站点下预览公开页面效果"
                className="inline-flex items-center gap-1.5 h-8 px-2.5 text-[12px] font-medium text-[#52525B] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#FAFAFA] bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] hover:border-[#A1A1AA] dark:hover:border-[#3F3F46] rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                <span>预览</span>
              </a>
              <a
                href={publicJumpUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={`跳转公开访问页面：${publicJumpUrl}`}
                className="inline-flex items-center gap-1 h-8 px-2.5 text-[12px] font-medium text-[#09090B] dark:text-[#FAFAFA] bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] hover:border-[#A1A1AA] dark:hover:border-[#3F3F46] rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <span>跳转公开页</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-[#71717A]" aria-hidden="true" />
              </a>
            </>
          ) : (
            isActivePublic &&
            publicJumpUrl && (
              <a
                href={publicJumpUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={`预览并跳转公开访问页面：${publicJumpUrl}`}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 text-[12px] font-medium text-[#09090B] dark:text-[#FAFAFA] bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] hover:border-[#A1A1AA] dark:hover:border-[#3F3F46] rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Eye className="w-3.5 h-3.5 text-[#71717A]" aria-hidden="true" />
                <span>预览公开页</span>
                <ArrowUpRight className="w-3 h-3 text-[#71717A]" aria-hidden="true" />
              </a>
            )
          )}

          <button
            type="button"
            onClick={() => onEditWorkspace(activeWorkspace)}
            aria-label={`编辑工作空间 ${activeWorkspace.name}`}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 text-[12px] text-[#71717A] hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA] hover:bg-[#F4F4F5] dark:hover:bg-[#18181B] rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Pencil className="w-3 h-3" aria-hidden="true" />
            <span>空间设置</span>
          </button>
        </div>
      )}
    </div>
  );
}
