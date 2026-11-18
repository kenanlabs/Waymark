import { useEffect, useId, useState } from 'react';
import { ArrowUpRight, Check, Copy, Eye, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { CustomSelect } from './CustomSelect';
import type {
  CustomFieldPlacement,
  Workspace,
  WorkspaceCustomFieldDef,
} from '../types/panel';
import { copyTextToClipboard } from '../utils/crypto';
import {
  CUSTOM_FIELD_PLACEMENT_OPTIONS,
  normalizePublicDomain,
  normalizePublicRoute,
  normalizeWorkspaceCustomFields,
  parsePublicDomainInput,
  validatePublicDomain,
  validatePublicRoute,
} from '../utils/workspacePresets';

interface WorkspaceModalProps {
  open: boolean;
  editingWorkspace: Workspace | null;
  existingWorkspaces: Workspace[];
  nodeCount: number;
  canDelete: boolean;
  onClose: () => void;
  onSave: (
    data: {
      name: string;
      description: string;
      customFields: WorkspaceCustomFieldDef[];
      isPublic: boolean;
      publicRoute: string;
      publicDomain: string;
      publicProtocol: 'http' | 'https';
    },
    existingId?: string
  ) => Promise<string | null> | string | null;
  onDelete: (id: string) => void;
}

const CUSTOM_FIELD_PLACEHOLDERS = [
  '例如：所属环境 / 部门 / 地域',
  '例如：归属团队 / 线路 / 用途',
  '例如：备注说明 / 负责人 / 到期时间',
];

export function WorkspaceModal({
  open,
  editingWorkspace,
  existingWorkspaces,
  nodeCount,
  canDelete,
  onClose,
  onSave,
  onDelete,
}: WorkspaceModalProps) {
  const uid = useId();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [customFields, setCustomFields] = useState<WorkspaceCustomFieldDef[]>(() =>
    normalizeWorkspaceCustomFields()
  );
  const [isPublic, setIsPublic] = useState(false);
  const [publicDomain, setPublicDomain] = useState('');
  const [publicRoute, setPublicRoute] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    setErrorMsg('');
    setCopiedUrl(false);
    setSaving(false);

    if (editingWorkspace) {
      setName(editingWorkspace.name);
      setDescription(editingWorkspace.description || '');
      setCustomFields(normalizeWorkspaceCustomFields(editingWorkspace.customFields));
      setIsPublic(Boolean(editingWorkspace.isPublic));
      if (editingWorkspace.publicDomain) {
        setPublicDomain(
          editingWorkspace.publicProtocol === 'http'
            ? `http://${editingWorkspace.publicDomain}`
            : editingWorkspace.publicDomain
        );
      } else {
        setPublicDomain('');
      }
      setPublicRoute(editingWorkspace.publicRoute || '');
    } else {
      setName('');
      setDescription('');
      setCustomFields(normalizeWorkspaceCustomFields());
      setIsPublic(false);
      setPublicDomain('');
      setPublicRoute('');
    }
  }, [open, editingWorkspace]);

  const { protocol: previewProtocol, domain: normalizedPreviewDomain } =
    parsePublicDomainInput(publicDomain);
  const normalizedPreviewRoute = normalizePublicRoute(publicRoute);
  const fullPublicUrl = normalizedPreviewDomain
    ? `${previewProtocol}://${normalizedPreviewDomain}${normalizedPreviewRoute || '/'}`
    : normalizedPreviewRoute
      ? `${typeof window !== 'undefined' ? window.location.origin : ''}${normalizedPreviewRoute}`
      : '';

  const isSavedPublicUnchanged = Boolean(
    editingWorkspace?.isPublic &&
      isPublic &&
      (editingWorkspace.publicRoute || '') === normalizedPreviewRoute &&
      (editingWorkspace.publicDomain || '') === normalizedPreviewDomain &&
      (editingWorkspace.publicProtocol || 'https') === previewProtocol
  );

  const previewTargetHref =
    editingWorkspace && isSavedPublicUnchanged
      ? normalizedPreviewDomain
        ? `/?preview=${encodeURIComponent(editingWorkspace.id)}`
        : fullPublicUrl
      : '';

  const isCurrentHostRootConflict =
    typeof window !== 'undefined' &&
    Boolean(normalizedPreviewDomain) &&
    !normalizedPreviewRoute &&
    (normalizedPreviewDomain === window.location.host.toLowerCase() ||
      normalizedPreviewDomain === window.location.hostname.toLowerCase());

  const handleCopyPublicUrl = async () => {
    if (!fullPublicUrl) return;
    const ok = await copyTextToClipboard(fullPublicUrl);
    if (ok) {
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 1500);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg('请填写工作空间标题。');
      return;
    }

    let finalDomain = '';
    let finalProtocol: 'http' | 'https' = 'https';
    let finalRoute = '';
    if (isPublic) {
      const parsedDomain = parsePublicDomainInput(publicDomain);
      finalDomain = parsedDomain.domain;
      finalProtocol = parsedDomain.protocol;
      const domainError = validatePublicDomain(finalDomain);
      if (domainError) {
        setErrorMsg(domainError);
        return;
      }

      finalRoute = normalizePublicRoute(publicRoute);
      const routeError = validatePublicRoute(finalRoute, Boolean(finalDomain));
      if (routeError) {
        setErrorMsg(routeError);
        return;
      }

      const effectiveRoute = (finalRoute || (finalDomain ? '/' : '')).toLowerCase();
      const collision = existingWorkspaces.find((ws) => {
        if (ws.id === editingWorkspace?.id || !ws.isPublic) return false;
        const otherDomain = normalizePublicDomain(ws.publicDomain || '');
        const otherRoute = (ws.publicRoute || (otherDomain ? '/' : '')).toLowerCase();
        if (finalDomain && otherDomain && finalDomain === otherDomain && effectiveRoute === otherRoute) {
          return true;
        }
        if (!finalDomain && !otherDomain && effectiveRoute && otherRoute === effectiveRoute) {
          return true;
        }
        return false;
      });
      if (collision) {
        setErrorMsg(
          finalDomain
            ? `域名「${finalDomain}」下的路径「${effectiveRoute}」已被工作空间「${collision.name}」使用。`
            : `路由「${finalRoute}」已被工作空间「${collision.name}」使用，请更换其他路径。`
        );
        return;
      }
    }

    setErrorMsg('');
    setSaving(true);
    const err = await onSave(
      {
        name: trimmedName,
        description: description.trim(),
        customFields: normalizeWorkspaceCustomFields(customFields),
        isPublic,
        publicRoute: finalRoute,
        publicDomain: finalDomain,
        publicProtocol: finalProtocol,
      },
      editingWorkspace?.id
    );
    setSaving(false);
    if (err) {
      setErrorMsg(err);
    }
  };

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
          <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${uid}-title`}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-lg bg-white dark:bg-[#111113] border border-[#E4E4E7] dark:border-[#27272A] rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.18)] overflow-hidden flex flex-col max-h-[88vh]"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E4E4E7] dark:border-[#27272A]">
              <div>
                <h2
                  id={`${uid}-title`}
                  className="font-display text-[15px] font-semibold text-[#09090B] dark:text-[#FAFAFA]"
                >
                  {editingWorkspace ? '空间设置' : '新建工作空间'}
                </h2>
                <p className="mt-0.5 text-[12px] text-[#71717A] dark:text-[#A1A1AA]">
                  自定义空间标题、补充信息字段与公开访问方式
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭弹窗"
                className="p-1.5 text-[#71717A] hover:text-[#09090B] dark:hover:text-white rounded-lg hover:bg-[#F4F4F5] dark:hover:bg-[#1F1F23] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form id={uid} onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto overscroll-contain">
              {errorMsg && (
                <div
                  role="alert"
                  className="px-3.5 py-2 text-xs text-[#B91C1C] dark:text-[#FCA5A5] bg-[#FEF2F2] dark:bg-[#2B1414] border border-[#FECACA] dark:border-[#7F1D1D] rounded-lg"
                >
                  {errorMsg}
                </div>
              )}

              <div>
                <label
                  htmlFor={`${uid}-name`}
                  className="block text-xs font-medium text-[#27272A] dark:text-[#E4E4E7] mb-1.5"
                >
                  空间标题 *
                </label>
                <input
                  id={`${uid}-name`}
                  type="text"
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：工作台 / 设计资源 / 团队共享"
                  className="w-full h-9 px-3 text-[13px] bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:border-[#09090B] dark:focus:border-[#FAFAFA] ring-inset focus:ring-1 focus:ring-[#09090B] dark:focus:ring-[#FAFAFA] transition-[border-color,box-shadow]"
                />
              </div>

              <div>
                <label
                  htmlFor={`${uid}-desc`}
                  className="block text-xs font-medium text-[#27272A] dark:text-[#E4E4E7] mb-1.5"
                >
                  空间描述（可选）
                </label>
                <textarea
                  id={`${uid}-desc`}
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="简单说明该工作空间的用途..."
                  className="w-full px-3 py-2 text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:border-[#09090B] dark:focus:border-[#FAFAFA] ring-inset focus:ring-1 focus:ring-[#09090B] dark:focus:ring-[#FAFAFA] transition-[border-color,box-shadow]"
                />
              </div>

              <div className="pt-2 border-t border-[#E4E4E7] dark:border-[#27272A] space-y-2.5">
                <div>
                  <span className="block text-xs font-medium text-[#09090B] dark:text-[#FAFAFA]">
                    可选补充信息字段（固定 3 个槽位，留空不启用）
                  </span>
                  <span className="block text-[11px] text-[#71717A] dark:text-[#A1A1AA]">
                    为本空间自定义补充信息字段名及展示位置，固定槽位避免卡片信息过载
                  </span>
                </div>

                <div className="space-y-2">
                  {customFields.map((field, idx) => (
                    <div key={field.key} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                      <div className="sm:col-span-6">
                        <label htmlFor={`${uid}-cf-${field.key}`} className="sr-only">
                          自定义字段 {idx + 1} 名称
                        </label>
                        <input
                          id={`${uid}-cf-${field.key}`}
                          type="text"
                          value={field.label}
                          onChange={(e) =>
                            setCustomFields((prev) =>
                              prev.map((item) =>
                                item.key === field.key ? { ...item, label: e.target.value } : item
                              )
                            )
                          }
                          placeholder={`字段 ${idx + 1}：${CUSTOM_FIELD_PLACEHOLDERS[idx] || ''}`}
                          className="w-full h-9 px-3 text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:border-[#09090B] dark:focus:border-[#FAFAFA] ring-inset focus:ring-1 focus:ring-[#09090B] dark:focus:ring-[#FAFAFA] transition-[border-color,box-shadow]"
                        />
                      </div>
                      <div className="sm:col-span-6">
                        <CustomSelect<CustomFieldPlacement>
                          ariaLabel={`字段 ${idx + 1} 显示位置`}
                          value={field.placement}
                          onChange={(placement) =>
                            setCustomFields((prev) =>
                              prev.map((item) =>
                                item.key === field.key ? { ...item, placement } : item
                              )
                            )
                          }
                          fullWidth
                          size="md"
                          align="right"
                          options={CUSTOM_FIELD_PLACEMENT_OPTIONS.map((opt) => ({
                            value: opt.value,
                            label: opt.label,
                          }))}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-[#E4E4E7] dark:border-[#27272A] space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span
                      id={`${uid}-public-label`}
                      className="block text-xs font-medium text-[#09090B] dark:text-[#FAFAFA]"
                    >
                      公开访问该空间
                    </span>
                    <span className="block text-[11px] text-[#71717A] dark:text-[#A1A1AA]">
                      开启后可通过自定义路由或独立域名免登录查看与跳转
                    </span>
                  </div>
                  <button
                    id={`${uid}-public`}
                    type="button"
                    role="switch"
                    aria-checked={isPublic}
                    aria-labelledby={`${uid}-public-label`}
                    onClick={() => setIsPublic((v) => !v)}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-white focus-visible:ring-offset-1 ${
                      isPublic
                        ? 'bg-[#09090B] dark:bg-[#FAFAFA] border-[#09090B] dark:border-[#FAFAFA]'
                        : 'bg-[#E4E4E7] dark:bg-[#27272A] border-[#D4D4D8] dark:border-[#3F3F46]'
                    }`}
                  >
                    <motion.span
                      layout
                      transition={{ type: 'spring', stiffness: 540, damping: 34 }}
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white dark:bg-[#09090B] shadow-sm ${
                        isPublic ? 'translate-x-[18px]' : 'translate-x-[2px]'
                      }`}
                    />
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {isPublic && (
                    <motion.div
                      initial={{ height: 0, opacity: 0, overflow: 'hidden' }}
                      animate={{ height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } }}
                      exit={{ height: 0, opacity: 0, overflow: 'hidden' }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      className="space-y-3"
                    >
                      <div>
                        <label
                          htmlFor={`${uid}-domain`}
                          className="block text-xs font-medium text-[#27272A] dark:text-[#E4E4E7] mb-1.5"
                        >
                          公开访问域名（可选，默认 https://）
                        </label>
                        <input
                          id={`${uid}-domain`}
                          type="text"
                          spellCheck={false}
                          value={publicDomain}
                          onChange={(e) => setPublicDomain(e.target.value)}
                          placeholder="例如：nav.example.com 或 http://nav.lan:3000"
                          className="w-full h-9 px-3 font-mono text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:border-[#09090B] dark:focus:border-[#FAFAFA] ring-inset focus:ring-1 focus:ring-[#09090B] dark:focus:ring-[#FAFAFA] transition-[border-color,box-shadow]"
                        />
                        <p className="mt-1 text-[11px] text-[#71717A] dark:text-[#A1A1AA]">
                          将独立域名 DNS 解析到本服务后，访客直接打开该域名即可访问此工作空间
                        </p>
                      </div>

                      <div>
                        <label
                          htmlFor={`${uid}-route`}
                          className="block text-xs font-medium text-[#27272A] dark:text-[#E4E4E7] mb-1.5"
                        >
                          {normalizedPreviewDomain
                            ? '自定义访问路由（填域名后可选，默认根路径 /）'
                            : '自定义访问路由 *'}
                        </label>
                        <input
                          id={`${uid}-route`}
                          type="text"
                          spellCheck={false}
                          value={publicRoute}
                          onChange={(e) => setPublicRoute(e.target.value)}
                          placeholder={
                            normalizedPreviewDomain
                              ? '留空则直接通过域名根目录 / 访问'
                              : '/team 或 /share/links'
                          }
                          className="w-full h-9 px-3 font-mono text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:border-[#09090B] dark:focus:border-[#FAFAFA] ring-inset focus:ring-1 focus:ring-[#09090B] dark:focus:ring-[#FAFAFA] transition-[border-color,box-shadow]"
                        />
                      </div>

                      {isCurrentHostRootConflict && (
                        <div className="px-3 py-2 text-[11px] text-[#B45309] dark:text-[#FCD34D] bg-[#FFFBEB] dark:bg-[#29200D] border border-[#FDE68A] dark:border-[#78350F] rounded-lg leading-relaxed">
                          提示：您填写了当前管理端正在使用的域名且未指定子路径，保存后访问首页 / 将直接进入公开页面。建议使用独立子域名或附加自定义路由。
                        </div>
                      )}

                      {fullPublicUrl && (
                        <div className="px-3 py-2 bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] text-[#52525B] dark:text-[#A1A1AA] truncate">
                              {fullPublicUrl}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={handleCopyPublicUrl}
                                aria-label="复制公开访问地址"
                                title="复制地址"
                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-[#52525B] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-white hover:bg-white dark:hover:bg-[#27272A] rounded-md transition-colors"
                              >
                                {copiedUrl ? (
                                  <Check className="w-3 h-3 text-[#16A34A]" aria-hidden="true" />
                                ) : (
                                  <Copy className="w-3 h-3" aria-hidden="true" />
                                )}
                                <span>{copiedUrl ? '已复制' : '复制'}</span>
                              </button>
                            </div>
                          </div>

                          {isSavedPublicUnchanged ? (
                            <div className="flex items-center justify-end gap-2 pt-1.5 border-t border-[#E4E4E7]/70 dark:border-[#27272A]/70">
                              {normalizedPreviewDomain && previewTargetHref && (
                                <a
                                  href={previewTargetHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-[#52525B] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-white bg-white dark:bg-[#111113] border border-[#E4E4E7] dark:border-[#27272A] rounded-md transition-colors"
                                >
                                  <Eye className="w-3 h-3" aria-hidden="true" />
                                  <span>本地预览</span>
                                </a>
                              )}
                              <a
                                href={fullPublicUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-[#09090B] dark:text-[#FAFAFA] bg-white dark:bg-[#111113] border border-[#E4E4E7] dark:border-[#27272A] hover:border-[#A1A1AA] dark:hover:border-[#3F3F46] rounded-md transition-colors"
                              >
                                <span>跳转公开页</span>
                                <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                              </a>
                            </div>
                          ) : (
                            <p className="text-[11px] text-[#71717A] dark:text-[#A1A1AA]">
                              保存设置后可直接预览或跳转该公开访问页面
                            </p>
                          )}
                        </div>
                      )}

                      <p className="text-[11px] text-[#71717A] dark:text-[#A1A1AA] leading-relaxed">
                        权限保护：公开访问仅下发站点名称与跳转链接，不包含用户名、密码或自动登录凭据，且访客不可编辑。
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </form>

            <div className="px-6 py-3.5 border-t border-[#E4E4E7] dark:border-[#27272A] bg-[#FAFAFA] dark:bg-[#0D0D0F] flex items-center justify-between gap-3">
              {editingWorkspace && canDelete ? (
                confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onDelete(editingWorkspace.id)}
                      className="h-8 px-3 text-xs font-medium text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-lg transition-colors"
                    >
                      {nodeCount > 0 ? `删除空间及 ${nodeCount} 个站点` : '确认删除空间'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="h-8 px-2 text-xs text-[#71717A] hover:text-[#09090B] dark:hover:text-white"
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
                    <span>删除空间</span>
                  </button>
                )
              ) : (
                <span className="text-[11px] text-[#A1A1AA]">
                  {editingWorkspace ? '至少保留一个默认空间' : ''}
                </span>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-8 px-3.5 text-xs font-medium text-[#52525B] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-white hover:bg-[#F4F4F5] dark:hover:bg-[#1F1F23] rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  form={uid}
                  disabled={saving}
                  className="h-8 px-4 text-xs font-medium text-white bg-[#09090B] hover:bg-[#27272A] dark:bg-[#FAFAFA] dark:text-[#09090B] dark:hover:bg-[#E4E4E7] rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition-colors disabled:opacity-50"
                >
                  {saving ? '保存中...' : editingWorkspace ? '保存设置' : '创建空间'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
