import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Pin,
  WifiOff,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { PanelNode, PanelType, WorkspaceCustomFieldDef } from '../types/panel';
import { buildBridgeLaunchUrl, buildPanelTargetUrl } from '../utils/userscript';
import { resolveNodeCustomEntries } from '../utils/workspacePresets';

interface PanelTableProps {
  nodes: PanelNode[];
  panelType?: PanelType;
  customFields?: WorkspaceCustomFieldDef[];
  onEdit: (node: PanelNode) => void;
  onLaunch: (node: PanelNode) => void;
  onProbe: (node: PanelNode) => void;
  onTogglePin: (node: PanelNode) => void;
  onCopy: (label: string, value: string) => void;
}

function renderProbeStatus(node: PanelNode) {
  const probe = node.probe;
  if (!probe || probe.status === 'untested') {
    return <span className="text-[12px] text-[#A1A1AA] dark:text-[#52525B]">未检测</span>;
  }
  if (probe.status === 'checking') {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-[#2563EB] dark:text-[#60A5FA]">
        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
        <span>探测中</span>
      </span>
    );
  }
  if (probe.status === 'auth_ok' || probe.status === 'reachable') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[12px] text-[#16A34A] dark:text-[#4ADE80] tabular-nums"
        title={probe.message}
      >
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{probe.latencyMs ?? 0} ms</span>
      </span>
    );
  }
  if (probe.status === 'auth_failed') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[12px] text-[#D97706] dark:text-[#FBBF24]"
        title={probe.message}
      >
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>待核对</span>
      </span>
    );
  }
  if (probe.status === 'blocked') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[12px] text-[#D97706] dark:text-[#FBBF24]"
        title={probe.message}
      >
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>受限</span>
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[12px] text-[#DC2626] dark:text-[#F87171]"
      title={probe.message}
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>不可达</span>
    </span>
  );
}

