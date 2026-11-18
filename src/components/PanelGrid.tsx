import { useRef, useState } from 'react';
import { ArrowUpRight, Check, GripVertical, KeyRound, Pencil, Pin, User } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { PanelNode, PanelType, WorkspaceCustomFieldDef } from '../types/panel';
import { buildBridgeLaunchUrl } from '../utils/userscript';
import { resolveNodeCustomEntries } from '../utils/workspacePresets';

interface PanelGridProps {
  nodes: PanelNode[];
  panelType?: PanelType;
  customFields?: WorkspaceCustomFieldDef[];
  onEdit: (node: PanelNode) => void;
  onLaunch: (node: PanelNode) => void;
  onTogglePin: (node: PanelNode) => void;
  onReorder?: (fromId: string, toId: string) => void;
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
  customFields,
  onEdit,
  onLaunch,
  onTogglePin,
  onReorder,
  onCopy,
}: PanelGridProps) {
  const [copiedField, setCopiedField] = useState<{
    id: string;
    field: 'username' | 'password';
  } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const lastDragEndAtRef = useRef<number>(0);

  const canDrag = Boolean(onReorder) && nodes.length > 1;

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

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, node: PanelNode) => {
    if (!canDrag) return;
    setDraggingId(node.id);
    setDragOverId(null);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('application/x-waymark-node', node.id);
      e.dataTransfer.setData('text/plain', node.id);
    } catch {
      // Ignore restricted dataTransfer environments
    }
    try {
      const rect = e.currentTarget.getBoundingClientRect();
      const offsetX = Math.max(12, Math.min(rect.width - 12, e.clientX - rect.left));
      const offsetY = Math.max(12, Math.min(rect.height - 12, e.clientY - rect.top));
      e.dataTransfer.setDragImage(e.currentTarget, offsetX, offsetY);
    } catch {
      // Fallback to browser default drag image
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
    if (!canDrag || !draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggingId === targetId) {
      if (dragOverId !== null) setDragOverId(null);
      return;
    }
    if (dragOverId !== targetId) {
      setDragOverId(targetId);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
    if (!canDrag) return;
    e.preventDefault();
    let sourceId = draggingId;
    if (!sourceId) {
      try {
        sourceId =
          e.dataTransfer.getData('application/x-waymark-node') ||
          e.dataTransfer.getData('text/plain') ||
          null;
      } catch {
        sourceId = null;
      }
    }
    lastDragEndAtRef.current = Date.now();
    setDraggingId(null);
    setDragOverId(null);
    if (sourceId && sourceId !== targetId && onReorder) {
      onReorder(sourceId, targetId);
    }
  };

  const handleDragEnd = () => {
    lastDragEndAtRef.current = Date.now();
    setDraggingId(null);
    setDragOverId(null);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
      <AnimatePresence mode="popLayout">
        {nodes.map((node, idx) => {
          const launchUrl = buildBridgeLaunchUrl(node, panelType);
          const host = formatHostDisplay(node.baseUrl);
          const entries = resolveNodeCustomEntries(node, customFields);
          const topEntries = entries.filter((e) => e.placement === 'card_top');
          const bottomEntries = entries.filter((e) => e.placement === 'card_bottom');
          const subtitle = [node.group || '默认分组', ...topEntries.map((e) => e.value)]
            .filter(Boolean)
            .join(' · ');
          const subtitleTooltip = [
            node.group || '默认分组',
            ...topEntries.map((e) => `${e.label}: ${e.value}`),
          ]
            .filter(Boolean)
            .join(' · ');
          const bottomText = bottomEntries.map((e) => e.value).join(' · ');
          const bottomTooltip = bottomEntries.map((e) => `${e.label}: ${e.value}`).join(' · ');
          const isDragging = draggingId === node.id;
          const isDragOver = dragOverId === node.id && draggingId !== node.id;

          return (
            <motion.div
              key={node.id}
              layout="position"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{
                duration: 0.2,
                delay: draggingId ? 0 : Math.min(idx * 0.025, 0.16),
                ease: [0.16, 1, 0.3, 1],
              }}
              whileHover={draggingId ? undefined : { y: -2 }}
              whileTap={draggingId ? undefined : { scale: 0.99 }}
            >
              <div
                draggable={canDrag}
                onDragStart={(e) => handleDragStart(e, node)}
                onDragOver={(e) => handleDragOver(e, node.id)}
                onDrop={(e) => handleDrop(e, node.id)}
                onDragEnd={handleDragEnd}
                className={`group relative rounded-xl border transition-[border-color,box-shadow,opacity,background-color] duration-150 ${
                  canDrag ? 'select-none' : ''
                } ${
                  isDragging
                    ? 'opacity-45 bg-[#FAFAFA] dark:bg-[#18181B] border-[#09090B]/40 dark:border-white/40 cursor-grabbing'
                    : isDragOver
                    ? 'bg-[#FAFAFA] dark:bg-[#18181B] border-[#09090B] dark:border-[#FAFAFA] ring-1 ring-inset ring-[#09090B] dark:ring-[#FAFAFA] shadow-[0_8px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)]'
                    : 'bg-white dark:bg-[#111113] border-[#E4E4E7] dark:border-[#27272A] hover:border-[#09090B]/30 dark:hover:border-white/25 hover:shadow-[0_6px_20px_rgba(0,0,0,0.04)] dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.28)]'
                }`}
              >
                {/* Main clickable card surface -> direct launch */}
                <a
                  href={launchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  draggable={false}
                  onClick={(e) => {
                    if (Date.now() - lastDragEndAtRef.current < 160) {
                      e.preventDefault();
                      return;
                    }
                    onLaunch(node);
                  }}
                  className="block p-5 pr-12 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-white"
                >
                  <div
                    className="flex items-center gap-1.5 text-[12px] text-[#71717A] dark:text-[#A1A1AA] truncate"
                    title={topEntries.length > 0 ? subtitleTooltip : undefined}
                  >
                    <span className="truncate">{subtitle || '默认分组'}</span>
                  </div>

                  <h3 className="mt-1.5 font-display text-[15px] font-semibold text-[#09090B] dark:text-[#FAFAFA] truncate">
                    {node.name}
                  </h3>

                  <div className="mt-3 flex items-center justify-between gap-2 text-[12px] text-[#71717A] dark:text-[#A1A1AA] min-w-0">
                    <span className="font-mono truncate">{host}</span>
                    {bottomText && (
                      <span
                        className="text-[11px] text-[#71717A] dark:text-[#A1A1AA] truncate max-w-[46%] shrink-0"
                        title={bottomTooltip}
                      >
                        {bottomText}
                      </span>
                    )}
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
                    {canDrag && (
                      <span
                        title="按住拖拽卡片调整顺序"
                        aria-hidden="true"
                        className="p-1.5 text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-white cursor-grab active:cursor-grabbing rounded-md"
                      >
                        <GripVertical className="w-3.5 h-3.5" />
                      </span>
                    )}
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
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
