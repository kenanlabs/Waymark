import { useEffect, useId, useMemo, useState } from 'react';
import {
  Activity,
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { CustomSelect, GroupCombobox } from './CustomSelect';
import type {
  CustomFieldKey,
  CustomFieldPlacement,
  PanelNode,
  PanelProbeResult,
  Workspace,
  WorkspaceCustomFieldDef,
} from '../types/panel';
import { probePanelNode } from '../utils/auth';
import {
  buildPanelTargetUrl,
  normalizeBaseUrl,
  normalizeEntrance,
  splitFullPanelUrl,
} from '../utils/userscript';
import {
  CUSTOM_FIELD_PLACEMENT_OPTIONS,
  FIXED_CUSTOM_FIELD_KEYS,
  getActiveWorkspaceCustomFields,
  normalizeWorkspaceCustomFields,
} from '../utils/workspacePresets';

interface PanelDrawerProps {
  open: boolean;
  workspace: Workspace;
  editingNode: PanelNode | null;
  defaultGroup?: string;
  existingGroups: string[];
  onClose: () => void;
  onSave: (nodeData: Omit<PanelNode, 'id' | 'createdAt' | 'updatedAt'>, existingId?: string) => void;
  onUpdateWorkspaceFields?: (fields: WorkspaceCustomFieldDef[]) => void;
  onDelete: (id: string) => void;
}

const SLOT_PLACEHOLDERS = [
  '例如：所属环境 / 部门 / 地域',
  '例如：归属团队 / 线路 / 用途',
  '例如：备注说明 / 负责人 / 到期时间',
];

function placementShortLabel(placement: CustomFieldPlacement): string {
  const found = CUSTOM_FIELD_PLACEMENT_OPTIONS.find((o) => o.value === placement);
  return found ? found.shortLabel : '仅详细';
}

export function PanelDrawer({
  open,
  workspace,
  editingNode,
  defaultGroup,
  existingGroups,
  onClose,
  onSave,
  onUpdateWorkspaceFields,
  onDelete,
}: PanelDrawerProps) {
  const formId = useId();
  const errorId = `${formId}-error`;

  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [entrance, setEntrance] = useState('');
  const [autoFill, setAutoFill] = useState(false);
  const [authMode, setAuthMode] = useState<'form' | 'basic'>('form');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [autoSubmit, setAutoSubmit] = useState(true);
  const [group, setGroup] = useState('默认分组');
  const [customValues, setCustomValues] = useState<Record<CustomFieldKey, string>>({
    field1: '',
    field2: '',
    field3: '',
  });
  const [draftFields, setDraftFields] = useState<WorkspaceCustomFieldDef[]>(() =>
    normalizeWorkspaceCustomFields(workspace.customFields)
  );
  const [editingFieldDefs, setEditingFieldDefs] = useState(false);
  const [showOptional, setShowOptional] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<PanelProbeResult | null>(null);

  const activeCustomFields = useMemo(
    () => getActiveWorkspaceCustomFields(workspace.customFields),
    [workspace.customFields]
  );

  useEffect(() => {
    if (!open) return;
    setErrorMsg('');
    setConfirmDelete(false);
    setConfirmDiscard(false);
    setProbeResult(editingNode?.probe ?? null);
    setShowPassword(false);

    const normalizedDefs = normalizeWorkspaceCustomFields(workspace.customFields);
    setDraftFields(normalizedDefs);
    const hasConfiguredDefs = normalizedDefs.some((d) => Boolean(d.label.trim()));
    setEditingFieldDefs(!hasConfiguredDefs);

    if (editingNode) {
      const hasCreds = Boolean(editingNode.username || editingNode.password);
      const nextVals: Record<CustomFieldKey, string> = {
        field1: editingNode.customValues?.field1 || '',
        field2: editingNode.customValues?.field2 || '',
        field3: editingNode.customValues?.field3 || '',
      };
      setName(editingNode.name);
      setBaseUrl(editingNode.baseUrl);
      setEntrance(editingNode.entrance);
      setAutoFill(hasCreds);
      setAuthMode(editingNode.authMode === 'basic' ? 'basic' : 'form');
      setUsername(editingNode.username);
      setPassword(editingNode.password);
      setAutoSubmit(editingNode.autoSubmit);
      setGroup(editingNode.group || '默认分组');
      setCustomValues(nextVals);
      setShowOptional(true);
    } else {
      setName('');
      setBaseUrl('');
      setEntrance('');
      setAutoFill(false);
      setAuthMode('form');
      setUsername('');
      setPassword('');
      setAutoSubmit(true);
      setGroup(
        defaultGroup && defaultGroup !== 'all'
          ? defaultGroup
          : workspace.groups[0] || '默认分组'
      );
      setCustomValues({ field1: '', field2: '', field3: '' });
      setShowOptional(true);
    }
  }, [open, editingNode, workspace, defaultGroup]);

  const isDirty = useMemo(() => {
    if (!open) return false;
    const hasCustomVal = Boolean(
      customValues.field1 || customValues.field2 || customValues.field3
    );
    if (!editingNode) {
      return Boolean(name || baseUrl || entrance || username || password || hasCustomVal);
    }
    const origHasCreds = Boolean(editingNode.username || editingNode.password);
    return (
      name !== editingNode.name ||
      baseUrl !== editingNode.baseUrl ||
      entrance !== editingNode.entrance ||
      autoFill !== origHasCreds ||
      authMode !== (editingNode.authMode === 'basic' ? 'basic' : 'form') ||
      username !== editingNode.username ||
      password !== editingNode.password ||
      group !== (editingNode.group || '默认分组') ||
      autoSubmit !== editingNode.autoSubmit ||
      customValues.field1 !== (editingNode.customValues?.field1 || '') ||
      customValues.field2 !== (editingNode.customValues?.field2 || '') ||
      customValues.field3 !== (editingNode.customValues?.field3 || '')
    );
  }, [
    open,
    editingNode,
    name,
    baseUrl,
    entrance,
    autoFill,
    authMode,
    username,
    password,
    group,
    autoSubmit,
    customValues,
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
        message: '浏览器连通性探测异常，请检查网络或目标地址后重试。',
        checkedAt: new Date().toISOString(),
      });
    } finally {
      setProbing(false);
    }
  };

  const handleSaveFieldDefs = () => {
    const normalized = normalizeWorkspaceCustomFields(draftFields);
    setDraftFields(normalized);
    onUpdateWorkspaceFields?.(normalized);
    if (normalized.some((d) => Boolean(d.label.trim()))) {
      setEditingFieldDefs(false);
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

    if (editingFieldDefs && onUpdateWorkspaceFields) {
      const normalized = normalizeWorkspaceCustomFields(draftFields);
      const currentNorm = normalizeWorkspaceCustomFields(workspace.customFields);
      if (JSON.stringify(normalized) !== JSON.stringify(currentNorm)) {
        onUpdateWorkspaceFields(normalized);
      }
    }

    const cleanedValues: Partial<Record<CustomFieldKey, string>> = {};
    for (const key of FIXED_CUSTOM_FIELD_KEYS) {
      const val = (customValues[key] || '').trim();
      if (val) cleanedValues[key] = val;
    }

    onSave(
      {
        workspaceId: editingNode?.workspaceId ?? workspace.id,
        name: name.trim(),
        baseUrl: normUrl,
        entrance: normalizeEntrance(entrance),
        username: autoFill ? username.trim() : '',
        password: autoFill ? password : '',
        authMode,
        group: group.trim() || '默认分组',
        customValues: Object.keys(cleanedValues).length > 0 ? cleanedValues : undefined,
        version: editingNode?.version ?? 'v2',
        autoSubmit: autoFill && authMode === 'form' ? autoSubmit : false,
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

  const optionalSubtitle =
    activeCustomFields.length > 0
      ? `（${activeCustomFields.map((f) => f.label).join(' / ')}）`
      : '（按空间自定义字段）';

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
              className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-6 py-5 space-y-4"
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
                  className="w-full h-9 px-3 text-[13px] bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:border-[#09090B] dark:focus:border-[#FAFAFA] ring-inset focus:ring-1 focus:ring-[#09090B] dark:focus:ring-[#FAFAFA] transition-[border-color,box-shadow]"
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
                    className="w-full h-9 px-3 font-mono text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:border-[#09090B] dark:focus:border-[#FAFAFA] ring-inset focus:ring-1 focus:ring-[#09090B] dark:focus:ring-[#FAFAFA] transition-[border-color,box-shadow]"
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
                    className="w-full h-9 px-3 font-mono text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:border-[#09090B] dark:focus:border-[#FAFAFA] ring-inset focus:ring-1 focus:ring-[#09090B] dark:focus:ring-[#FAFAFA] transition-[border-color,box-shadow]"
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
                        ? 'wm-switch-on'
                        : 'bg-[#E4E4E7] dark:bg-[#27272A] border-[#D4D4D8] dark:border-[#3F3F46]'
                    }`}
                  >
                    <motion.span
                      layout
                      transition={{ type: 'spring', stiffness: 540, damping: 34 }}
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm ${
                        autoFill ? 'translate-x-[18px]' : 'translate-x-[2px]'
                      }`}
                    />
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {autoFill && (
                    <motion.div
                      initial={{ height: 0, opacity: 0, overflow: 'hidden' }}
                      animate={{ height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } }}
                      exit={{ height: 0, opacity: 0, overflow: 'hidden' }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      className="space-y-3"
                    >
                      <div>
                        <label
                          htmlFor={`${formId}-authmode`}
                          className="block text-xs font-medium text-[#27272A] dark:text-[#E4E4E7] mb-1.5"
                        >
                          认证方式
                        </label>
                        <CustomSelect<'form' | 'basic'>
                          id={`${formId}-authmode`}
                          ariaLabel="认证方式"
                          value={authMode}
                          onChange={(val) => setAuthMode(val)}
                          align="left"
                          fullWidth
                          size="md"
                          options={[
                            { value: 'form', label: '表单自动填充（默认）' },
                            { value: 'basic', label: 'HTTP Basic 认证（Nginx 等）' },
                          ]}
                        />
                        <p className="mt-1.5 text-[11px] text-[#71717A] dark:text-[#A1A1AA]">
                          {authMode === 'basic'
                            ? '点击卡片时，Waymark 会将用户名与密码写入启动链接，由浏览器直接完成 HTTP Basic 原生认证。'
                            : '已安装 Waymark 浏览器插件或油猴脚本时，打开登录页将自动填充账号密码；若存在未勾选协议，仅填充不自动提交。'}
                        </p>
                      </div>

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
                            data-bwignore="true"
                            data-1p-ignore="true"
                            data-lpignore="true"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="admin"
                            className="w-full h-9 px-3 font-mono text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:border-[#09090B] dark:focus:border-[#FAFAFA] ring-inset focus:ring-1 focus:ring-[#09090B] dark:focus:ring-[#FAFAFA] transition-[border-color,box-shadow]"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor={`${formId}-pass`}
                            className="block text-xs font-medium text-[#27272A] dark:text-[#E4E4E7] mb-1.5"
                          >
                            登录密码
                          </label>
                          <div className="relative overflow-x-clip rounded-lg">
                            <input
                              id={`${formId}-pass`}
                              type={showPassword ? 'text' : 'password'}
                              spellCheck={false}
                              autoComplete="new-password"
                              data-bwignore="true"
                              data-1p-ignore="true"
                              data-lpignore="true"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="登录密码"
                              className="w-full h-9 pl-3 pr-9 font-mono text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:border-[#09090B] dark:focus:border-[#FAFAFA] ring-inset focus:ring-1 focus:ring-[#09090B] dark:focus:ring-[#FAFAFA] transition-[border-color,box-shadow]"
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

                      {authMode === 'form' && (
                        <div className="flex items-center gap-2.5">
                          <button
                            id={`${formId}-autosubmit`}
                            type="button"
                            role="switch"
                            aria-checked={autoSubmit}
                            onClick={() => setAutoSubmit((v) => !v)}
                            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-white focus-visible:ring-offset-1 ${
                              autoSubmit
                                ? 'wm-switch-on'
                                : 'bg-[#E4E4E7] dark:bg-[#27272A] border-[#D4D4D8] dark:border-[#3F3F46]'
                            }`}
                          >
                            <motion.span
                              layout
                              transition={{ type: 'spring', stiffness: 540, damping: 34 }}
                              aria-hidden="true"
                              className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm ${
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
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="border border-[#E4E4E7] dark:border-[#27272A] rounded-xl">
                <button
                  type="button"
                  aria-expanded={showOptional}
                  onClick={() => setShowOptional((prev) => !prev)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-medium text-[#52525B] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-white bg-[#FAFAFA] dark:bg-[#16161A] transition-colors ${
                    showOptional ? 'rounded-t-xl' : 'rounded-xl'
                  }`}
                >
                  <span className="truncate">可选补充信息 {optionalSubtitle}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${
                      showOptional ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>
                <AnimatePresence initial={false}>
                  {showOptional && (
                    <motion.div
                      initial={{ height: 0, opacity: 0, overflow: 'hidden' }}
                      animate={{ height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } }}
                      exit={{ height: 0, opacity: 0, overflow: 'hidden' }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      className="border-t border-[#E4E4E7] dark:border-[#27272A]"
                    >
                      <div className="p-3.5 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-[#71717A] dark:text-[#A1A1AA]">
                            {editingFieldDefs
                              ? `配置「${workspace.name}」的自定义字段名与展示位置（固定 3 个槽位，留空不启用）`
                              : `当前空间已启用 ${activeCustomFields.length} 个补充信息字段`}
                          </span>
                          {onUpdateWorkspaceFields && activeCustomFields.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setDraftFields(normalizeWorkspaceCustomFields(workspace.customFields));
                                setEditingFieldDefs((v) => !v);
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-[#52525B] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-white whitespace-nowrap shrink-0"
                            >
                              <SlidersHorizontal className="w-3 h-3" aria-hidden="true" />
                              <span>{editingFieldDefs ? '返回填写值' : '配置本空间字段'}</span>
                            </button>
                          )}
                        </div>

                        {editingFieldDefs ? (
                          <div className="space-y-2.5">
                            {draftFields.map((field, idx) => (
                              <div
                                key={field.key}
                                className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                              >
                                <div className="sm:col-span-6">
                                  <label
                                    htmlFor={`${formId}-def-${field.key}`}
                                    className="sr-only"
                                  >
                                    字段 {idx + 1} 名称
                                  </label>
                                  <input
                                    id={`${formId}-def-${field.key}`}
                                    type="text"
                                    value={field.label}
                                    onChange={(e) =>
                                      setDraftFields((prev) =>
                                        prev.map((item) =>
                                          item.key === field.key
                                            ? { ...item, label: e.target.value }
                                            : item
                                        )
                                      )
                                    }
                                    placeholder={`字段 ${idx + 1}：${SLOT_PLACEHOLDERS[idx] || ''}`}
                                    className="w-full h-9 px-3 text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:border-[#09090B] dark:focus:border-[#FAFAFA] ring-inset focus:ring-1 focus:ring-[#09090B] dark:focus:ring-[#FAFAFA] transition-[border-color,box-shadow]"
                                  />
                                </div>
                                <div className="sm:col-span-6">
                                  <CustomSelect<CustomFieldPlacement>
                                    ariaLabel={`字段 ${idx + 1} 显示位置`}
                                    value={field.placement}
                                    onChange={(placement) =>
                                      setDraftFields((prev) =>
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
                            {onUpdateWorkspaceFields && (
                              <div className="flex items-center justify-end gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={handleSaveFieldDefs}
                                  className="wm-btn-primary h-8 px-3 text-xs font-medium rounded-lg transition-colors"
                                >
                                  保存字段配置并填写
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {activeCustomFields.map((field) => (
                              <div key={field.key}>
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                  <label
                                    htmlFor={`${formId}-val-${field.key}`}
                                    className="text-xs font-medium text-[#27272A] dark:text-[#E4E4E7]"
                                  >
                                    {field.label}
                                  </label>
                                  <span className="text-[11px] text-[#71717A] dark:text-[#A1A1AA]">
                                    位置：{placementShortLabel(field.placement)}
                                  </span>
                                </div>
                                <input
                                  id={`${formId}-val-${field.key}`}
                                  type="text"
                                  value={customValues[field.key] || ''}
                                  onChange={(e) =>
                                    setCustomValues((prev) => ({
                                      ...prev,
                                      [field.key]: e.target.value,
                                    }))
                                  }
                                  placeholder={`填写${field.label}...`}
                                  className="w-full h-9 px-3 text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:border-[#09090B] dark:focus:border-[#FAFAFA] ring-inset focus:ring-1 focus:ring-[#09090B] dark:focus:ring-[#FAFAFA] transition-[border-color,box-shadow]"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
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
                  className="wm-btn-primary h-8 px-4 text-xs font-medium rounded-lg transition-[background-color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] dark:focus-visible:ring-white focus-visible:ring-offset-2"
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
