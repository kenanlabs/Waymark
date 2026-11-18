import { useEffect, useId, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Moon,
  Palette,
  Puzzle,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Trash2,
  Type,
  Unlock,
  Upload,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type {
  BgPattern,
  BgTone,
  EncryptedVaultEnvelope,
  FontFamily,
  PanelNode,
  Workspace,
} from '../types/panel';
import { changeAdminPassword } from '../utils/auth';
import { candidatesToPanelNodes, parseBatchInput } from '../utils/batchParser';
import { decryptVaultBundle, encryptVaultNodes } from '../utils/crypto';
import { EXTENSION_VERSION } from '../utils/extensionMeta';
import { FONT_PRESETS, isFontCached, loadAndApplyFont } from '../utils/fontLoader';
import { BRIDGE_VERSION, generateUserscriptSource } from '../utils/userscript';
import { BG_PATTERN_PRESETS, BG_TONE_PRESETS } from '../utils/workspacePresets';

export type SettingsTab = 'appearance' | 'bridge' | 'import' | 'security' | 'about';

interface SettingsModalProps {
  open: boolean;
  initialTab: SettingsTab;
  nodes: PanelNode[];
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  theme: 'light' | 'dark';
  bgTone: BgTone;
  bgPattern: BgPattern;
  fontFamily: FontFamily;
  onChangeTheme: (theme: 'light' | 'dark') => void;
  onChangeBgTone: (tone: BgTone) => void;
  onChangeBgPattern: (pattern: BgPattern) => void;
  onChangeFontFamily: (font: FontFamily) => void;
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

function getPatternPreviewStyle(pattern: BgPattern, isDark: boolean): React.CSSProperties {
  const ink = isDark ? 'rgba(250,250,250,0.22)' : 'rgba(9,9,11,0.18)';
  const line = isDark ? 'rgba(250,250,250,0.14)' : 'rgba(9,9,11,0.11)';
  if (pattern === 'dots') {
    return {
      backgroundImage: `radial-gradient(${ink} 1px, transparent 1px)`,
      backgroundSize: '8px 8px',
    };
  }
  if (pattern === 'grid') {
    return {
      backgroundImage: `linear-gradient(to right, ${line} 1px, transparent 1px), linear-gradient(to bottom, ${line} 1px, transparent 1px)`,
      backgroundSize: '10px 10px',
    };
  }
  if (pattern === 'paper') {
    return {
      backgroundImage: `radial-gradient(${ink} 0.75px, transparent 0.75px), radial-gradient(${line} 0.75px, transparent 0.75px)`,
      backgroundSize: '6px 6px',
      backgroundPosition: '0 0, 3px 3px',
    };
  }
  if (pattern === 'lines') {
    return {
      backgroundImage: `repeating-linear-gradient(-45deg, ${line} 0px, ${line} 1px, transparent 1px, transparent 6px)`,
    };
  }
  if (pattern === 'rings') {
    return {
      backgroundImage: `repeating-radial-gradient(circle at 50% 0%, transparent 0, transparent 9px, ${line} 9px, ${line} 10px)`,
    };
  }
  return {};
}

export function SettingsModal({
  open,
  initialTab,
  nodes,
  workspaces,
  activeWorkspace,
  theme,
  bgTone,
  bgPattern,
  fontFamily,
  onChangeTheme,
  onChangeBgTone,
  onChangeBgPattern,
  onChangeFontFamily,
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
  const [downloadingExt, setDownloadingExt] = useState(false);
  const [downloadingFont, setDownloadingFont] = useState<FontFamily | null>(null);
  const [fontProgress, setFontProgress] = useState<Partial<Record<FontFamily, number>>>({});
  const [cachedFonts, setCachedFonts] = useState<Partial<Record<FontFamily, boolean>>>({
    default: true,
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.all(
      FONT_PRESETS.map(async (preset) => {
        const cached = await isFontCached(preset.id);
        return [preset.id, cached] as const;
      })
    ).then((entries) => {
      if (cancelled) return;
      const next: Partial<Record<FontFamily, boolean>> = {};
      for (const [id, ok] of entries) {
        next[id] = ok;
      }
      setCachedFonts(next);
    });
    return () => {
      cancelled = true;
    };
  }, [open, fontFamily]);

  const handleSelectFont = async (targetFont: FontFamily) => {
    if (downloadingFont) return;
    if (targetFont === 'default') {
      await loadAndApplyFont('default');
      onChangeFontFamily('default');
      return;
    }

    const alreadyCached = await isFontCached(targetFont);
    if (alreadyCached) {
      const ok = await loadAndApplyFont(targetFont);
      if (ok) {
        setCachedFonts((prev) => ({ ...prev, [targetFont]: true }));
        onChangeFontFamily(targetFont);
      } else {
        onNotify('加载缓存字体失败，请重试');
      }
      return;
    }

    setDownloadingFont(targetFont);
    setFontProgress((prev) => ({ ...prev, [targetFont]: 2 }));

    const ok = await loadAndApplyFont(targetFont, (pct) => {
      setFontProgress((prev) => ({ ...prev, [targetFont]: pct }));
    });

    setDownloadingFont(null);
    if (ok) {
      setCachedFonts((prev) => ({ ...prev, [targetFont]: true }));
      setFontProgress((prev) => ({ ...prev, [targetFont]: 100 }));
      onChangeFontFamily(targetFont);
    } else {
      setFontProgress((prev) => ({ ...prev, [targetFont]: 0 }));
      onNotify('字体下载失败，请检查网络连接后重试');
    }
  };

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

  const handleDownloadExtension = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (downloadingExt) return;
    setDownloadingExt(true);
    try {
      const resp = await fetch('/waymark-extension.zip', { cache: 'no-store' });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = 'waymark-extension.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch {
      onNotify('下载插件包失败，请检查网络连接后重试');
    } finally {
      setDownloadingExt(false);
    }
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
    const header = 'workspace,name,baseUrl,entrance,username,password,group,field1,field2,field3';
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
        esc(n.customValues?.field1 || ''),
        esc(n.customValues?.field2 || ''),
        esc(n.customValues?.field3 || ''),
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
              <div className="flex items-center gap-5 sm:gap-6 overflow-x-auto no-scrollbar">
                <h2 id={`${uid}-title`} className="sr-only">
                  系统设置与工具
                </h2>
                {(
                  [
                    ['appearance', '外观与背景'],
                    ['bridge', '插件与脚本'],
                    ['import', '批量导入'],
                    ['security', '安全与备份'],
                    ['about', '关于'],
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
                          className="absolute inset-x-0 bottom-0 h-[2px] bg-[var(--wm-switch-on)]"
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
                  {tab === 'appearance' && (
                    <div className="space-y-5">
                      {/* Theme Mode Selection */}
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-2">
                          <Palette className="w-4 h-4 text-[#09090B] dark:text-[#FAFAFA]" aria-hidden="true" />
                          <span className="text-xs font-semibold text-[#09090B] dark:text-[#FAFAFA]">
                            界面模式
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <button
                            type="button"
                            onClick={() => onChangeTheme('light')}
                            aria-pressed={theme === 'light'}
                            className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-left transition-all ${
                              theme === 'light'
                                ? 'wm-card-selected'
                                : 'border-[#E4E4E7] dark:border-[#27272A] hover:border-[#A1A1AA] dark:hover:border-[#3F3F46]'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <Sun className="w-4 h-4 text-[#09090B] dark:text-[#FAFAFA]" aria-hidden="true" />
                              <span className="text-xs font-medium text-[#09090B] dark:text-[#FAFAFA]">
                                浅色模式
                              </span>
                            </div>
                            {theme === 'light' && (
                              <Check className="w-3.5 h-3.5 text-[var(--wm-accent-ink)] shrink-0" aria-hidden="true" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => onChangeTheme('dark')}
                            aria-pressed={theme === 'dark'}
                            className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-left transition-all ${
                              theme === 'dark'
                                ? 'wm-card-selected'
                                : 'border-[#E4E4E7] dark:border-[#27272A] hover:border-[#A1A1AA] dark:hover:border-[#3F3F46]'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <Moon className="w-4 h-4 text-[#09090B] dark:text-[#FAFAFA]" aria-hidden="true" />
                              <span className="text-xs font-medium text-[#09090B] dark:text-[#FAFAFA]">
                                深色模式
                              </span>
                            </div>
                            {theme === 'dark' && (
                              <Check className="w-3.5 h-3.5 text-[var(--wm-accent-ink)] shrink-0" aria-hidden="true" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Background Tone Palette Selection */}
                      <div className="pt-4 border-t border-[#E4E4E7] dark:border-[#27272A] space-y-2.5">
                        <div className="text-xs font-semibold text-[#09090B] dark:text-[#FAFAFA]">
                          背景色调
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          {BG_TONE_PRESETS.map((preset) => {
                            const active = bgTone === preset.id;
                            const canvasHex = theme === 'dark' ? preset.darkCanvas : preset.lightCanvas;
                            const surfaceHex = theme === 'dark' ? preset.darkSurface : preset.lightSurface;
                            const borderHex = theme === 'dark' ? preset.darkBorder : preset.lightBorder;
                            const mutedHex = theme === 'dark' ? preset.darkMuted : preset.lightMuted;

                            return (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => onChangeBgTone(preset.id)}
                                aria-pressed={active}
                                className={`group flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all ${
                                  active
                                    ? 'wm-card-selected'
                                    : 'border-[#E4E4E7] dark:border-[#27272A] hover:border-[#A1A1AA] dark:hover:border-[#3F3F46]'
                                }`}
                              >
                                <div
                                  className="w-10 h-9 rounded-lg border shrink-0 p-1 flex flex-col justify-between shadow-2xs"
                                  style={{
                                    backgroundColor: canvasHex,
                                    borderColor: borderHex,
                                  }}
                                  aria-hidden="true"
                                >
                                  <div
                                    className="h-1.5 w-5 rounded-xs"
                                    style={{ backgroundColor: mutedHex }}
                                  />
                                  <div
                                    className="h-3.5 w-full rounded-xs border"
                                    style={{
                                      backgroundColor: surfaceHex,
                                      borderColor: borderHex,
                                    }}
                                  />
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-1.5">
                                    <span className="text-xs font-medium text-[#09090B] dark:text-[#FAFAFA] truncate">
                                      {preset.name}
                                    </span>
                                    {active && (
                                      <Check
                                        className="w-3.5 h-3.5 text-[var(--wm-accent-ink)] shrink-0"
                                        aria-hidden="true"
                                      />
                                    )}
                                  </div>
                                  <p className="mt-0.5 text-[11px] text-[#71717A] dark:text-[#A1A1AA] truncate">
                                    {preset.subtitle}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Background Pattern / Texture Accents */}
                      <div className="pt-4 border-t border-[#E4E4E7] dark:border-[#27272A] space-y-2.5">
                        <div className="text-xs font-semibold text-[#09090B] dark:text-[#FAFAFA]">
                          背景纹理
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          {BG_PATTERN_PRESETS.map((pat) => {
                            const active = bgPattern === pat.id;
                            const activeTone =
                              BG_TONE_PRESETS.find((t) => t.id === bgTone) ?? BG_TONE_PRESETS[0];
                            const canvasHex =
                              theme === 'dark' ? activeTone.darkCanvas : activeTone.lightCanvas;
                            const borderHex =
                              theme === 'dark' ? activeTone.darkBorder : activeTone.lightBorder;

                            return (
                              <button
                                key={pat.id}
                                type="button"
                                onClick={() => onChangeBgPattern(pat.id)}
                                aria-pressed={active}
                                className={`group flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all ${
                                  active
                                    ? 'wm-card-selected'
                                    : 'border-[#E4E4E7] dark:border-[#27272A] hover:border-[#A1A1AA] dark:hover:border-[#3F3F46]'
                                }`}
                              >
                                <div
                                  className="w-10 h-9 rounded-lg border shrink-0 overflow-hidden shadow-2xs"
                                  style={{
                                    backgroundColor: canvasHex,
                                    borderColor: borderHex,
                                    ...getPatternPreviewStyle(pat.id, theme === 'dark'),
                                  }}
                                  aria-hidden="true"
                                />

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-1.5">
                                    <span className="text-xs font-medium text-[#09090B] dark:text-[#FAFAFA] truncate">
                                      {pat.name}
                                    </span>
                                    {active && (
                                      <Check
                                        className="w-3.5 h-3.5 text-[var(--wm-accent-ink)] shrink-0"
                                        aria-hidden="true"
                                      />
                                    )}
                                  </div>
                                  <p className="mt-0.5 text-[11px] text-[#71717A] dark:text-[#A1A1AA] truncate">
                                    {pat.subtitle}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Interface Font Selection with Button-Integrated Left-to-Right Download Progress */}
                      <div className="pt-4 border-t border-[#E4E4E7] dark:border-[#27272A] space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Type className="w-4 h-4 text-[#09090B] dark:text-[#FAFAFA]" aria-hidden="true" />
                            <span className="text-xs font-semibold text-[#09090B] dark:text-[#FAFAFA]">
                              界面字体
                            </span>
                          </div>
                          <span className="text-[11px] text-[#71717A] dark:text-[#A1A1AA]">
                            按需下载至本地浏览器缓存
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          {FONT_PRESETS.map((preset) => {
                            const active = fontFamily === preset.id;
                            const isDownloading = downloadingFont === preset.id;
                            const progress = isDownloading ? (fontProgress[preset.id] ?? 2) : 0;
                            const isCached = Boolean(cachedFonts[preset.id]);
                            const activeTone =
                              BG_TONE_PRESETS.find((t) => t.id === bgTone) ?? BG_TONE_PRESETS[0];
                            const surfaceHex =
                              theme === 'dark' ? activeTone.darkSurface : activeTone.lightSurface;
                            const borderHex =
                              theme === 'dark' ? activeTone.darkBorder : activeTone.lightBorder;

                            return (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => void handleSelectFont(preset.id)}
                                disabled={Boolean(downloadingFont && downloadingFont !== preset.id)}
                                aria-pressed={active}
                                aria-busy={isDownloading}
                                className={`group relative overflow-hidden flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all disabled:opacity-50 ${
                                  active
                                    ? 'wm-card-selected'
                                    : isDownloading
                                    ? 'border-[var(--wm-select-border)]'
                                    : 'border-[#E4E4E7] dark:border-[#27272A] hover:border-[#A1A1AA] dark:hover:border-[#3F3F46]'
                                }`}
                              >
                                {/* Left-to-right progress fill fused directly into the button background */}
                                {isDownloading && (
                                  <div
                                    aria-hidden="true"
                                    className="pointer-events-none absolute inset-y-0 left-0 z-0 transition-[width] duration-150 ease-out"
                                    style={{
                                      width: `${Math.max(3, Math.min(100, progress))}%`,
                                      backgroundColor: 'var(--wm-select-bg)',
                                      borderRight:
                                        progress < 100
                                          ? '1.5px solid var(--wm-select-border)'
                                          : 'none',
                                    }}
                                  />
                                )}

                                <div
                                  className="relative z-10 w-10 h-9 rounded-lg border shrink-0 flex items-center justify-center text-[13px] font-semibold text-[#09090B] dark:text-[#FAFAFA] shadow-2xs select-none"
                                  style={{
                                    backgroundColor: surfaceHex,
                                    borderColor: borderHex,
                                    fontFamily:
                                      preset.id === 'default'
                                        ? 'Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'
                                        : preset.cssFamilyName && isCached
                                        ? `"${preset.cssFamilyName}", "STKaiti", "Kaiti SC", serif`
                                        : '"STKaiti", "Kaiti SC", "KaiTi", serif',
                                  }}
                                  aria-hidden="true"
                                >
                                  {preset.badgeText}
                                </div>

                                <div className="relative z-10 min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-1.5">
                                    <span className="text-xs font-medium text-[#09090B] dark:text-[#FAFAFA] truncate">
                                      {preset.name}
                                    </span>
                                    {isDownloading ? (
                                      <span className="font-mono text-[11px] font-semibold tabular-nums text-[var(--wm-accent-ink)] shrink-0">
                                        {progress}%
                                      </span>
                                    ) : active ? (
                                      <Check
                                        className="w-3.5 h-3.5 text-[var(--wm-accent-ink)] shrink-0"
                                        aria-hidden="true"
                                      />
                                    ) : null}
                                  </div>
                                  <p className="mt-0.5 text-[11px] text-[#71717A] dark:text-[#A1A1AA] truncate">
                                    {preset.subtitle}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

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
                              相比油猴脚本，浏览器插件由扩展后台直接探测 HTTP 与内网地址，彻底告别「受限」与授权弹窗；并通过原生页面主环境注入自动填充账号密码，适配各类单页应用后台与表单登录页。
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
                            onClick={handleDownloadExtension}
                            aria-busy={downloadingExt}
                            className="wm-btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0"
                          >
                            {downloadingExt ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <Download className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                            <span>
                              {downloadingExt ? (
                                '正在打包下载...'
                              ) : (
                                <>
                                  下载浏览器插件 (.zip · <span className="font-mono tabular-nums">v{EXTENSION_VERSION}</span>)
                                </>
                              )}
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
                              点击「加载已解压的扩展程序」，选中解压后的文件夹；若此前已打开 Waymark 页面，请<strong className="font-medium text-[#09090B] dark:text-[#FAFAFA]">刷新该页面</strong>使新版插件重新连接。
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
                              initial={{ height: 0, opacity: 0, overflow: 'hidden' }}
                              animate={{ height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } }}
                              exit={{ height: 0, opacity: 0, overflow: 'hidden' }}
                              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                              className="space-y-3"
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
                          批量导入至「{activeWorkspace.name}」（每行一条，支持 CSV / 制表符 / 竖线 / JSON）：名称, 访问地址, [用户名], [密码], [路径], [分组], [字段1], [字段2], [字段3]
                        </label>
                        <textarea
                          id={`${uid}-batch`}
                          rows={6}
                          spellCheck={false}
                          value={rawText}
                          onChange={(e) => setRawText(e.target.value)}
                          placeholder={FORMAT_GUIDE_PLACEHOLDER}
                          className="w-full px-3.5 py-2.5 font-mono text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:border-[#09090B] dark:focus:border-[#FAFAFA] ring-inset focus:ring-1 focus:ring-[#09090B] dark:focus:ring-[#FAFAFA] transition-[border-color,box-shadow]"
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
                          className="wm-btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg disabled:opacity-40 transition-colors"
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
                              className="px-3 py-2 text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:border-[#09090B] dark:focus:border-[#FAFAFA] ring-inset focus:ring-1 focus:ring-[#09090B] dark:focus:ring-[#FAFAFA] transition-[border-color,box-shadow]"
                            />
                            <input
                              type="password"
                              value={newAdminPass}
                              onChange={(e) => setNewAdminPass(e.target.value)}
                              placeholder="新管理员密码（至少 6 位）"
                              className="px-3 py-2 text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:border-[#09090B] dark:focus:border-[#FAFAFA] ring-inset focus:ring-1 focus:ring-[#09090B] dark:focus:ring-[#FAFAFA] transition-[border-color,box-shadow]"
                            />
                            <button
                              type="submit"
                              disabled={updatingAdminPass}
                              className="wm-btn-primary inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg disabled:opacity-50 transition-colors"
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
                                className="wm-btn-primary inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
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
                              autoComplete="new-password"
                              data-bwignore="true"
                              data-1p-ignore="true"
                              data-lpignore="true"
                              value={pass1}
                              onChange={(e) => setPass1(e.target.value)}
                              placeholder="设置二次主密码（至少 6 位）"
                              className="px-3 py-2 text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:border-[#09090B] dark:focus:border-[#FAFAFA] ring-inset focus:ring-1 focus:ring-[#09090B] dark:focus:ring-[#FAFAFA] transition-[border-color,box-shadow]"
                            />
                            <input
                              type="password"
                              autoComplete="new-password"
                              data-bwignore="true"
                              data-1p-ignore="true"
                              data-lpignore="true"
                              value={pass2}
                              onChange={(e) => setPass2(e.target.value)}
                              placeholder="确认二次主密码"
                              className="px-3 py-2 text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:border-[#09090B] dark:focus:border-[#FAFAFA] ring-inset focus:ring-1 focus:ring-[#09090B] dark:focus:ring-[#FAFAFA] transition-[border-color,box-shadow]"
                            />
                            <button
                              type="submit"
                              className="wm-btn-primary inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors"
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
                              autoComplete="new-password"
                              data-bwignore="true"
                              data-1p-ignore="true"
                              data-lpignore="true"
                              value={exportPass}
                              onChange={(e) => setExportPass(e.target.value)}
                              placeholder="设置导出加密口令"
                              className="flex-1 min-w-0 px-3 py-1.5 text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:border-[#09090B] dark:focus:border-[#FAFAFA] ring-inset focus:ring-1 focus:ring-[#09090B] dark:focus:ring-[#FAFAFA] transition-[border-color,box-shadow]"
                            />
                            <button
                              type="button"
                              onClick={handleExportEncrypted}
                              className="wm-btn-primary px-3 py-1.5 text-xs font-medium rounded-lg shrink-0 transition-colors"
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
                                autoComplete="off"
                                data-bwignore="true"
                                data-1p-ignore="true"
                                data-lpignore="true"
                                value={importPass}
                                onChange={(e) => setImportPass(e.target.value)}
                                placeholder="输入解密口令"
                                className="flex-1 min-w-0 px-3 py-1.5 text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:border-[#09090B] dark:focus:border-[#FAFAFA] ring-inset focus:ring-1 focus:ring-[#09090B] dark:focus:ring-[#FAFAFA] transition-[border-color,box-shadow]"
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

                  {tab === 'about' && (
                    <div className="space-y-5">
                      <div className="flex items-baseline justify-between gap-3 pb-4 border-b border-[#E4E4E7] dark:border-[#27272A]">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-display text-base font-semibold text-[#09090B] dark:text-[#FAFAFA]">
                              Waymark
                            </span>
                            <span className="font-mono text-[11px] text-[#71717A] dark:text-[#A1A1AA]">
                              v{EXTENSION_VERSION}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-[#71717A] dark:text-[#A1A1AA] leading-relaxed">
                            轻量、自托管的多工作空间站点导航与自动登录管理台，专注高频后台与书签的极速直达。
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="p-3.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] bg-[#FAFAFA] dark:bg-[#18181B]/60 space-y-1">
                          <div className="text-xs font-semibold text-[#09090B] dark:text-[#FAFAFA]">
                            多空间与拖拽编排
                          </div>
                          <p className="text-[11px] text-[#71717A] dark:text-[#A1A1AA] leading-relaxed">
                            按团队、环境或用途划分独立工作空间，支持分组筛选、置顶优先与卡片自由拖拽排序。
                          </p>
                        </div>

                        <div className="p-3.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] bg-[#FAFAFA] dark:bg-[#18181B]/60 space-y-1">
                          <div className="text-xs font-semibold text-[#09090B] dark:text-[#FAFAFA]">
                            一键填充与连通检测
                          </div>
                          <p className="text-[11px] text-[#71717A] dark:text-[#A1A1AA] leading-relaxed">
                            配合浏览器插件或脚本，跨站自动填充表单或 Basic 认证凭据，并支持内网与 HTTP 连通性探测。
                          </p>
                        </div>

                        <div className="p-3.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] bg-[#FAFAFA] dark:bg-[#18181B]/60 space-y-1">
                          <div className="text-xs font-semibold text-[#09090B] dark:text-[#FAFAFA]">
                            自定义字段与公开分享
                          </div>
                          <p className="text-[11px] text-[#71717A] dark:text-[#A1A1AA] leading-relaxed">
                            每个空间可独立配置补充信息字段名及展示位置，并支持绑定独立域名或路由免登录公开访问（自动脱敏凭据）。
                          </p>
                        </div>

                        <div className="p-3.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] bg-[#FAFAFA] dark:bg-[#18181B]/60 space-y-1">
                          <div className="text-xs font-semibold text-[#09090B] dark:text-[#FAFAFA]">
                            跨端同步与加密备份
                          </div>
                          <p className="text-[11px] text-[#71717A] dark:text-[#A1A1AA] leading-relaxed">
                            支持服务端持久化同步、本地 AES-256-GCM 凭据加密锁以及加密 JSON / CSV 批量导入导出。
                          </p>
                        </div>
                      </div>

                      <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#71717A] dark:text-[#A1A1AA]">
                        <span>
                          当前统计：{workspaces.length} 个工作空间 · {nodes.length} 个站点
                        </span>
                        <span className="font-mono">
                          快捷键：⌘K 全局搜索 · / 聚焦搜索 · Esc 关闭弹窗
                        </span>
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