export function PanelTable({
  nodes,
  panelType,
  customFields,
  onEdit,
  onLaunch,
  onProbe,
  onTogglePin,
  onCopy,
}: PanelTableProps) {
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleInlineCopy = (key: string, label: string, value: string) => {
    onCopy(label, value);
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 1400);
  };

  return (
    <div className="bg-white dark:bg-[#111113] border border-[#E4E4E7] dark:border-[#27272A] rounded-xl overflow-hidden">
      {/* Desktop & Tablet fixed-layout table (no horizontal scroll, all columns always visible) */}
      <table className="hidden md:table w-full table-fixed text-left border-collapse">
        <thead>
          <tr className="border-b border-[#E4E4E7] dark:border-[#27272A] bg-[#FAFAFA] dark:bg-[#141417] text-[12px] font-medium text-[#71717A] dark:text-[#A1A1AA]">
            <th className="py-3 pl-3 pr-1 w-9">
              <span className="sr-only">置顶</span>
            </th>
            <th className="py-3 px-2.5 w-[21%]">名称与分组</th>
            <th className="py-3 px-2.5 w-[27%]">访问地址</th>
            <th className="py-3 px-2.5 w-[22%]">账号与密码</th>
            <th className="py-3 px-2.5 w-[104px]">状态</th>
            <th className="py-3 pl-2 pr-3.5 text-right w-[176px]">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F4F4F5] dark:divide-[#1F1F23]">
          {nodes.map((node, idx) => {
            const targetUrl = buildPanelTargetUrl(node);
            const launchUrl = buildBridgeLaunchUrl(node, panelType);
            const isRevealed = Boolean(revealedIds[node.id]);
            const entries = resolveNodeCustomEntries(node, customFields);
            const topEntries = entries.filter((e) => e.placement === 'card_top');
            const bottomEntries = entries.filter((e) => e.placement === 'card_bottom');
            const detailEntries = entries.filter((e) => e.placement === 'detail_only');
            const groupLine = [node.group || '默认分组', ...topEntries.map((e) => e.value)]
              .filter(Boolean)
              .join(' · ');
            const detailLine = detailEntries.map((e) => `${e.label}: ${e.value}`).join(' · ');
            const urlSubLine = [
              node.entrance ? `入口 ${node.entrance}` : '',
              ...bottomEntries.map((e) => `${e.label}: ${e.value}`),
            ]
              .filter(Boolean)
              .join(' · ');

            return (
              <motion.tr
                key={node.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.18,
                  delay: Math.min(idx * 0.02, 0.14),
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="group hover:bg-[#FAFAFA] dark:hover:bg-[#18181B] transition-colors duration-100"
              >
                <td className="py-3 pl-3 pr-1 align-middle">
                  <button
                    type="button"
                    onClick={() => onTogglePin(node)}
                    aria-label={node.pinned ? `取消置顶 ${node.name}` : `置顶 ${node.name}`}
                    title={node.pinned ? '取消置顶' : '置顶'}
                    className={`p-1 rounded-md transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-white ${
                      node.pinned
                        ? 'text-[#2563EB] dark:text-[#60A5FA] opacity-100'
                        : 'text-[#A1A1AA] opacity-30 group-hover:opacity-100 hover:text-[#09090B] dark:hover:text-white'
                    }`}
                  >
                    <Pin className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </td>

                <td className="py-3 px-2.5 align-middle min-w-0">
                  <div className="font-medium text-[13px] text-[#09090B] dark:text-[#FAFAFA] truncate">
                    {node.name}
                  </div>
                  <div
                    className="mt-0.5 text-[11px] text-[#71717A] dark:text-[#A1A1AA] truncate"
                    title={groupLine}
                  >
                    {groupLine}
                  </div>
                  {detailLine && (
                    <div
                      className="mt-0.5 text-[11px] text-[#A1A1AA] dark:text-[#71717A] truncate"
                      title={detailLine}
                    >
                      {detailLine}
                    </div>
                  )}
                </td>

                <td className="py-3 px-2.5 align-middle min-w-0">
                  <div className="flex items-center gap-1 min-w-0">
                    <span
                      className="font-mono text-[12px] text-[#27272A] dark:text-[#E4E4E7] truncate"
                      title={targetUrl}
                    >
                      {targetUrl}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleInlineCopy(`url-${node.id}`, '访问地址', targetUrl)}
                      aria-label={`复制 ${node.name} 访问地址`}
                      title="复制完整地址"
                      className="p-1 rounded text-[#A1A1AA] opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-[#09090B] dark:hover:text-white transition-opacity shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-white"
                    >
                      {copiedKey === `url-${node.id}` ? (
                        <Check className="w-3.5 h-3.5 text-[#16A34A]" aria-hidden="true" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {urlSubLine && (
                    <div
                      className="mt-0.5 text-[11px] text-[#A1A1AA] truncate"
                      title={urlSubLine}
                    >
                      {urlSubLine}
                    </div>
                  )}
                </td>

                <td className="py-3 px-2.5 align-middle min-w-0">
                  {node.username || node.password ? (
                    <div className="flex items-center gap-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => handleInlineCopy(`user-${node.id}`, '用户名', node.username)}
                        title={`复制用户名: ${node.username}`}
                        aria-label={`复制 ${node.name} 用户名`}
                        className="font-mono text-[12px] text-[#09090B] dark:text-[#FAFAFA] hover:text-[#2563EB] dark:hover:text-[#60A5FA] transition-colors truncate max-w-[90px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] rounded"
                      >
                        {copiedKey === `user-${node.id}` ? '已复制' : node.username || '—'}
                      </button>
                      <span className="text-[#D4D4D8] dark:text-[#3F3F46] shrink-0" aria-hidden="true">
                        /
                      </span>
                      <span className="font-mono text-[12px] text-[#71717A] dark:text-[#A1A1AA] truncate min-w-0">
                        {isRevealed ? node.password || '—' : '••••••'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setRevealedIds((p) => ({ ...p, [node.id]: !p[node.id] }))}
                        aria-label={isRevealed ? `隐藏 ${node.name} 密码` : `显示 ${node.name} 密码`}
                        title={isRevealed ? '隐藏密码' : '显示密码'}
                        className="p-1 text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-white rounded shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-white"
                      >
                        {isRevealed ? (
                          <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                      </button>
                      {node.password && (
                        <button
                          type="button"
                          onClick={() => handleInlineCopy(`pass-${node.id}`, '密码', node.password)}
                          aria-label={`复制 ${node.name} 密码`}
                          title="复制密码"
                          className="p-1 text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-white rounded shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-white"
                        >
                          {copiedKey === `pass-${node.id}` ? (
                            <Check className="w-3.5 h-3.5 text-[#16A34A]" aria-hidden="true" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="text-[12px] text-[#A1A1AA] dark:text-[#52525B]">仅跳转</span>
                  )}
                </td>

                <td className="py-3 px-2.5 align-middle whitespace-nowrap">
                  {renderProbeStatus(node)}
                </td>

                <td className="py-3 pl-2 pr-3.5 align-middle text-right">
                  <div className="inline-flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onProbe(node)}
                      disabled={node.probe?.status === 'checking'}
                      title="测试浏览器连通性"
                      aria-label={`检测 ${node.name} 连通性`}
                      className="p-1.5 text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-white hover:bg-[#F4F4F5] dark:hover:bg-[#27272A] rounded-md transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-white"
                    >
                      <Activity className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(node)}
                      title="编辑站点配置"
                      aria-label={`编辑 ${node.name}`}
                      className="p-1.5 text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-white hover:bg-[#F4F4F5] dark:hover:bg-[#27272A] rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-white"
                    >
                      <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <a
                      href={launchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => onLaunch(node)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-medium text-white bg-[#09090B] hover:bg-[#27272A] dark:bg-[#FAFAFA] dark:text-[#09090B] dark:hover:bg-[#E4E4E7] rounded-md transition-[background-color,transform] duration-150 active:scale-[0.98] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-white focus-visible:ring-offset-2"
                    >
                      <span>
                        {node.authMode === 'basic'
                          ? 'Basic 认证'
                          : !node.username && !node.password
                          ? '打开'
                          : node.autoSubmit
                          ? '一键登录'
                          : '填充打开'}
                      </span>
                      <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </a>
                  </div>
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>

      {/* Mobile / Narrow Viewport Detailed Stack (zero horizontal overflow) */}
      <div className="md:hidden divide-y divide-[#F4F4F5] dark:divide-[#1F1F23]">
        {nodes.map((node, idx) => {
          const targetUrl = buildPanelTargetUrl(node);
          const launchUrl = buildBridgeLaunchUrl(node, panelType);
          const isRevealed = Boolean(revealedIds[node.id]);
          const entries = resolveNodeCustomEntries(node, customFields);
          const topEntries = entries.filter((e) => e.placement === 'card_top');
          const bottomAndDetail = entries.filter(
            (e) => e.placement === 'card_bottom' || e.placement === 'detail_only'
          );

          return (
            <motion.div
              key={node.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.18,
                delay: Math.min(idx * 0.02, 0.14),
                ease: [0.16, 1, 0.3, 1],
              }}
              className="p-4 space-y-2.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-sm text-[#09090B] dark:text-[#FAFAFA] truncate">
                      {node.name}
                    </span>
                    <span className="text-[11px] text-[#71717A] truncate">
                      {[node.group, ...topEntries.map((e) => e.value)].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-[#71717A] truncate">
                    {targetUrl}
                  </div>
                  {bottomAndDetail.length > 0 && (
                    <div className="mt-0.5 text-[11px] text-[#A1A1AA] truncate">
                      {bottomAndDetail.map((e) => `${e.label}: ${e.value}`).join(' · ')}
                    </div>
                  )}
                </div>
                <a
                  href={launchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onLaunch(node)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-[#09090B] dark:bg-[#FAFAFA] dark:text-[#09090B] rounded-md whitespace-nowrap shrink-0"
                >
                  <span>
                    {node.authMode === 'basic'
                      ? 'Basic 认证'
                      : !node.username && !node.password
                      ? '打开'
                      : node.autoSubmit
                      ? '一键登录'
                      : '填充'}
                  </span>
                  <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
              </div>

              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 min-w-0 font-mono text-[#52525B] dark:text-[#A1A1AA]">
                  {node.username || node.password ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleInlineCopy(`m-usr-${node.id}`, '用户名', node.username)}
                        className="truncate max-w-[100px] text-[#09090B] dark:text-white"
                      >
                        {node.username || '—'}
                      </button>
                      <span>/</span>
                      <span className="truncate max-w-[90px]">
                        {isRevealed ? node.password || '—' : '••••••'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setRevealedIds((p) => ({ ...p, [node.id]: !p[node.id] }))}
                        aria-label={isRevealed ? '隐藏密码' : '显示密码'}
                        className="p-1 text-[#A1A1AA]"
                      >
                        {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </>
                  ) : (
                    <span className="font-sans text-[#A1A1AA]">仅跳转</span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {renderProbeStatus(node)}
                  <button
                    type="button"
                    onClick={() => onProbe(node)}
                    aria-label="探测"
                    className="p-1.5 text-[#71717A]"
                  >
                    <Activity className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(node)}
                    aria-label="编辑"
                    className="p-1.5 text-[#71717A]"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
