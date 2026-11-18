import { useState } from 'react';
import { ArrowUpRight, Check, KeyRound, Pencil, Pin, User } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { PanelNode, PanelType } from '../types/panel';
import { buildBridgeLaunchUrl } from '../utils/userscript';

interface PanelGridProps {
  nodes: PanelNode[];
  panelType?: PanelType;
  onEdit: (node: PanelNode) => void;
  onLaunch: (node: PanelNode) => void;
  onTogglePin: (node: PanelNode) => void;
  onCopy: (label: string, value: string) => void;
}

function formatHostDisplay(baseUrl: string): string {
  try {
    const u = new URL(baseUrl);
    return u.host;
  } catch {
    return baseUrl.replace(/^https?:\/\//i, '');
  }
}

export function PanelGrid({
  nodes,
  panelType,
  onEdit,
  onLaunch,
  onTogglePin,
  onCopy,
}: PanelGridProps) {
  const [copiedField, setCopiedField] = useState<{
    id: string;
    field: 'username' | 'password';
  } | null>(null);

  const handleCopyField = (
    e: React.MouseEvent,
    node: PanelNode,
    field: 'username' | 'password',
    label: string,
    value: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    onCopy(label, value);
    setCopiedField({ id: node.id, field });
    window.setTimeout(() => {
      setCopiedField((prev) =>
        prev && prev.id === node.id && prev.field === field ? null : prev
      );
    }, 1400);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
      <AnimatePresence mode="popLayout">
        {nodes.map((node, idx) => {
          const launchUrl = buildBridgeLaunchUrl(node, panelType);
          const host = formatHostDisplay(node.baseUrl);
          const subtitle = [node.group, node.region || node.provider].filter(Boolean).join(' · ');

          return (
            <motion.div
              key={node.id}
              layout="position"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{
                duration: 0.2,
                delay: Math.min(idx * 0.025, 0.16),
                ease: [0.16, 1, 0.3, 1],
              }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.99 }}
              className="group relative bg-white dark:bg-[#111113] border border-[#E4E4E7] dark:border-[#27272A] hover:border-[#09090B]/30 dark:hover:border-white/25 hover:shadow-[0_6px_20px_rgba(0,0,0,0.04)] dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.28)] rounded-xl transition-[border-color,box-shadow] duration-150"
            >
              {/* Main clickable card surface -> direct launch */}
              <a
                href={launchUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onLaunch(node)}
                className="block p-5 pr-12 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-white"
              >
                <div className="flex items-center gap-1.5 text-[12px] text-[#71717A] dark:text-[#A1A1AA] truncate">
                  <span className="truncate">{subtitle || '默认分组'}</span>
                </div>

                <h3 className="mt-1.5 font-display text-[15px] font-semibold text-[#09090B] dark:text-[#FAFAFA] truncate">
                  {node.name}
                </h3>

                <div className="mt-3 font-mono text-[12px] text-[#71717A] dark:text-[#A1A1AA] truncate">
                  {host}
                </div>
              </a>

              {/* Top-right launch arrow / smooth hover quick actions */}
              <div className="absolute top-4 right-4 flex items-center gap-0.5">
                {node.pinned && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onTogglePin(node);
                    }}
                    aria-label={`取消置顶 ${node.name}`}
                    title="已置顶"
                    className="p-1.5 text-[#2563EB] dark:text-[#60A5FA] rounded-md transition-opacity duration-150 group-hover:opacity-0 group-hover:pointer-events-none group-focus-within:opacity-0"
                  >
                    <Pin className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}

                <div className="flex items-center gap-0.5 bg-white/95 dark:bg-[#111113]/95 backdrop-blur-xs pl-1 rounded-md opacity-0 translate-x-1 pointer-events-none group-hover:opacity-100 group-hover:translate-x-0 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:translate-x-0 group-focus-within:pointer-events-auto transition-all duration-150">
                  {node.username && (
                    <button
                      type="button"
                      onClick={(e) => handleCopyField(e, node, 'username', '用户名', node.username)}
                      aria-label={`复制 ${node.name} 用户名`}
                      title="复制用户名"
                      className="p-1.5 text-[#71717A] hover:text-[#09090B] dark:hover:text-white hover:bg-[#F4F4F5] dark:hover:bg-[#1F1F23] rounded-md transition-colors active:scale-90"
                    >
                      {copiedField?.id === node.id && copiedField.field === 'username' ? (
                        <Check className="w-3.5 h-3.5 text-[#16A34A]" aria-hidden="true" />
                      ) : (
                        <User className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                    </button>
                  )}
                  {node.password && (
                    <button
                      type="button"
                      onClick={(e) => handleCopyField(e, node, 'password', '密码', node.password)}
                      aria-label={`复制 ${node.name} 密码`}
                      title="复制密码"
                      className="p-1.5 text-[#71717A] hover:text-[#09090B] dark:hover:text-white hover:bg-[#F4F4F5] dark:hover:bg-[#1F1F23] rounded-md transition-colors active:scale-90"
                    >
                      {copiedField?.id === node.id && copiedField.field === 'password' ? (
                        <Check className="w-3.5 h-3.5 text-[#16A34A]" aria-hidden="true" />
                      ) : (
                        <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onTogglePin(node);
                    }}
                    aria-label={node.pinned ? `取消置顶 ${node.name}` : `置顶 ${node.name}`}
                    title={node.pinned ? '取消置顶' : '置顶'}
                    className={`p-1.5 rounded-md hover:bg-[#F4F4F5] dark:hover:bg-[#1F1F23] transition-colors active:scale-90 ${
                      node.pinned
                        ? 'text-[#2563EB] dark:text-[#60A5FA]'
                        : 'text-[#71717A] hover:text-[#09090B] dark:hover:text-white'
                    }`}
                  >
                    <Pin className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onEdit(node);
                    }}
                    aria-label={`编辑 ${node.name}`}
                    title="编辑站点"
                    className="p-1.5 text-[#71717A] hover:text-[#09090B] dark:hover:text-white hover:bg-[#F4F4F5] dark:hover:bg-[#1F1F23] rounded-md transition-colors active:scale-90"
                  >
                    <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>

                <span
                  aria-hidden="true"
                  className="p-1.5 text-[#A1A1AA] group-hover:text-[#09090B] dark:group-hover:text-white group-hover:translate-x-[1px] group-hover:-translate-y-[1px] transition-all duration-150 pointer-events-none"
                >
                  <ArrowUpRight className="w-4 h-4" />
                </span>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
