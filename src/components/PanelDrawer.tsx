import { useEffect, useId, useMemo, useState } from 'react';
import { Activity, Bookmark, ChevronDown, Eye, EyeOff, Loader2, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { GroupCombobox } from './CustomSelect';
import type { PanelNode, PanelProbeResult, Workspace } from '../types/panel';
import { probePanelNode } from '../utils/auth';
import {
  buildPanelTargetUrl,
  buildSingleNodeBookmarklet,
  normalizeBaseUrl,
  normalizeEntrance,
  splitFullPanelUrl,
} from '../utils/userscript';

interface PanelDrawerProps {
  open: boolean;
  workspace: Workspace;
  editingNode: PanelNode | null;
  existingGroups: string[];
  onClose: () => void;
  onSave: (nodeData: Omit<PanelNode, 'id' | 'createdAt' | 'updatedAt'>, existingId?: string) => void;
  onDelete: (id: string) => void;
}

export function PanelDrawer({
  open,
  workspace,
  editingNode,
  existingGroups,
  onClose,
  onSave,
  onDelete,
}: PanelDrawerProps) {
  const formId = useId();
  const errorId = `${formId}-error`;

  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [entrance, setEntrance] = useState('');
  const [autoFill, setAutoFill] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [autoSubmit, setAutoSubmit] = useState(true);
  const [group, setGroup] = useState('默认分组');
  const [provider, setProvider] = useState('');
  const [region, setRegion] = useState('');
  const [notes, setNotes] = useState('');
  const [showOptional, setShowOptional] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<PanelProbeResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrorMsg('');
    setConfirmDelete(false);
    setConfirmDiscard(false);
    setProbeResult(editingNode?.probe ?? null);
    setShowPassword(false);

    if (editingNode) {
      const hasCreds = Boolean(editingNode.username || editingNode.password);
      setName(editingNode.name);
      setBaseUrl(editingNode.baseUrl);
      setEntrance(editingNode.entrance);
      setAutoFill(hasCreds);
      setUsername(editingNode.username);
      setPassword(editingNode.password);
      setAutoSubmit(editingNode.autoSubmit);
      setGroup(editingNode.group || '默认分组');
      setProvider(editingNode.provider || '');
      setRegion(editingNode.region || '');
      setNotes(editingNode.notes || '');
      setShowOptional(Boolean(editingNode.provider || editingNode.region || editingNode.notes));
    } else {
      setName('');
      setBaseUrl('');
      setEntrance('');
      setAutoFill(false);
      setUsername('');
      setPassword('');
      setAutoSubmit(true);
      setGroup(workspace.groups[0] || '默认分组');
      setProvider('');
      setRegion('');
      setNotes('');
      setShowOptional(false);
    }
  }, [open, editingNode, workspace]);

  const isDirty = useMemo(() => {
    if (!open) return false;
    if (!editingNode) {
      return Boolean(name || baseUrl || entrance || username || password || provider || region || notes);
    }
    const origHasCreds = Boolean(editingNode.username || editingNode.password);
    return (
      name !== editingNode.name ||
      baseUrl !== editingNode.baseUrl ||
      entrance !== editingNode.entrance ||
      autoFill !== origHasCreds ||
      username !== editingNode.username ||
      password !== editingNode.password ||
      group !== (editingNode.group || '默认分组') ||
      provider !== (editingNode.provider || '') ||
      region !== (editingNode.region || '') ||
      autoSubmit !== editingNode.autoSubmit ||
      notes !== (editingNode.notes || '')
    );
  }, [
    open,
    editingNode,
    name,
    baseUrl,
    entrance,
    autoFill,
    username,
    password,
    group,
    provider,
    region,
    autoSubmit,
    notes,
  ]);

  const requestClose = () => {
    if (isDirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  const handleUrlBlur = () => {
    if (!baseUrl.trim()) return;
    const split = splitFullPanelUrl(baseUrl, workspace.panelType || 'custom');
    if (split.baseUrl) setBaseUrl(split.baseUrl);
    if (split.entrance && !entrance.trim()) setEntrance(split.entrance);
  };

  const handleTestProbe = async () => {
    const normalizedUrl = normalizeBaseUrl(baseUrl);
    if (!normalizedUrl) {
      setErrorMsg('请先填写访问地址（例如 https://portal.example.com）再进行测试。');
      return;
    }
    setErrorMsg('');
    setProbing(true);
    try {
      const result = await probePanelNode({
        baseUrl: normalizedUrl,
        entrance: normalizeEntrance(entrance),
        username: autoFill ? username.trim() : '',
        password: autoFill ? password : '',
        version: editingNode?.version ?? 'v2',
        panelType: workspace.panelType,
        verifyAuth: Boolean(autoFill && username.trim() && password),
      });
      setProbeResult(result);
    } catch {
      setProbeResult({
        status: 'unreachable',
        message: '请求探测服务失败，请确认本地后端服务正在运行后重试。',
        checkedAt: new Date().toISOString(),
      });
    } finally {
      setProbing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const normUrl = normalizeBaseUrl(baseUrl);
    if (!name.trim()) {
      setErrorMsg('请填写站点名称，以便在卡片和 ⌘K 搜索中快速识别。');
      return;
    }
    if (!normUrl) {
      setErrorMsg('请填写有效的访问地址（支持 http:// 或 https://）。');
      return;
    }
    if (autoFill && !username.trim()) {
      setErrorMsg('开启自动登录填充时，请填写登录用户名。');
      return;
    }

    onSave(
      {
        workspaceId: editingNode?.workspaceId ?? workspace.id,
        name: name.trim(),
        baseUrl: normUrl,
        entrance: normalizeEntrance(entrance),
        username: autoFill ? username.trim() : '',
        password: autoFill ? password : '',
        group: group.trim() || '默认分组',
        provider: provider.trim(),
        region: region.trim(),
        version: editingNode?.version ?? 'v2',
        autoSubmit: autoFill ? autoSubmit : false,
        notes: notes.trim() || undefined,
        pinned: editingNode?.pinned,
        lastAccessedAt: editingNode?.lastAccessedAt,
        probe: probeResult ?? editingNode?.probe,
      },
      editingNode?.id
    );
  };

  const previewTarget = buildPanelTargetUrl({
    baseUrl: normalizeBaseUrl(baseUrl) || 'https://portal.example.com',
    entrance: normalizeEntrance(entrance),
  });

  const bookmarkletHref =
    editingNode && (editingNode.username || editingNode.password)
      ? buildSingleNodeBookmarklet(editingNode)
      : '';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]"
        >
          <div className="fixed inset-0" onClick={requestClose} aria-hidden="true" />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${formId}-title`}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-xl bg-white dark:bg-[#111113] border border-[#E4E4E7] dark:border-[#27272A] rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.18)] max-h-[88vh] flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E4E4E7] dark:border-[#27272A]">
              <div>
                <h2
                  id={`${formId}-title`}
                  className="font-display text-[15px] font-semibold text-[#09090B] dark:text-[#FAFAFA]"
                >
                  {editingNode ? '编辑站点' : '添加站点'}
                </h2>
                <p className="mt-0.5 text-[12px] text-[#71717A] dark:text-[#A1A1AA]">
                  所属空间：{workspace.name}
                </p>
              </div>
              <button
                type="button"
                onClick={requestClose}
                aria-label="关闭弹窗"
                className="p-1.5 text-[#71717A] hover:text-[#09090B] dark:hover:text-white rounded-lg hover:bg-[#F4F4F5] dark:hover:bg-[#1F1F23] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <AnimatePresence>
              {confirmDiscard && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="px-6 py-2.5 bg-[#FFFBEB] dark:bg-[#271C0B] border-b border-[#FDE68A] dark:border-[#78350F] flex items-center justify-between gap-3 text-xs"
                >
                  <span className="text-[#92400E] dark:text-[#FCD34D]">当前有未保存的修改，确认放弃？</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-2.5 py-1 font-medium text-white bg-[#B45309] hover:bg-[#92400E] rounded-md transition-colors"
                    >
                      放弃修改
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDiscard(false)}
                      className="px-2 py-1 text-[#71717A] hover:text-[#09090B] dark:hover:text-white rounded-md"
                    >
                      继续编辑
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <form
              id={formId}
              onSubmit={handleSubmit}
              className="flex-1 overflow-y-auto overscroll-contain px-6 py-5 space-y-4"
            >
              <AnimatePresence>
                {errorMsg && (
                  <motion.div
                    id={errorId}
                    role="alert"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="px-3.5 py-2.5 text-xs text-[#B91C1C] dark:text-[#FCA5A5] bg-[#FEF2F2] dark:bg-[#2B1414] border border-[#FECACA] dark:border-[#7F1D1D] rounded-lg"
                  >
                    {errorMsg}
                  </motion.div>
                )}
              </AnimatePresence>

              <div>
                <label
                  htmlFor={`${formId}-name`}
                  className="block text-xs font-medium text-[#27272A] dark:text-[#E4E4E7] mb-1.5"
                >
                  站点名称 / 别名 *
                </label>
                <input
                  id={`${formId}-name`}
                  type="text"
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-describedby={errorMsg ? errorId : undefined}
                  placeholder="例如：企业邮箱 / 文档中心 / 项目看板"
                  className="w-full h-9 px-3 text-[13px] bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#09090B] dark:focus:ring-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label
                    htmlFor={`${formId}-url`}
                    className="block text-xs font-medium text-[#27272A] dark:text-[#E4E4E7] mb-1.5"
                  >
                    访问地址 *
                  </label>
                  <input
                    id={`${formId}-url`}
                    type="text"
                    spellCheck={false}
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    onBlur={handleUrlBlur}
                    placeholder="https://portal.example.com"
                    className="w-full h-9 px-3 font-mono text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#09090B] dark:focus:ring-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${formId}-entrance`}
                    className="block text-xs font-medium text-[#27272A] dark:text-[#E4E4E7] mb-1.5"
                  >
                    入口 / 路径（可选）
                  </label>
                  <input
                    id={`${formId}-entrance`}
                    type="text"
                    spellCheck={false}
                    value={entrance}
                    onChange={(e) => setEntrance(e.target.value)}
                    placeholder="/secret 或留空"
                    className="w-full h-9 px-3 font-mono text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#09090B] dark:focus:ring-white"
                  />
                </div>
              </div>

              <div className="px-3.5 py-2.5 bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[11px] text-[#71717A] block">最终访问入口</span>
                  <span className="font-mono text-xs text-[#27272A] dark:text-[#E4E4E7] truncate block">
                    {previewTarget}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleTestProbe}
                  disabled={probing}
                  className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium border border-[#E4E4E7] dark:border-[#27272A] bg-white dark:bg-[#111113] hover:bg-[#F4F4F5] dark:hover:bg-[#1F1F23] rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-white"
                >
                  {probing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Activity className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span>{probing ? '探测中...' : '测试连通'}</span>
                </button>
              </div>

              <AnimatePresence>
                {probeResult && (
                  <motion.div
                    role="status"
                    aria-live="polite"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.16 }}
                    className="text-xs px-3.5 py-2 rounded-lg border border-[#E4E4E7] dark:border-[#27272A] bg-[#FAFAFA] dark:bg-[#18181B] text-[#27272A] dark:text-[#E4E4E7]"
                  >
                    探测结果：{probeResult.message}
                  </motion.div>
                )}
              </AnimatePresence>

              <div>
                <label
                  htmlFor={`${formId}-group`}
                  className="block text-xs font-medium text-[#27272A] dark:text-[#E4E4E7] mb-1.5"
                >
                  分组
                </label>
                <GroupCombobox
                  id={`${formId}-group`}
                  value={group}
                  onChange={setGroup}
                  suggestions={Array.from(new Set([...workspace.groups, ...existingGroups]))}
                  placeholder="选择或输入自定义分组"
                />
              </div>

              <div className="pt-2 border-t border-[#E4E4E7] dark:border-[#27272A] space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span
                      id={`${formId}-autofill-label`}
                      className="block text-xs font-medium text-[#09090B] dark:text-[#FAFAFA]"
                    >
                      启用自动登录
                    </span>
                    <span className="block text-[11px] text-[#71717A] dark:text-[#A1A1AA]">
                      仅用于快速免密跳转；如仅做导航书签或对接 SSO，保持关闭即可
                    </span>
                  </div>
                  <button
                    id={`${formId}-autofill`}
                    type="button"
                    role="switch"
                    aria-checked={autoFill}
                    aria-labelledby={`${formId}-autofill-label`}
                    onClick={() => setAutoFill((v) => !v)}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-white focus-visible:ring-offset-1 ${
                      autoFill
                        ? 'bg-[#09090B] dark:bg-[#FAFAFA] border-[#09090B] dark:border-[#FAFAFA]'
                        : 'bg-[#E4E4E7] dark:bg-[#27272A] border-[#D4D4D8] dark:border-[#3F3F46]'
                    }`}
                  >
                    <motion.span
                      layout
                      transition={{ type: 'spring', stiffness: 540, damping: 34 }}
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white dark:bg-[#09090B] shadow-sm ${
                        autoFill ? 'translate-x-[18px]' : 'translate-x-[2px]'
                      }`}
                    />
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {autoFill && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden space-y-3"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <label
                            htmlFor={`${formId}-user`}
                            className="block text-xs font-medium text-[#27272A] dark:text-[#E4E4E7] mb-1.5"
                          >
                            用户名 *
                          </label>
                          <input
                            id={`${formId}-user`}
                            type="text"
                            spellCheck={false}
                            autoComplete="off"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="admin"
                            className="w-full h-9 px-3 font-mono text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#09090B] dark:focus:ring-white"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor={`${formId}-pass`}
                            className="block text-xs font-medium text-[#27272A] dark:text-[#E4E4E7] mb-1.5"
                          >
                            登录密码
                          </label>
                          <div className="relative">
                            <input
                              id={`${formId}-pass`}
                              type={showPassword ? 'text' : 'password'}
                              spellCheck={false}
                              autoComplete="new-password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="登录密码"
                              className="w-full h-9 pl-3 pr-9 font-mono text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#09090B] dark:focus:ring-white"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword((prev) => !prev)}
                              aria-label={showPassword ? '隐藏密码' : '显示密码'}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#71717A] hover:text-[#09090B] dark:hover:text-white rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B]"
                            >
                              {showPassword ? (
                                <EyeOff className="w-3.5 h-3.5" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <button
                          id={`${formId}-autosubmit`}
                          type="button"
                          role="switch"
                          aria-checked={autoSubmit}
                          onClick={() => setAutoSubmit((v) => !v)}
                          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150 ${
                            autoSubmit
                              ? 'bg-[#09090B] dark:bg-[#FAFAFA] border-[#09090B] dark:border-[#FAFAFA]'
                              : 'bg-[#E4E4E7] dark:bg-[#27272A] border-[#D4D4D8] dark:border-[#3F3F46]'
                          }`}
                        >
                          <motion.span
                            layout
                            transition={{ type: 'spring', stiffness: 540, damping: 34 }}
                            aria-hidden="true"
                            className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white dark:bg-[#09090B] shadow-sm ${
                              autoSubmit ? 'translate-x-[18px]' : 'translate-x-[2px]'
                            }`}
                          />
                        </button>
                        <label
                          htmlFor={`${formId}-autosubmit`}
                          className="text-xs text-[#27272A] dark:text-[#E4E4E7] cursor-pointer select-none"
                        >
                          填充后自动提交（遇验证码暂停）
                        </label>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="border border-[#E4E4E7] dark:border-[#27272A] rounded-xl overflow-hidden">
                <button
                  type="button"
                  aria-expanded={showOptional}
                  onClick={() => setShowOptional((prev) => !prev)}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-medium text-[#52525B] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-white bg-[#FAFAFA] dark:bg-[#16161A] transition-colors"
                >
                  <span>可选补充信息（来源 / 地域 / 备注）</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-150 ${
                      showOptional ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>
                <AnimatePresence initial={false}>
                  {showOptional && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden border-t border-[#E4E4E7] dark:border-[#27272A]"
                    >
                      <div className="p-3.5 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label
                              htmlFor={`${formId}-provider`}
                              className="block text-xs font-medium text-[#27272A] dark:text-[#E4E4E7] mb-1.5"
                            >
                              服务商 / 来源
                            </label>
                            <input
                              id={`${formId}-provider`}
                              type="text"
                              value={provider}
                              onChange={(e) => setProvider(e.target.value)}
                              placeholder="官方 / 内部 / 云服务"
                              className="w-full h-9 px-3 text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#09090B] dark:focus:ring-white"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor={`${formId}-region`}
                              className="block text-xs font-medium text-[#27272A] dark:text-[#E4E4E7] mb-1.5"
                            >
                              所在地域
                            </label>
                            <input
                              id={`${formId}-region`}
                              type="text"
                              value={region}
                              onChange={(e) => setRegion(e.target.value)}
                              placeholder="华东 / 海外 / 局域网"
                              className="w-full h-9 px-3 text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#09090B] dark:focus:ring-white"
                            />
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor={`${formId}-notes`}
                            className="block text-xs font-medium text-[#27272A] dark:text-[#E4E4E7] mb-1.5"
                          >
                            备注说明
                          </label>
                          <textarea
                            id={`${formId}-notes`}
                            rows={2}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="例如：账号用途、访问方式或补充说明..."
                            className="w-full px-3 py-2 text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#09090B] dark:focus:ring-white"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {editingNode && bookmarkletHref && (
                <div className="pt-3 border-t border-[#E4E4E7] dark:border-[#27272A] flex items-center justify-between gap-3">
                  <div className="text-xs text-[#71717A]">
                    无插件备选：拖拽右侧书签到书签栏，登录页点击即可填充
                  </div>
                  <a
                    href={bookmarkletHref}
                    onClick={(e) => e.preventDefault()}
                    draggable
                    title="拖拽此按钮到浏览器书签栏"
                    className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium border border-[#E4E4E7] dark:border-[#27272A] rounded-lg bg-[#FAFAFA] dark:bg-[#18181B] text-[#09090B] dark:text-white whitespace-nowrap shrink-0 cursor-grab"
                  >
                    <Bookmark className="w-3 h-3" aria-hidden="true" />
                    <span>填充 · {editingNode.name}</span>
                  </a>
                </div>
              )}
            </form>

            <div className="px-6 py-3.5 border-t border-[#E4E4E7] dark:border-[#27272A] bg-[#FAFAFA] dark:bg-[#0D0D0F] flex items-center justify-between gap-4">
              {editingNode ? (
                confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onDelete(editingNode.id)}
                      className="h-8 px-3 text-xs font-medium text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-lg transition-colors"
                    >
                      确认删除
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="h-8 px-2.5 text-xs text-[#71717A] hover:text-[#09090B] dark:hover:text-white rounded-lg"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs text-[#DC2626] dark:text-[#F87171] hover:bg-[#FEF2F2] dark:hover:bg-[#2B1414] rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>删除站点</span>
                  </button>
                )
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={requestClose}
                  className="h-8 px-3.5 text-xs font-medium text-[#52525B] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-white hover:bg-[#F4F4F5] dark:hover:bg-[#1F1F23] rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  form={formId}
                  className="h-8 px-4 text-xs font-medium text-white bg-[#09090B] hover:bg-[#27272A] dark:bg-[#FAFAFA] dark:text-[#09090B] dark:hover:bg-[#E4E4E7] rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition-[background-color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-white focus-visible:ring-offset-2"
                >
                  {editingNode ? '保存更改' : '保存站点'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
