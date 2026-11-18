import { useEffect, useId, useRef, useState } from 'react';
import { Activity, ArrowRight, Eye, EyeOff, Loader2, Server, Upload } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { GroupCombobox } from './CustomSelect';
import type { PanelNode, PanelProbeResult, Workspace } from '../types/panel';
import { probePanelNode } from '../utils/auth';
import {
  buildPanelTargetUrl,
  normalizeBaseUrl,
  normalizeEntrance,
  splitFullPanelUrl,
} from '../utils/userscript';

interface FirstPanelOnboardingProps {
  workspace: Workspace;
  bridgeActive: boolean;
  existingGroups?: string[];
  onSaveFirstNode: (nodeData: Omit<PanelNode, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onOpenImport: () => void;
  onOpenBridge: () => void;
}

export function FirstPanelOnboarding({
  workspace,
  bridgeActive,
  existingGroups,
  onSaveFirstNode,
  onOpenImport,
  onOpenBridge,
}: FirstPanelOnboardingProps) {
  const formId = useId();
  const groupSuggestions =
    existingGroups && existingGroups.length > 0 ? existingGroups : workspace.groups;

  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [entrance, setEntrance] = useState('');
  const [autoFill, setAutoFill] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [autoSubmit, setAutoSubmit] = useState(true);
  const [group, setGroup] = useState(groupSuggestions[0] || '默认分组');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<PanelProbeResult | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const showError = (msg: string) => {
    setErrorMsg(msg);
    requestAnimationFrame(() => {
      errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  useEffect(() => {
    setGroup(workspace.groups[0] || '默认分组');
    setErrorMsg('');
    setProbeResult(null);
  }, [workspace.id, workspace.groups]);

  const handleUrlBlur = () => {
    if (!baseUrl.trim()) return;
    const split = splitFullPanelUrl(baseUrl, workspace.panelType || 'custom');
    if (split.baseUrl) setBaseUrl(split.baseUrl);
    if (split.entrance && !entrance.trim()) setEntrance(split.entrance);
  };

  const handleTestProbe = async () => {
    const normalizedUrl = normalizeBaseUrl(baseUrl);
    if (!normalizedUrl) {
      showError('请先填写访问地址（例如 https://console.example.com:8080）再进行测试。');
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
        version: 'v2',
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
    const split =
      !entrance.trim() && baseUrl.trim()
        ? splitFullPanelUrl(baseUrl, workspace.panelType || 'custom')
        : { baseUrl, entrance };
    const normUrl = normalizeBaseUrl(split.baseUrl || baseUrl);
    const normEntrance = normalizeEntrance(entrance.trim() ? entrance : split.entrance);

    if (!name.trim()) {
      showError('请填写站点名称。');
      return;
    }
    if (!normUrl) {
      showError('请填写有效的访问地址（支持 http:// 或 https://）。');
      return;
    }
    if (autoFill && !username.trim()) {
      showError('开启自动登录填充时，请填写登录用户名。');
      return;
    }

    setErrorMsg('');
    try {
      onSaveFirstNode({
        workspaceId: workspace.id,
        name: name.trim(),
        baseUrl: normUrl,
        entrance: normEntrance,
        username: autoFill ? username.trim() : '',
        password: autoFill ? password : '',
        group: group.trim() || groupSuggestions[0] || '默认分组',
        provider: '',
        region: '',
        version: 'v2',
        autoSubmit: autoFill ? autoSubmit : false,
        probe: probeResult ?? undefined,
      });
    } catch (err) {
      showError(err instanceof Error ? err.message : '保存站点失败，请重试。');
    }
  };

  const previewTarget = buildPanelTargetUrl({
    baseUrl: normalizeBaseUrl(baseUrl) || 'https://console.example.com',
    entrance: normalizeEntrance(entrance),
  });

  return (
    <motion.div
      key={workspace.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="min-h-[58vh] flex flex-col items-center justify-center py-6"
    >
      <div className="w-full max-w-lg bg-white dark:bg-[#111113] border border-[#E4E4E7] dark:border-[#27272A] rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.05)] dark:shadow-[0_16px_44px_rgba(0,0,0,0.4)] overflow-hidden">
        <div className="px-6 py-5 border-b border-[#E4E4E7] dark:border-[#27272A] flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] bg-[#FAFAFA] dark:bg-[#18181B] flex items-center justify-center text-[#09090B] dark:text-[#FAFAFA] shrink-0">
            <Server className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-display text-[15px] font-semibold text-[#09090B] dark:text-[#FAFAFA]">
              为「{workspace.name}」添加第一个站点
            </h1>
            <p className="mt-0.5 text-[12px] text-[#71717A] dark:text-[#A1A1AA] leading-relaxed">
              填写站点名称与访问地址即可生成快捷卡片；如需免密填充，可按需开启自动登录。
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <AnimatePresence>
            {errorMsg && (
              <motion.div
                ref={errorRef}
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
              站点名称 *
            </label>
            <input
              id={`${formId}-name`}
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：监控中心 / 代码仓库 / 路由器后台"
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
                placeholder="https://console.example.com:8080"
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
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium border border-[#E4E4E7] dark:border-[#27272A] bg-white dark:bg-[#111113] hover:bg-[#F4F4F5] dark:hover:bg-[#1F1F23] rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
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
              环境分组
            </label>
            <GroupCombobox
              id={`${formId}-group`}
              value={group}
              onChange={setGroup}
              suggestions={groupSuggestions}
              placeholder={groupSuggestions[0] || '默认分组'}
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
                  开启后可保存账号密码，跳转时自动填充表单
                </span>
              </div>
              <button
                id={`${formId}-autofill`}
                type="button"
                role="switch"
                aria-checked={autoFill}
                aria-labelledby={`${formId}-autofill-label`}
                onClick={() => setAutoFill((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150 ${
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
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#71717A] hover:text-[#09090B] dark:hover:text-white rounded"
                        >
                          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <label className="inline-flex items-center gap-2 text-xs text-[#52525B] dark:text-[#A1A1AA] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoSubmit}
                      onChange={(e) => setAutoSubmit(e.target.checked)}
                      className="rounded border-[#D4D4D8] text-[#09090B] focus:ring-[#09090B]"
                    />
                    <span>填充后自动提交表单（检测到验证码或 MFA 时自动暂停）</span>
                  </label>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="pt-2">
            <motion.button
              type="submit"
              whileTap={{ scale: 0.985 }}
              className="w-full h-9 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-white bg-[#09090B] hover:bg-[#27272A] dark:bg-[#FAFAFA] dark:text-[#09090B] dark:hover:bg-[#E4E4E7] rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition-colors"
            >
              <span>保存站点并进入「{workspace.name}」</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </motion.button>
          </div>
        </form>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs text-[#71717A] dark:text-[#A1A1AA]">
        <button
          type="button"
          onClick={onOpenImport}
          className="inline-flex items-center gap-1.5 hover:text-[#09090B] dark:hover:text-white transition-colors"
        >
          <Upload className="w-3.5 h-3.5" aria-hidden="true" />
          <span>从 CSV / JSON 批量导入到此空间</span>
        </button>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          onClick={onOpenBridge}
          className="hover:text-[#09090B] dark:hover:text-white transition-colors"
        >
          {bridgeActive ? '自动登录脚本已就绪' : '安装 Tampermonkey 自动登录脚本'}
        </button>
      </div>
    </motion.div>
  );
}
