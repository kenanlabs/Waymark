import { useId, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  KeyRound,
  Lock,
  LogOut,
  Puzzle,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Unlock,
  Upload,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { EncryptedVaultEnvelope, PanelNode, Workspace } from '../types/panel';
import { changeAdminPassword } from '../utils/auth';
import { candidatesToPanelNodes, parseBatchInput } from '../utils/batchParser';
import { decryptVaultBundle, encryptVaultNodes } from '../utils/crypto';
import { EXTENSION_VERSION } from '../utils/extensionMeta';
import { BRIDGE_VERSION, generateUserscriptSource } from '../utils/userscript';

export type SettingsTab = 'bridge' | 'import' | 'security';

interface SettingsModalProps {
  open: boolean;
  initialTab: SettingsTab;
  nodes: PanelNode[];
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  extensionActive: boolean;
  extensionVersion?: string | null;
  bridgeActive: boolean;
  bridgeVersion?: string | null;
  hasMasterLock: boolean;
  adminUsername?: string;
  envManaged?: boolean;
  onLogout: () => void;
  onClose: () => void;
  onImportNodes: (nodes: PanelNode[], replaceAll?: boolean, importedWorkspaces?: Workspace[]) => void;
  onEnableMasterLock: (passphrase: string) => Promise<void>;
  onDisableMasterLock: () => void;
  onLockNow: () => void;
  onClearAll: () => void;
  onCopy: (label: string, value: string) => void;
  onNotify: (msg: string) => void;
}

const FORMAT_GUIDE_PLACEHOLDER = `文档中心, https://docs.example.com, admin, Pass123456, , 办公协作, 自建
团队网盘, https://drive.example.com, user01, DrivePass#99, , 资料库, 云服务
本地知识库, http://192.168.10.50:8080, , , /wiki, 默认分组, 内网`;

export function SettingsModal({
  open,
  initialTab,
  nodes,
  workspaces,
  activeWorkspace,
  extensionActive,
  extensionVersion,
  bridgeActive,
  bridgeVersion,
  hasMasterLock,
  adminUsername,
  envManaged,
  onLogout,
  onClose,
  onImportNodes,
  onEnableMasterLock,
  onDisableMasterLock,
  onLockNow,
  onClearAll,
  onCopy,
  onNotify,
}: SettingsModalProps) {
  const uid = useId();
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedExtUrl, setCopiedExtUrl] = useState(false);
  const [showScriptCode, setShowScriptCode] = useState(false);
  const [showUserscriptFallback, setShowUserscriptFallback] = useState(false);

  // Batch import state
  const [rawText, setRawText] = useState('');
  const parsed = useMemo(() => parseBatchInput(rawText), [rawText]);
  const validCount = useMemo(() => parsed.filter((r) => r.valid).length, [parsed]);

  // Admin password change state
  const [curAdminPass, setCurAdminPass] = useState('');
  const [newAdminPass, setNewAdminPass] = useState('');
  const [adminPassMsg, setAdminPassMsg] = useState('');
  const [adminPassOk, setAdminPassOk] = useState(false);
  const [updatingAdminPass, setUpdatingAdminPass] = useState(false);

  // Vault security state
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [lockError, setLockError] = useState('');
  const [exportPass, setExportPass] = useState('');
  const [importPass, setImportPass] = useState('');
  const [pendingEncryptedEnvelope, setPendingEncryptedEnvelope] =
    useState<EncryptedVaultEnvelope | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setLastOpen(true);
    setTab(initialTab);
    setConfirmClear(false);
    setLockError('');
    setAdminPassMsg('');
    setAdminPassOk(false);
  } else if (!open && lastOpen) {
    setLastOpen(false);
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const scriptSource = useMemo(() => generateUserscriptSource(origin), [origin]);

  const handleCopyScript = () => {
    onCopy('桥接脚本源码', scriptSource);
    setCopiedScript(true);
    window.setTimeout(() => setCopiedScript(false), 1500);
  };

  const handleCopyExtensionsUrl = () => {
    onCopy('扩展管理页地址', 'chrome://extensions');
    setCopiedExtUrl(true);
    window.setTimeout(() => setCopiedExtUrl(false), 1500);
  };

  const handleConfirmImport = () => {
    const newNodes = candidatesToPanelNodes(parsed, activeWorkspace.id);
    if (newNodes.length === 0) return;
    onImportNodes(newNodes, false);
    setRawText('');
    onClose();
  };

  const handleChangeAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminPassMsg('');
    setAdminPassOk(false);
    if (!curAdminPass) {
      setAdminPassMsg('请输入当前管理员密码。');
      return;
    }
    if (newAdminPass.length < 6) {
      setAdminPassMsg('新管理员密码至少需要 6 位。');
      return;
    }
    setUpdatingAdminPass(true);
    const res = await changeAdminPassword(curAdminPass, newAdminPass);
    setUpdatingAdminPass(false);
    setAdminPassOk(res.ok);
    setAdminPassMsg(res.message);
    if (res.ok) {
      setCurAdminPass('');
      setNewAdminPass('');
      onNotify('管理员密码已更新');
    }
  };

  const handleSetPassphrase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pass1.length < 6) {
      setLockError('主密码长度至少需要 6 位。');
      return;
    }
    if (pass1 !== pass2) {
      setLockError('两次输入的主密码不一致。');
      return;
    }
    setLockError('');
    try {
      await onEnableMasterLock(pass1);
      setPass1('');
      setPass2('');
    } catch (err) {
      setLockError(err instanceof Error ? err.message : '启用主密码加密失败');
    }
  };

  const triggerDownload = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportEncrypted = async () => {
    if (exportPass.length < 4) {
      onNotify('请先设置至少 4 位加密口令');
      return;
    }
    try {
      const envelope = await encryptVaultNodes(nodes, exportPass, workspaces);
      triggerDownload(
        `waymark-backup-${new Date().toISOString().slice(0, 10)}.vault.json`,
        JSON.stringify(envelope, null, 2),
        'application/json'
      );
      setExportPass('');
      onNotify('已导出加密备份文件');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : '导出加密备份失败');
    }
  };

  const handleExportCsv = () => {
    const wsMap = new Map(workspaces.map((w) => [w.id, w.name]));
    const header = 'workspace,name,baseUrl,entrance,username,password,group,provider,region';
    const esc = (v: string) => `"${String(v || '').replace(/"/g, '""')}"`;
    const rows = nodes.map((n) =>
      [
        esc(wsMap.get(n.workspaceId || '') || activeWorkspace.name),
        esc(n.name),
        esc(n.baseUrl),
        esc(n.entrance),
        esc(n.username),
        esc(n.password),
        esc(n.group),
        esc(n.provider),
        esc(n.region),
      ].join(',')
    );
    triggerDownload(
      `waymark-nodes-${new Date().toISOString().slice(0, 10)}.csv`,
      [header, ...rows].join('\n'),
      'text/csv;charset=utf-8'
    );
    onNotify('已导出 CSV 表格');
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    e.target.value = '';
    try {
      const parsedJson = JSON.parse(text);
      if (
        (parsedJson?.format === 'opsdeck-vault-v2' || parsedJson?.format === 'paneldeck-vault-v1') &&
        parsedJson.encrypted
      ) {
        setPendingEncryptedEnvelope(parsedJson as EncryptedVaultEnvelope);
        onNotify('请输入备份解密口令');
        return;
      }
      if (Array.isArray(parsedJson)) {
        onImportNodes(parsedJson as PanelNode[], false);
        onClose();
        return;
      }
      if (Array.isArray(parsedJson?.nodes)) {
        onImportNodes(
          parsedJson.nodes as PanelNode[],
          false,
          Array.isArray(parsedJson?.workspaces) ? (parsedJson.workspaces as Workspace[]) : undefined
        );
        onClose();
        return;
      }
      onNotify('无法识别该 JSON 文件格式');
    } catch {
      onNotify('读取备份失败，请确认文件为有效 JSON');
    }
  };

  const handleDecryptImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingEncryptedEnvelope) return;
    try {
      const recovered = await decryptVaultBundle(pendingEncryptedEnvelope, importPass);
      onImportNodes(recovered.nodes, false, recovered.workspaces);
      setPendingEncryptedEnvelope(null);
      setImportPass('');
      onClose();
    } catch {
      onNotify('解密失败，请核对口令是否正确');
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
            className="relative z-10 w-full max-w-2xl bg-white dark:bg-[#111113] border border-[#E4E4E7] dark:border-[#27272A] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[86vh]"
          >
            {/* Header with editorial underline tabs */}
            <div className="px-6 border-b border-[#E4E4E7] dark:border-[#27272A] flex items-center justify-between gap-4">
              <div className="flex items-center gap-6">
                <h2 id={`${uid}-title`} className="sr-only">
                  系统设置与工具
                </h2>
                {(
                  [
                    ['bridge', '插件与脚本'],
                    ['import', '批量导入'],
                    ['security', '安全与备份'],
                  ] as Array<[SettingsTab, string]>
                ).map(([id, label]) => {
                  const active = tab === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTab(id)}
                      className={`relative py-3.5 text-[13px] font-medium transition-colors whitespace-nowrap focus-visible:outline-none ${
                        active
                          ? 'text-[#09090B] dark:text-[#FAFAFA]'
                          : 'text-[#71717A] hover:text-[#09090B] dark:hover:text-[#FAFAFA]'
                      }`}
                    >
                      {label}
                      {active && (
                        <motion.span
                          layoutId="settings-tab-underline"
                          transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                          aria-hidden="true"
                          className="absolute inset-x-0 bottom-0 h-[2px] bg-[#09090B] dark:bg-[#FAFAFA]"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="关闭设置弹窗"
                className="p-1.5 text-[#71717A] hover:text-[#09090B] dark:hover:text-white hover:bg-[#F4F4F5] dark:hover:bg-[#1F1F23] rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto overscroll-contain">
              <AnimatePresence mode="wait">
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-5"
                >
                  {tab === 'bridge' && (
                    <div className="space-y-6">
                      {/* Primary: Dedicated Browser Extension (MV3) */}
                      <div className="space-y-4">
                        <div className="flex items-start gap-2.5">
                          {extensionActive ? (
                            <CheckCircle2 className="w-4 h-4 text-[#16A34A] mt-0.5 shrink-0" aria-hidden="true" />
                          ) : (
                            <Puzzle className="w-4 h-4 text-[#09090B] dark:text-[#FAFAFA] mt-0.5 shrink-0" aria-hidden="true" />
                          )}
                          <div>
                            <div className="text-sm font-medium text-[#09090B] dark:text-[#FAFAFA]">
                              {extensionActive ? (
                                <span>
                                  已连接 Waymark 浏览器插件{' '}
                                  <span className="font-mono tabular-nums text-xs text-[#71717A]">
                                    v{extensionVersion}
                                  </span>
                                </span>
                              ) : (
                                'Waymark 浏览器插件（Chrome / Edge 推荐）'
                              )}
                            </div>
                            <p className="mt-1.5 text-xs text-[#71717A] dark:text-[#A1A1AA] leading-relaxed">
                              相比油猴脚本，浏览器插件由扩展后台直接探测 HTTP 与内网地址，彻底告别「受限」与授权弹窗；并通过原生页面主环境注入自动填充账号密码，兼容 1Panel、Grafana、Portainer、KubeSphere 等单页后台。
                            </p>
                            {extensionActive &&
                              extensionVersion &&
                              extensionVersion !== EXTENSION_VERSION && (
                                <p className="mt-2 text-xs text-[#B45309] dark:text-[#FCD34D]">
                                  检测到旧版插件 v{extensionVersion}，建议下载 v{EXTENSION_VERSION} 重新覆盖加载以获得最新探测与填充修复。
                                </p>
                              )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5">
                          <a
                            href="/waymark-extension.zip"
                            download="waymark-extension.zip"
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#09090B] hover:bg-[#27272A] dark:bg-[#FAFAFA] dark:text-[#09090B] dark:hover:bg-[#E4E4E7] rounded-lg transition-colors whitespace-nowrap shrink-0"
                          >
                            <Download className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>
                              下载浏览器插件 (.zip · <span className="font-mono tabular-nums">v{EXTENSION_VERSION}</span>)
                            </span>
                          </a>
                          <button
                            type="button"
                            onClick={handleCopyExtensionsUrl}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-[#E4E4E7] dark:border-[#27272A] hover:bg-[#F4F4F5] dark:hover:bg-[#1C1C1F] rounded-lg transition-colors whitespace-nowrap shrink-0"
                          >
                            {copiedExtUrl ? (
                              <Check className="w-3.5 h-3.5 text-[#16A34A]" aria-hidden="true" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                            <span>{copiedExtUrl ? '已复制 chrome://extensions' : '复制扩展页地址'}</span>
                          </button>
                        </div>

                        <ol className="space-y-2 pt-1 text-xs text-[#52525B] dark:text-[#A1A1AA] leading-relaxed">
                          <li className="flex items-baseline gap-2.5">
                            <span className="font-mono tabular-nums text-[11px] font-semibold text-[#09090B] dark:text-[#FAFAFA] shrink-0">
                              01.
                            </span>
                            <span>
                              下载 <code className="font-mono text-[11px] text-[#09090B] dark:text-[#FAFAFA]">waymark-extension.zip</code> 并解压到本地文件夹（请保留该文件夹不要删除）。
                            </span>
                          </li>
                          <li className="flex items-baseline gap-2.5">
                            <span className="font-mono tabular-nums text-[11px] font-semibold text-[#09090B] dark:text-[#FAFAFA] shrink-0">
                              02.
                            </span>
                            <span>
                              在浏览器地址栏打开 <code className="font-mono text-[11px] text-[#09090B] dark:text-[#FAFAFA]">chrome://extensions</code>（Edge 为 <code className="font-mono text-[11px] text-[#09090B] dark:text-[#FAFAFA]">edge://extensions</code>），开启右上角「开发者模式」。
                            </span>
                          </li>
                          <li className="flex items-baseline gap-2.5">
                            <span className="font-mono tabular-nums text-[11px] font-semibold text-[#09090B] dark:text-[#FAFAFA] shrink-0">
                              03.
                            </span>
                            <span>
                              点击「加载已解压的扩展程序」，选中解压后的文件夹，然后刷新 Waymark 页面即可生效。
                            </span>
                          </li>
                        </ol>
                      </div>

                      {/* Secondary: Tampermonkey Userscript Fallback */}
                      <div className="pt-5 border-t border-[#E4E4E7] dark:border-[#27272A] space-y-3">
                        <button
                          type="button"
                          aria-expanded={showUserscriptFallback}
                          onClick={() => setShowUserscriptFallback((v) => !v)}
                          className="w-full flex items-center justify-between gap-3 text-left group"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {bridgeActive && !extensionActive ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] shrink-0" aria-hidden="true" />
                            ) : (
                              <ShieldAlert className="w-3.5 h-3.5 text-[#71717A] shrink-0" aria-hidden="true" />
                            )}
                            <span className="text-xs font-medium text-[#27272A] dark:text-[#E4E4E7] group-hover:text-[#09090B] dark:group-hover:text-white truncate">
                              Tampermonkey 油猴脚本（备选方案 · <span className="font-mono tabular-nums">v{BRIDGE_VERSION}</span>）
                            </span>
                            {bridgeActive && (
                              <span className="text-[11px] text-[#71717A] whitespace-nowrap shrink-0">
                                · 当前检测到 <span className="font-mono tabular-nums">v{bridgeVersion}</span>
                              </span>
                            )}
                          </div>
                          <ChevronDown
                            className={`w-4 h-4 text-[#71717A] transition-transform duration-150 shrink-0 ${
                              showUserscriptFallback ? 'rotate-180' : ''
                            }`}
                            aria-hidden="true"
                          />
                        </button>

                        <AnimatePresence initial={false}>
                          {showUserscriptFallback && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                              className="overflow-hidden space-y-3"
                            >
                              <p className="text-xs text-[#71717A] dark:text-[#A1A1AA] leading-relaxed">
                                若不便安装扩展，也可使用 Tampermonkey / Violentmonkey 脚本。注意：新版 Chrome 需在扩展详情页启用「允许运行用户脚本」，且若同时装有插件与脚本，建议停用旧版油猴脚本以避免冲突。
                              </p>
                              {bridgeActive &&
                                bridgeVersion &&
                                bridgeVersion !== BRIDGE_VERSION && (
                                  <p className="text-xs text-[#B45309] dark:text-[#FCD34D]">
                                    当前油猴脚本版本 {bridgeVersion} 较旧，请重新安装 v{BRIDGE_VERSION}。
                                  </p>
                                )}

                              <div className="flex flex-wrap items-center gap-2.5">
                                <a
                                  href="/waymark-bridge.user.js"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium border border-[#E4E4E7] dark:border-[#27272A] hover:bg-[#F4F4F5] dark:hover:bg-[#1C1C1F] rounded-lg transition-colors whitespace-nowrap shrink-0"
                                >
                                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>安装油猴脚本 (.user.js)</span>
                                </a>
                                <button
                                  type="button"
                                  onClick={handleCopyScript}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium border border-[#E4E4E7] dark:border-[#27272A] hover:bg-[#F4F4F5] dark:hover:bg-[#1C1C1F] rounded-lg transition-colors whitespace-nowrap shrink-0"
                                >
                                  {copiedScript ? (
                                    <Check className="w-3.5 h-3.5 text-[#16A34A]" aria-hidden="true" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                                  )}
                                  <span>{copiedScript ? '已复制源码' : '复制脚本源码'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setShowScriptCode((v) => !v)}
                                  className="px-3 py-1.5 text-xs text-[#71717A] hover:text-[#09090B] dark:hover:text-white whitespace-nowrap shrink-0"
                                >
                                  {showScriptCode ? '收起源码' : '查看源码'}
                                </button>
                              </div>

                              <AnimatePresence>
                                {showScriptCode && (
                                  <motion.pre
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                                    className="p-4 bg-[#FAFAFA] dark:bg-[#09090B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg font-mono text-[11px] leading-relaxed text-[#52525B] dark:text-[#A1A1AA] overflow-x-auto max-h-60"
                                  >
                                    {scriptSource}
                                  </motion.pre>
                                )}
                              </AnimatePresence>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}

                  {tab === 'import' && (
                    <div className="space-y-4">
                      <div>
                          <label
                          htmlFor={`${uid}-batch`}
                          className="block text-xs font-medium text-[#27272A] dark:text-[#E4E4E7] mb-1.5"
                        >
                          批量导入至「{activeWorkspace.name}」（每行一条，支持 CSV / 制表符 / 竖线 / JSON）：名称, 访问地址, [用户名], [密码], [路径], [分组]
                        </label>
                        <textarea
                          id={`${uid}-batch`}
                          rows={6}
                          spellCheck={false}
                          value={rawText}
                          onChange={(e) => setRawText(e.target.value)}
                          placeholder={FORMAT_GUIDE_PLACEHOLDER}
                          className="w-full px-3.5 py-2.5 font-mono text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#09090B] dark:focus:ring-white"
                        />
                      </div>

                      {parsed.length > 0 && (
                        <div className="border border-[#E4E4E7] dark:border-[#27272A] rounded-lg overflow-x-auto max-h-44">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-[#FAFAFA] dark:bg-[#141417] border-b border-[#E4E4E7] dark:border-[#27272A] text-[#71717A]">
                                <th className="py-2 px-3">名称</th>
                                <th className="py-2 px-3">地址</th>
                                <th className="py-2 px-3">入口</th>
                                <th className="py-2 px-3">状态</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F4F4F5] dark:divide-[#1F1F23]">
                              {parsed.map((r, i) => (
                                <tr key={i} className={r.valid ? '' : 'opacity-50'}>
                                  <td className="py-1.5 px-3 font-medium">{r.name || '—'}</td>
                                  <td className="py-1.5 px-3 font-mono">{r.baseUrl || '—'}</td>
                                  <td className="py-1.5 px-3 font-mono">{r.entrance || '无'}</td>
                                  <td className="py-1.5 px-3">
                                    {r.valid ? (
                                      <span className="text-[#16A34A]">就绪</span>
                                    ) : (
                                      <span className="text-[#DC2626]">{r.error}</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      <div className="flex justify-end">
                        <button
                          type="button"
                          disabled={validCount === 0}
                          onClick={handleConfirmImport}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#09090B] hover:bg-[#27272A] dark:bg-[#FAFAFA] dark:text-[#09090B] rounded-lg disabled:opacity-40 transition-colors"
                        >
                          <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>导入 {validCount} 个站点</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {tab === 'security' && (
                    <div className="space-y-6">
                      {/* Admin Access Account */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2.5">
                            <Shield className="w-4 h-4 text-[#09090B] dark:text-white" aria-hidden="true" />
                            <div>
                              <div className="text-xs font-semibold text-[#09090B] dark:text-[#FAFAFA]">
                                管理员访问控制 · {adminUsername || 'admin'}
                              </div>
                              <div className="text-[11px] text-[#71717A]">
                                {envManaged
                                  ? '当前管理员凭据由服务端环境变量托管'
                                  : '已启用服务端会话鉴权，仅管理员可访问本管理台'}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onLogout();
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#E4E4E7] dark:border-[#27272A] hover:bg-[#F4F4F5] dark:hover:bg-[#1C1C1F] rounded-lg shrink-0"
                          >
                            <LogOut className="w-3 h-3" />
                            <span>退出登录</span>
                          </button>
                        </div>

                        {!envManaged && (
                          <form
                            onSubmit={handleChangeAdminPassword}
                            className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
                          >
                            <input
                              type="password"
                              value={curAdminPass}
                              onChange={(e) => setCurAdminPass(e.target.value)}
                              placeholder="当前管理员密码"
                              className="px-3 py-2 text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg"
                            />
                            <input
                              type="password"
                              value={newAdminPass}
                              onChange={(e) => setNewAdminPass(e.target.value)}
                              placeholder="新管理员密码（至少 6 位）"
                              className="px-3 py-2 text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg"
                            />
                            <button
                              type="submit"
                              disabled={updatingAdminPass}
                              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-[#09090B] dark:bg-[#FAFAFA] dark:text-[#09090B] rounded-lg disabled:opacity-50"
                            >
                              <span>{updatingAdminPass ? '更新中...' : '修改管理员密码'}</span>
                            </button>
                          </form>
                        )}
                        {adminPassMsg && (
                          <p className={`text-xs ${adminPassOk ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                            {adminPassMsg}
                          </p>
                        )}
                      </div>

                      {/* Local Vault Master Lock */}
                      <div className="pt-5 border-t border-[#E4E4E7] dark:border-[#27272A] space-y-3">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2.5">
                            <KeyRound className="w-4 h-4 text-[#09090B] dark:text-white" aria-hidden="true" />
                            <div>
                              <div className="text-xs font-semibold text-[#09090B] dark:text-[#FAFAFA]">
                                本地 AES-256-GCM 凭据二次锁
                              </div>
                              <div className="text-[11px] text-[#71717A]">
                                {hasMasterLock
                                  ? '已开启本地凭据加密保护'
                                  : '可选为浏览器本地存储的登录凭据叠加 AES-256-GCM 加密'}
                              </div>
                            </div>
                          </div>
                          {hasMasterLock && (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  onLockNow();
                                  onClose();
                                }}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-[#09090B] text-white dark:bg-[#FAFAFA] dark:text-[#09090B] rounded-md"
                              >
                                <Lock className="w-3 h-3" />
                                <span>立即锁定</span>
                              </button>
                              <button
                                type="button"
                                onClick={onDisableMasterLock}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-[#E4E4E7] dark:border-[#27272A] rounded-md"
                              >
                                <Unlock className="w-3 h-3" />
                                <span>移除</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {!hasMasterLock && (
                          <form onSubmit={handleSetPassphrase} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <input
                              type="password"
                              value={pass1}
                              onChange={(e) => setPass1(e.target.value)}
                              placeholder="设置二次主密码（至少 6 位）"
                              className="px-3 py-2 text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg"
                            />
                            <input
                              type="password"
                              value={pass2}
                              onChange={(e) => setPass2(e.target.value)}
                              placeholder="确认二次主密码"
                              className="px-3 py-2 text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg"
                            />
                            <button
                              type="submit"
                              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-[#09090B] dark:bg-[#FAFAFA] dark:text-[#09090B] rounded-lg"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>启用加密</span>
                            </button>
                          </form>
                        )}
                        {lockError && <p className="text-xs text-[#DC2626]">{lockError}</p>}
                      </div>

                      {/* Backup */}
                      <div className="pt-5 border-t border-[#E4E4E7] dark:border-[#27272A] grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2.5">
                          <div className="text-xs font-semibold text-[#09090B] dark:text-[#FAFAFA]">导出备份</div>
                          <div className="flex gap-2">
                            <input
                              type="password"
                              value={exportPass}
                              onChange={(e) => setExportPass(e.target.value)}
                              placeholder="设置导出加密口令"
                              className="flex-1 min-w-0 px-3 py-1.5 text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg"
                            />
                            <button
                              type="button"
                              onClick={handleExportEncrypted}
                              className="px-3 py-1.5 text-xs font-medium bg-[#09090B] text-white dark:bg-[#FAFAFA] dark:text-[#09090B] rounded-lg shrink-0"
                            >
                              加密导出
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={handleExportCsv}
                            className="text-[11px] text-[#71717A] hover:text-[#09090B] dark:hover:text-white underline underline-offset-4"
                          >
                            导出明文 CSV（{nodes.length} 条）
                          </button>
                        </div>

                        <div className="space-y-2.5">
                          <div className="text-xs font-semibold text-[#09090B] dark:text-[#FAFAFA]">恢复备份</div>
                          <label
                            htmlFor={`${uid}-restore`}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium border border-[#E4E4E7] dark:border-[#27272A] hover:bg-[#F4F4F5] dark:hover:bg-[#1C1C1F] rounded-lg cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>选择 .json 备份文件</span>
                            <input
                              id={`${uid}-restore`}
                              type="file"
                              accept=".json"
                              onChange={handleFileImport}
                              className="sr-only"
                            />
                          </label>
                          {pendingEncryptedEnvelope && (
                            <form onSubmit={handleDecryptImport} className="flex gap-2 pt-1">
                              <input
                                type="password"
                                value={importPass}
                                onChange={(e) => setImportPass(e.target.value)}
                                placeholder="输入解密口令"
                                className="flex-1 min-w-0 px-3 py-1.5 text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg"
                              />
                              <button type="submit" className="px-3 py-1.5 text-xs bg-[#2563EB] text-white rounded-lg">
                                解密
                              </button>
                            </form>
                          )}
                        </div>
                      </div>

                      {/* Clear */}
                      <div className="pt-4 border-t border-[#E4E4E7] dark:border-[#27272A] flex items-center justify-between">
                        <span className="text-xs text-[#71717A]">清空已保存的全部站点记录</span>
                        {confirmClear ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                onClearAll();
                                setConfirmClear(false);
                                onClose();
                              }}
                              className="px-3 py-1.5 text-xs font-medium text-white bg-[#DC2626] rounded-md"
                            >
                              确认清空
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmClear(false)}
                              className="px-2 py-1.5 text-xs text-[#71717A]"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmClear(true)}
                            className="inline-flex items-center gap-1 text-xs text-[#DC2626] hover:underline"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>清空数据</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
