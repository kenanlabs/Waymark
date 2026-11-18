import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, LayoutGrid, List, Loader2, Pencil } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { AdminAuthScreen } from './components/AdminAuthScreen';
import { CommandPalette } from './components/CommandPalette';
import { CustomSelect } from './components/CustomSelect';
import { FirstPanelOnboarding } from './components/FirstPanelOnboarding';
import { GroupManagerModal } from './components/GroupManagerModal';
import { PanelDrawer } from './components/PanelDrawer';
import { PanelGrid } from './components/PanelGrid';
import { PanelTable } from './components/PanelTable';
import { PublicWorkspaceView } from './components/PublicWorkspaceView';
import { SettingsModal, type SettingsTab } from './components/SettingsModal';
import { TopBar } from './components/TopBar';
import { VaultLockScreen } from './components/VaultLockScreen';
import { WorkspaceBar } from './components/WorkspaceBar';
import { WorkspaceModal } from './components/WorkspaceModal';
import type {
  EncryptedVaultEnvelope,
  PanelNode,
  PublicNodeItem,
  PublicWorkspaceViewData,
  SortOption,
  ViewMode,
  Workspace,
} from './types/panel';
import {
  fetchAdminState,
  fetchAuthStatus,
  fetchPublicWorkspaceByRoute,
  logoutAdminAccount,
  probePanelNode,
  removePublicWorkspace,
  saveAdminState,
  syncPublicWorkspace,
  type AdminAuthStatus,
} from './utils/auth';
import { copyTextToClipboard, decryptVaultBundle, encryptVaultNodes, generateId } from './utils/crypto';
import {
  BRIDGE_VERSION,
  buildPanelTargetUrl,
  normalizeBaseUrl,
  normalizeEntrance,
} from './utils/userscript';
import {
  createDefaultWorkspace,
  DEFAULT_WORKSPACE_GROUPS,
  DEFAULT_WORKSPACE_ID,
} from './utils/workspacePresets';

const STORAGE_KEY = 'paneldeck_vault_v1';
const THEME_KEY = 'paneldeck_theme_v1';
const VIEW_MODE_KEY = 'waymark_view_mode_v1';
const LEGACY_GROUPS_KEY = 'paneldeck_groups_v1';
const WORKSPACES_STORAGE_KEY = 'opsdeck_workspaces_v1';

function loadInitialWorkspaces(): { activeWorkspaceId: string; workspaces: Workspace[] } {
  if (typeof window === 'undefined') {
    const def = createDefaultWorkspace();
    return { activeWorkspaceId: def.id, workspaces: [def] };
  }
  try {
    const savedWs = localStorage.getItem(WORKSPACES_STORAGE_KEY);
    if (savedWs) {
      const parsed = JSON.parse(savedWs) as {
        activeWorkspaceId?: string;
        workspaces?: Workspace[];
      };
      if (Array.isArray(parsed?.workspaces) && parsed.workspaces.length > 0) {
        const activeId =
          parsed.activeWorkspaceId &&
          parsed.workspaces.some((w) => w.id === parsed.activeWorkspaceId)
            ? parsed.activeWorkspaceId
            : parsed.workspaces[0].id;
        return { activeWorkspaceId: activeId, workspaces: parsed.workspaces };
      }
    }
  } catch {
    // Fallback to legacy groups or default workspace
  }

  let legacyGroups: string[] | undefined;
  try {
    const savedGroups = localStorage.getItem(LEGACY_GROUPS_KEY);
    if (savedGroups) {
      const parsed = JSON.parse(savedGroups);
      if (Array.isArray(parsed)) {
        legacyGroups = parsed.filter((g): g is string => typeof g === 'string' && Boolean(g.trim()));
      }
    }
  } catch {
    // Ignore malformed legacy groups
  }

  const defaultWs = createDefaultWorkspace(legacyGroups);
  return { activeWorkspaceId: defaultWs.id, workspaces: [defaultWs] };
}

export default function App() {
  const currentPath = useMemo(() => {
    if (typeof window === 'undefined') return '/';
    const trimmed = window.location.pathname.replace(/\/+$/, '');
    return trimmed || '/';
  }, []);
  const previewWorkspaceId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('preview')?.trim() || '';
  }, []);
  const [publicMode, setPublicMode] = useState<'checking' | 'public' | 'admin'>('checking');
  const [publicWorkspace, setPublicWorkspace] = useState<PublicWorkspaceViewData | null>(null);
  const [publicError, setPublicError] = useState<string | undefined>(undefined);

  const [authChecked, setAuthChecked] = useState(false);
  const [authStatus, setAuthStatus] = useState<AdminAuthStatus>({
    initialized: false,
    authenticated: false,
  });

  const initialWsState = useMemo(() => loadInitialWorkspaces(), []);
  const [workspaces, setWorkspaces] = useState<Workspace[]>(initialWsState.workspaces);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(initialWsState.activeWorkspaceId);

  const [nodes, setNodes] = useState<PanelNode[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [serverStateLoaded, setServerStateLoaded] = useState(false);
  const [lockedEnvelope, setLockedEnvelope] = useState<EncryptedVaultEnvelope | null>(null);
  const [masterPassphrase, setMasterPassphrase] = useState<string | null>(null);
  const lastSyncedPublicRef = useRef<Record<string, string>>({});
  const lastSavedServerSigRef = useRef<string>('');
  const pendingMigrationToastRef = useRef(false);

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'grid';
    try {
      const saved = localStorage.getItem(VIEW_MODE_KEY);
      return saved === 'table' ? 'table' : 'grid';
    } catch {
      return 'grid';
    }
  });
  const [sortBy, setSortBy] = useState<SortOption>('pinned');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<PanelNode | null>(null);
  const [groupManagerOpen, setGroupManagerOpen] = useState(false);
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('bridge');
  const [commandOpen, setCommandOpen] = useState(false);
  const [bridgeActive, setBridgeActive] = useState(false);
  const [bridgeVersion, setBridgeVersion] = useState<string | null>(null);
  const [batchProbing, setBatchProbing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const searchInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<number | null>(null);

  const notify = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 2400);
  }, []);

  const openSettings = (tab: SettingsTab) => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  };

  // Theme sync
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // View mode local persistence
  useEffect(() => {
    if (publicMode !== 'admin') return;
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      // Ignore storage errors
    }
  }, [publicMode, viewMode]);

  // Persist workspaces config to local cache (admin mode only, after server state loaded)
  useEffect(() => {
    if (publicMode !== 'admin' || !serverStateLoaded) return;
    localStorage.setItem(
      WORKSPACES_STORAGE_KEY,
      JSON.stringify({ activeWorkspaceId, workspaces })
    );
  }, [publicMode, serverStateLoaded, activeWorkspaceId, workspaces]);

  // Isolated public entry check (checks preview query, custom Host domain, and custom route path before any admin logic)
  useEffect(() => {
    let cancelled = false;
    fetchPublicWorkspaceByRoute(currentPath, previewWorkspaceId || undefined)
      .then((res) => {
        if (cancelled) return;
        if (res.ok && res.workspace) {
          setPublicWorkspace(res.workspace);
          setPublicError(undefined);
          setPublicMode('public');
        } else if (currentPath !== '/' || previewWorkspaceId) {
          setPublicWorkspace(null);
          setPublicError(res.message || '未找到对应的公开工作空间');
          setPublicMode('public');
        } else {
          setPublicMode('admin');
        }
      })
      .catch(() => {
        if (cancelled) return;
        if (currentPath !== '/' || previewWorkspaceId) {
          setPublicWorkspace(null);
          setPublicError('加载公开工作空间失败');
          setPublicMode('public');
        } else {
          setPublicMode('admin');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentPath, previewWorkspaceId]);

  // Verify admin auth session on mount (admin mode only)
  useEffect(() => {
    if (publicMode !== 'admin') return;
    let cancelled = false;
    fetchAuthStatus()
      .then((status) => {
        if (!cancelled) {
          setAuthStatus(status);
          setAuthChecked(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuthChecked(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [publicMode]);

  // Detect Userscript bridge
  useEffect(() => {
    if (publicMode !== 'admin') return;
    const checkBridge = () => {
      const version = document.documentElement.getAttribute('data-paneldeck-bridge');
      setBridgeVersion(version);
      setBridgeActive(Boolean(version));
    };
    checkBridge();
    window.addEventListener('paneldeck-bridge-ready', checkBridge);
    const attrObserver = new MutationObserver(checkBridge);
    attrObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-paneldeck-bridge'],
    });
    return () => {
      window.removeEventListener('paneldeck-bridge-ready', checkBridge);
      attrObserver.disconnect();
    };
  }, [publicMode]);

  // Global keyboard shortcuts (active only when admin is authenticated)
  useEffect(() => {
    if (publicMode !== 'admin' || !authStatus.authenticated) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      } else if (
        e.key === '/' &&
        !commandOpen &&
        !drawerOpen &&
        !settingsOpen &&
        !groupManagerOpen &&
        !workspaceModalOpen &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        setCommandOpen(false);
        setSettingsOpen(false);
        setGroupManagerOpen(false);
        setWorkspaceModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [publicMode, authStatus.authenticated, commandOpen, drawerOpen, settingsOpen, groupManagerOpen, workspaceModalOpen]);

  // Initial load from localStorage (admin mode only — used as local cache or migration source)
  useEffect(() => {
    if (publicMode !== 'admin') return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setHydrated(true);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as EncryptedVaultEnvelope | PanelNode[];
      if (Array.isArray(parsed)) {
        setNodes(parsed);
      } else if (
        parsed &&
        (parsed.format === 'paneldeck-vault-v1' || parsed.format === 'opsdeck-vault-v2')
      ) {
        if (parsed.encrypted) {
          setLockedEnvelope(parsed);
        } else if (Array.isArray(parsed.nodes)) {
          setNodes(parsed.nodes);
          if (Array.isArray(parsed.workspaces) && parsed.workspaces.length > 0) {
            setWorkspaces(parsed.workspaces);
          }
        }
      }
    } catch {
      // Ignore malformed storage
    } finally {
      setHydrated(true);
    }
  }, [publicMode]);

  // Load authoritative workspace & node state from server after admin authentication
  useEffect(() => {
    if (publicMode !== 'admin' || !hydrated || !authChecked || !authStatus.authenticated) return;
    if (serverStateLoaded) return;

    let cancelled = false;
    fetchAdminState()
      .then((res) => {
        if (cancelled) return;
        if (res.unauthorized) {
          setAuthStatus((prev) => ({ ...prev, authenticated: false }));
          return;
        }
        if (
          res.ok &&
          res.hasSavedState &&
          res.state &&
          Array.isArray(res.state.workspaces) &&
          res.state.workspaces.length > 0
        ) {
          const srvWorkspaces = res.state.workspaces;
          const srvNodes = Array.isArray(res.state.nodes) ? res.state.nodes : [];
          const srvActiveId =
            res.state.activeWorkspaceId &&
            srvWorkspaces.some((w) => w.id === res.state!.activeWorkspaceId)
              ? res.state.activeWorkspaceId
              : srvWorkspaces[0].id;
          const srvViewMode: ViewMode =
            res.state.viewMode === 'table' || res.state.viewMode === 'grid'
              ? res.state.viewMode
              : viewMode;

          lastSavedServerSigRef.current = JSON.stringify({
            activeWorkspaceId: srvActiveId,
            viewMode: srvViewMode,
            workspaces: srvWorkspaces,
            nodes: srvNodes,
          });
          setWorkspaces(srvWorkspaces);
          setActiveWorkspaceId(srvActiveId);
          setViewMode(srvViewMode);
          setNodes(srvNodes);
          setLockedEnvelope(null);
          localStorage.setItem(
            WORKSPACES_STORAGE_KEY,
            JSON.stringify({ activeWorkspaceId: srvActiveId, workspaces: srvWorkspaces })
          );
          if (!masterPassphrase) {
            localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify({
                format: 'opsdeck-vault-v2',
                encrypted: false,
                nodes: srvNodes,
                workspaces: srvWorkspaces,
                updatedAt: res.state.updatedAt || new Date().toISOString(),
              } satisfies EncryptedVaultEnvelope)
            );
          }
          setServerStateLoaded(true);
          return;
        }

        if (res.ok && !res.hasSavedState) {
          const hasCustomLocalData =
            nodes.length > 0 ||
            workspaces.length > 1 ||
            workspaces[0]?.name !== '默认空间' ||
            Boolean(workspaces[0]?.isPublic) ||
            Boolean(workspaces[0]?.description);

          if (lockedEnvelope) {
            lastSavedServerSigRef.current = '';
            pendingMigrationToastRef.current = true;
          } else if (hasCustomLocalData) {
            // Trigger immediate automatic migration of existing localStorage data to server
            lastSavedServerSigRef.current = '';
            pendingMigrationToastRef.current = true;
          } else {
            lastSavedServerSigRef.current = JSON.stringify({
              activeWorkspaceId,
              viewMode,
              workspaces,
              nodes,
            });
          }
          setServerStateLoaded(true);
          return;
        }

        // Transient fetch error: keep local state without overwriting server
        lastSavedServerSigRef.current = JSON.stringify({
          activeWorkspaceId,
          viewMode,
          workspaces,
          nodes,
        });
        setServerStateLoaded(true);
        notify('读取服务端数据失败，暂时显示本地缓存');
      })
      .catch(() => {
        if (cancelled) return;
        lastSavedServerSigRef.current = JSON.stringify({
          activeWorkspaceId,
          viewMode,
          workspaces,
          nodes,
        });
        setServerStateLoaded(true);
        notify('连接服务端失败，暂时显示本地缓存');
      });

    return () => {
      cancelled = true;
    };
  }, [
    publicMode,
    hydrated,
    authChecked,
    authStatus.authenticated,
    serverStateLoaded,
    masterPassphrase,
    lockedEnvelope,
    activeWorkspaceId,
    viewMode,
    workspaces,
    nodes,
    notify,
  ]);

  // Persist changes back to server DATA_DIR automatically
  useEffect(() => {
    if (
      publicMode !== 'admin' ||
      !authStatus.authenticated ||
      !serverStateLoaded ||
      lockedEnvelope
    ) {
      return;
    }
    const payload = { activeWorkspaceId, viewMode, workspaces, nodes };
    const sig = JSON.stringify(payload);
    if (sig === lastSavedServerSigRef.current) return;

    const timer = window.setTimeout(() => {
      void saveAdminState(payload).then((res) => {
        if (res.unauthorized) {
          setServerStateLoaded(false);
          setAuthStatus((prev) => ({ ...prev, authenticated: false }));
          return;
        }
        if (res.ok) {
          lastSavedServerSigRef.current = sig;
          if (pendingMigrationToastRef.current) {
            pendingMigrationToastRef.current = false;
            notify('已将本地站点数据同步至服务端，后续跨域名/设备自动同步');
          }
        }
      });
    }, 60);

    return () => window.clearTimeout(timer);
  }, [
    publicMode,
    authStatus.authenticated,
    serverStateLoaded,
    lockedEnvelope,
    activeWorkspaceId,
    viewMode,
    workspaces,
    nodes,
    notify,
  ]);

  const persistNodes = useCallback(
    async (
      nextNodes: PanelNode[],
      passphraseOverride?: string | null,
      workspacesOverride?: Workspace[]
    ) => {
      const activePass = passphraseOverride !== undefined ? passphraseOverride : masterPassphrase;
      const wsList = workspacesOverride ?? workspaces;
      if (activePass) {
        const envelope = await encryptVaultNodes(nextNodes, activePass, wsList);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
      } else {
        const envelope: EncryptedVaultEnvelope = {
          format: 'opsdeck-vault-v2',
          encrypted: false,
          nodes: nextNodes,
          workspaces: wsList,
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
      }
    },
    [masterPassphrase, workspaces]
  );

  const updateNodes = useCallback(
    (updater: (prev: PanelNode[]) => PanelNode[], workspacesOverride?: Workspace[]) => {
      setNodes((prev) => {
        const next = updater(prev);
        void persistNodes(next, undefined, workspacesOverride);
        return next;
      });
    },
    [persistNodes]
  );

  const defaultWorkspaceId = workspaces[0]?.id || DEFAULT_WORKSPACE_ID;

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0] ?? createDefaultWorkspace(),
    [workspaces, activeWorkspaceId]
  );

  const resolveNodeWorkspaceId = useCallback(
    (node: PanelNode): string => {
      if (node.workspaceId && workspaces.some((w) => w.id === node.workspaceId)) {
        return node.workspaceId;
      }
      return defaultWorkspaceId;
    },
    [workspaces, defaultWorkspaceId]
  );

  const nodeCountsByWorkspace = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ws of workspaces) counts[ws.id] = 0;
    for (const node of nodes) {
      const wsId = resolveNodeWorkspaceId(node);
      counts[wsId] = (counts[wsId] || 0) + 1;
    }
    return counts;
  }, [workspaces, nodes, resolveNodeWorkspaceId]);

  const workspaceNodes = useMemo(
    () => nodes.filter((node) => resolveNodeWorkspaceId(node) === activeWorkspace.id),
    [nodes, activeWorkspace.id, resolveNodeWorkspaceId]
  );

  const buildPublicNodesForWorkspace = useCallback(
    (wsId: string, nodeList: PanelNode[], wsList: Workspace[]): PublicNodeItem[] => {
      const fallbackWsId = wsList[0]?.id || DEFAULT_WORKSPACE_ID;
      return nodeList
        .filter((n) => {
          const resolved =
            n.workspaceId && wsList.some((w) => w.id === n.workspaceId)
              ? n.workspaceId
              : fallbackWsId;
          return resolved === wsId;
        })
        .map((n) => ({
          id: n.id,
          name: n.name,
          targetUrl: buildPanelTargetUrl(n),
          group: n.group || '默认分组',
          provider: n.provider || undefined,
          region: n.region || undefined,
          notes: n.notes || undefined,
          pinned: Boolean(n.pinned),
        }));
    },
    []
  );

  // Automatically keep sanitized public workspace projections synced with server
  useEffect(() => {
    if (
      publicMode !== 'admin' ||
      !authStatus.authenticated ||
      !hydrated ||
      !serverStateLoaded ||
      lockedEnvelope
    ) {
      return;
    }
    for (const ws of workspaces) {
      if (ws.isPublic && (ws.publicRoute || ws.publicDomain)) {
        const publicNodes = buildPublicNodesForWorkspace(ws.id, nodes, workspaces);
        const signature = JSON.stringify({
          name: ws.name,
          description: ws.description || '',
          publicRoute: ws.publicRoute || '',
          publicDomain: ws.publicDomain || '',
          publicProtocol: ws.publicProtocol || 'https',
          nodes: publicNodes,
        });
        if (lastSyncedPublicRef.current[ws.id] !== signature) {
          lastSyncedPublicRef.current[ws.id] = signature;
          void syncPublicWorkspace(ws, publicNodes);
        }
      } else if (lastSyncedPublicRef.current[ws.id]) {
        delete lastSyncedPublicRef.current[ws.id];
        void removePublicWorkspace(ws.id);
      }
    }
  }, [
    publicMode,
    authStatus.authenticated,
    hydrated,
    serverStateLoaded,
    lockedEnvelope,
    workspaces,
    nodes,
    buildPublicNodesForWorkspace,
  ]);

  const handleLogout = async () => {
    await logoutAdminAccount();
    lastSavedServerSigRef.current = '';
    setServerStateLoaded(false);
    setAuthStatus({
      initialized: true,
      authenticated: false,
      envManaged: authStatus.envManaged,
    });
    setCommandOpen(false);
    setSettingsOpen(false);
    setDrawerOpen(false);
    setGroupManagerOpen(false);
    setWorkspaceModalOpen(false);
  };

  const handleUnlockVault = async (passphrase: string): Promise<boolean> => {
    if (!lockedEnvelope) return true;
    try {
      const bundle = await decryptVaultBundle(lockedEnvelope, passphrase);
      setNodes(bundle.nodes);
      if (bundle.workspaces && bundle.workspaces.length > 0) {
        setWorkspaces(bundle.workspaces);
        if (!bundle.workspaces.some((w) => w.id === activeWorkspaceId)) {
          setActiveWorkspaceId(bundle.workspaces[0].id);
        }
      }
      setMasterPassphrase(passphrase);
      setLockedEnvelope(null);
      return true;
    } catch {
      return false;
    }
  };

  const handleEnableMasterLock = async (passphrase: string) => {
    setMasterPassphrase(passphrase);
    await persistNodes(nodes, passphrase);
    notify('已启用主密码加密保护');
  };

  const handleDisableMasterLock = () => {
    setMasterPassphrase(null);
    void persistNodes(nodes, null);
    notify('已移除主密码');
  };

  const handleLockNow = async () => {
    if (!masterPassphrase) return;
    const envelope = await encryptVaultNodes(nodes, masterPassphrase, workspaces);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    setNodes([]);
    setMasterPassphrase(null);
    setLockedEnvelope(envelope);
  };

  const groupCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of workspaceNodes) {
      const g = n.group || '默认分组';
      map.set(g, (map.get(g) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [workspaceNodes]);

  const allKnownGroups = useMemo(() => {
    const set = new Set<string>(activeWorkspace.groups || []);
    for (const n of workspaceNodes) {
      if (n.group) set.add(n.group);
    }
    return Array.from(set);
  }, [activeWorkspace.groups, workspaceNodes]);

  const groupManagerList = useMemo(() => {
    const countMap = new Map(groupCounts.map((g) => [g.name, g.count]));
    return allKnownGroups.map((name) => ({
      name,
      count: countMap.get(name) || 0,
    }));
  }, [allKnownGroups, groupCounts]);

  const filteredNodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = workspaceNodes.filter((node) => {
      if (selectedGroup !== 'all' && (node.group || '默认分组') !== selectedGroup) return false;
      if (!q) return true;
      return (
        node.name.toLowerCase().includes(q) ||
        node.baseUrl.toLowerCase().includes(q) ||
        node.entrance.toLowerCase().includes(q) ||
        node.username.toLowerCase().includes(q) ||
        node.group.toLowerCase().includes(q) ||
        node.provider.toLowerCase().includes(q) ||
        node.region.toLowerCase().includes(q) ||
        (node.notes || '').toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'pinned') {
        if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
        return a.name.localeCompare(b.name, 'zh-CN');
      }
      if (sortBy === 'recent') {
        const ta = a.lastAccessedAt ? Date.parse(a.lastAccessedAt) : 0;
        const tb = b.lastAccessedAt ? Date.parse(b.lastAccessedAt) : 0;
        if (ta !== tb) return tb - ta;
        return a.name.localeCompare(b.name, 'zh-CN');
      }
      if (sortBy === 'group') {
        const ga = (a.group || '默认分组').localeCompare(b.group || '默认分组', 'zh-CN');
        if (ga !== 0) return ga;
        return a.name.localeCompare(b.name, 'zh-CN');
      }
      return a.name.localeCompare(b.name, 'zh-CN');
    });
  }, [workspaceNodes, searchQuery, selectedGroup, sortBy]);

  const updateActiveWorkspaceGroups = useCallback(
    (updater: (prevGroups: string[]) => string[]) => {
      const now = new Date().toISOString();
      setWorkspaces((prev) =>
        prev.map((ws) =>
          ws.id === activeWorkspace.id
            ? { ...ws, groups: updater(ws.groups || []), updatedAt: now }
            : ws
        )
      );
    },
    [activeWorkspace.id]
  );

  const handleSaveNode = (
    data: Omit<PanelNode, 'id' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => {
    const now = new Date().toISOString();
    const targetWorkspaceId = data.workspaceId || activeWorkspace.id;

    if (existingId) {
      updateNodes((prev) =>
        prev.map((item) =>
          item.id === existingId ? { ...item, ...data, workspaceId: targetWorkspaceId, updatedAt: now } : item
        )
      );
      notify(`已更新 ${data.name}`);
    } else {
      const created: PanelNode = {
        ...data,
        workspaceId: targetWorkspaceId,
        id: generateId(),
        createdAt: now,
        updatedAt: now,
      };
      updateNodes((prev) => [created, ...prev]);
      notify(`已添加 ${data.name}`);
    }

    if (data.group) {
      setWorkspaces((prev) =>
        prev.map((ws) =>
          ws.id === targetWorkspaceId && !ws.groups.includes(data.group)
            ? { ...ws, groups: [...ws.groups, data.group], updatedAt: now }
            : ws
        )
      );
    }

    setDrawerOpen(false);
    setEditingNode(null);
  };

  const handleSelectWorkspace = (id: string) => {
    setActiveWorkspaceId(id);
    setSelectedGroup('all');
  };

  const handleSaveWorkspace = async (
    data: {
      name: string;
      description: string;
      isPublic: boolean;
      publicRoute: string;
      publicDomain: string;
      publicProtocol: 'http' | 'https';
    },
    existingId?: string
  ): Promise<string | null> => {
    const now = new Date().toISOString();
    if (existingId) {
      const targetWs = workspaces.find((w) => w.id === existingId);
      if (!targetWs) return '未找到对应工作空间';
      const updatedWs: Workspace = {
        ...targetWs,
        name: data.name,
        description: data.description,
        isPublic: data.isPublic,
        publicRoute: data.isPublic ? data.publicRoute : '',
        publicDomain: data.isPublic ? data.publicDomain : '',
        publicProtocol: data.isPublic && data.publicDomain ? data.publicProtocol : undefined,
        updatedAt: now,
      };
      const nextWorkspaces = workspaces.map((ws) => (ws.id === existingId ? updatedWs : ws));

      if (updatedWs.isPublic && (updatedWs.publicRoute || updatedWs.publicDomain)) {
        const publicNodes = buildPublicNodesForWorkspace(existingId, nodes, nextWorkspaces);
        const res = await syncPublicWorkspace(updatedWs, publicNodes);
        if (!res.ok) {
          return res.message || '公开访问保存失败，请检查域名或路由配置';
        }
        lastSyncedPublicRef.current[existingId] = JSON.stringify({
          name: updatedWs.name,
          description: updatedWs.description || '',
          publicRoute: updatedWs.publicRoute || '',
          publicDomain: updatedWs.publicDomain || '',
          publicProtocol: updatedWs.publicProtocol || 'https',
          nodes: publicNodes,
        });
      } else if (targetWs.isPublic) {
        delete lastSyncedPublicRef.current[existingId];
        await removePublicWorkspace(existingId);
      }

      setWorkspaces(nextWorkspaces);
      void persistNodes(nodes, undefined, nextWorkspaces);
      notify(`已更新工作空间「${data.name}」`);
    } else {
      const created: Workspace = {
        id: `ws-${generateId().slice(0, 8)}`,
        name: data.name,
        description: data.description,
        groups: [...DEFAULT_WORKSPACE_GROUPS],
        isPublic: data.isPublic,
        publicRoute: data.isPublic ? data.publicRoute : '',
        publicDomain: data.isPublic ? data.publicDomain : '',
        publicProtocol: data.isPublic && data.publicDomain ? data.publicProtocol : undefined,
        createdAt: now,
        updatedAt: now,
      };
      const nextWorkspaces = [...workspaces, created];

      if (created.isPublic && (created.publicRoute || created.publicDomain)) {
        const res = await syncPublicWorkspace(created, []);
        if (!res.ok) {
          return res.message || '公开访问保存失败，请检查域名或路由配置';
        }
        lastSyncedPublicRef.current[created.id] = JSON.stringify({
          name: created.name,
          description: created.description || '',
          publicRoute: created.publicRoute || '',
          publicDomain: created.publicDomain || '',
          publicProtocol: created.publicProtocol || 'https',
          nodes: [],
        });
      }

      setWorkspaces(nextWorkspaces);
      setActiveWorkspaceId(created.id);
      setSelectedGroup('all');
      void persistNodes(nodes, undefined, nextWorkspaces);
      notify(`已创建并切换至「${created.name}」`);
    }
    setWorkspaceModalOpen(false);
    setEditingWorkspace(null);
    return null;
  };

  const handleDeleteWorkspace = (id: string) => {
    if (workspaces.length <= 1) return;
    const target = workspaces.find((w) => w.id === id);
    const nextWorkspaces = workspaces.filter((w) => w.id !== id);
    delete lastSyncedPublicRef.current[id];
    void removePublicWorkspace(id);
    setWorkspaces(nextWorkspaces);
    if (activeWorkspaceId === id) {
      setActiveWorkspaceId(nextWorkspaces[0].id);
      setSelectedGroup('all');
    }
    updateNodes((prev) => prev.filter((n) => resolveNodeWorkspaceId(n) !== id), nextWorkspaces);
    setWorkspaceModalOpen(false);
    setEditingWorkspace(null);
    if (target) {
      notify(`已删除工作空间「${target.name}」`);
    }
  };

  const handleAddGroup = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    updateActiveWorkspaceGroups((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    notify(`已创建分组「${trimmed}」`);
  };

  const handleRenameGroup = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    updateActiveWorkspaceGroups((prev) =>
      Array.from(new Set(prev.map((g) => (g === oldName ? trimmed : g)).concat(trimmed)))
    );
    updateNodes((prev) =>
      prev.map((item) =>
        resolveNodeWorkspaceId(item) === activeWorkspace.id && (item.group || '默认分组') === oldName
          ? { ...item, group: trimmed }
          : item
      )
    );
    if (selectedGroup === oldName) {
      setSelectedGroup(trimmed);
    }
    notify(`已将分组「${oldName}」重命名为「${trimmed}」`);
  };

  const handleDeleteGroup = (name: string) => {
    updateActiveWorkspaceGroups((prev) => prev.filter((g) => g !== name));
    updateNodes((prev) =>
      prev.map((item) =>
        resolveNodeWorkspaceId(item) === activeWorkspace.id && (item.group || '默认分组') === name
          ? { ...item, group: '默认分组' }
          : item
      )
    );
    if (selectedGroup === name) {
      setSelectedGroup('all');
    }
    notify(`已删除分组「${name}」，组内站点已移至默认分组`);
  };

  const handleDeleteNode = (id: string) => {
    updateNodes((prev) => prev.filter((item) => item.id !== id));
    setDrawerOpen(false);
    setEditingNode(null);
    notify('已删除站点');
  };

  const handleLaunchNode = (node: PanelNode) => {
    const wsId = resolveNodeWorkspaceId(node);
    const ws = workspaces.find((w) => w.id === wsId) ?? activeWorkspace;
    const payload = {
      id: node.id,
      name: node.name,
      panelType: ws.panelType,
      origin: normalizeBaseUrl(node.baseUrl),
      targetUrl: buildPanelTargetUrl(node),
      entrance: normalizeEntrance(node.entrance),
      username: node.username,
      password: node.password,
      version: node.version,
      autoSubmit: node.autoSubmit,
      authMode: node.authMode === 'basic' ? 'basic' : 'form',
      ts: Date.now(),
    };
    window.dispatchEvent(
      new CustomEvent('1panel-hub-launch', { detail: JSON.stringify(payload) })
    );
    try {
      window.postMessage({ type: 'waymark-hub-launch', payload }, window.location.origin);
    } catch {
      // Ignore postMessage errors
    }

    const now = new Date().toISOString();
    updateNodes((prev) =>
      prev.map((item) => (item.id === node.id ? { ...item, lastAccessedAt: now } : item))
    );

    if (bridgeActive) {
      notify(`正在登录 ${node.name}`);
    } else {
      notify(`正在打开 ${node.name}（在右上角设置安装脚本可自动填充）`);
    }
  };

  const handleProbeNode = async (node: PanelNode) => {
    const wsId = resolveNodeWorkspaceId(node);
    const ws = workspaces.find((w) => w.id === wsId) ?? activeWorkspace;

    updateNodes((prev) =>
      prev.map((item) =>
        item.id === node.id
          ? {
              ...item,
              probe: {
                status: 'checking',
                message: '探测中...',
                checkedAt: new Date().toISOString(),
              },
            }
          : item
      )
    );

    try {
      const result = await probePanelNode({
        baseUrl: node.baseUrl,
        entrance: node.entrance,
        username: node.username,
        password: node.password,
        version: node.version,
        panelType: ws.panelType,
        verifyAuth: Boolean(node.username && node.password),
      });
      if (result.unauthorized) {
        await handleLogout();
        return;
      }
      updateNodes((prev) =>
        prev.map((item) => (item.id === node.id ? { ...item, probe: result } : item))
      );
    } catch {
      updateNodes((prev) =>
        prev.map((item) =>
          item.id === node.id
            ? {
                ...item,
                probe: {
                  status: 'unreachable',
                  message: '探测请求异常',
                  checkedAt: new Date().toISOString(),
                },
              }
            : item
        )
      );
    }
  };

  const handleBatchProbe = async () => {
    if (filteredNodes.length === 0 || batchProbing) return;
    setBatchProbing(true);
    const concurrency = 4;
    const queue = [...filteredNodes];
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (next) {
          await handleProbeNode(next);
        }
      }
    });
    await Promise.all(workers);
    setBatchProbing(false);
    notify('全部站点探测完成');
  };

  const handleCopy = async (label: string, value: string) => {
    const ok = await copyTextToClipboard(value);
    notify(ok ? `已复制${label}` : `复制${label}失败`);
  };

  const handleTogglePin = (node: PanelNode) => {
    updateNodes((prev) =>
      prev.map((item) => (item.id === node.id ? { ...item, pinned: !item.pinned } : item))
    );
  };

  const handleImportNodes = (
    imported: PanelNode[],
    replaceAll = false,
    importedWorkspaces?: Workspace[]
  ) => {
    let nextWorkspaces = workspaces;
    if (importedWorkspaces && importedWorkspaces.length > 0) {
      const existingIds = new Set(workspaces.map((w) => w.id));
      const additions = importedWorkspaces.filter((w) => !existingIds.has(w.id));
      if (additions.length > 0) {
        nextWorkspaces = [...workspaces, ...additions];
        setWorkspaces(nextWorkspaces);
      }
    }

    const validWsIds = new Set(nextWorkspaces.map((w) => w.id));
    const normalizedImported = imported.map((item) => ({
      ...item,
      workspaceId:
        item.workspaceId && validWsIds.has(item.workspaceId)
          ? item.workspaceId
          : activeWorkspace.id,
    }));

    updateNodes((prev) => {
      if (replaceAll) return normalizedImported;
      const existingKeys = new Set(
        prev.map((p) => `${resolveNodeWorkspaceId(p)}|${p.baseUrl}${p.entrance}`)
      );
      const merged = [...prev];
      for (const item of normalizedImported) {
        const key = `${item.workspaceId}|${item.baseUrl}${item.entrance}`;
        if (!existingKeys.has(key)) {
          merged.push(item);
          existingKeys.add(key);
        }
      }
      return merged;
    }, nextWorkspaces);
    notify(`已导入 ${imported.length} 个站点`);
  };

  if (publicMode === 'checking') {
    return <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#09090B]" />;
  }

  if (publicMode === 'public') {
    return (
      <PublicWorkspaceView
        loading={false}
        workspace={publicWorkspace}
        errorMessage={publicError}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
      />
    );
  }

  if (!hydrated || !authChecked) {
    return <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#09090B]" />;
  }

  // Enforce Administrator Authentication before accessing any workspace view
  if (!authStatus.authenticated) {
    return (
      <AdminAuthScreen
        initialized={authStatus.initialized}
        onAuthenticated={(username) => {
          setAuthStatus((prev) => ({
            ...prev,
            initialized: true,
            authenticated: true,
            username,
            role: 'admin',
          }));
        }}
      />
    );
  }

  if (!serverStateLoaded) {
    return <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#09090B]" />;
  }

  if (lockedEnvelope) {
    return <VaultLockScreen onUnlock={handleUnlockVault} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA] dark:bg-[#09090B] text-[#09090B] dark:text-[#FAFAFA]">
      <TopBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchInputRef={searchInputRef}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        onOpenSettings={() => openSettings(bridgeActive ? 'import' : 'bridge')}
        onOpenBridge={() => openSettings('bridge')}
        bridgeStatus={bridgeActive && bridgeVersion !== BRIDGE_VERSION ? 'stale' : undefined}
        bridgeVersion={bridgeVersion}
        onAddNew={() => {
          setEditingNode(null);
          setDrawerOpen(true);
        }}
        adminUsername={authStatus.username}
        onLogout={handleLogout}
      />

      <main className="flex-1 w-full max-w-[1240px] mx-auto px-4 sm:px-6 py-7 space-y-6">
        {/* Workspace Switcher */}
        <WorkspaceBar
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspace.id}
          nodeCountsByWorkspace={nodeCountsByWorkspace}
          onSelectWorkspace={handleSelectWorkspace}
          onCreateWorkspace={() => {
            setEditingWorkspace(null);
            setWorkspaceModalOpen(true);
          }}
          onEditWorkspace={(ws) => {
            setEditingWorkspace(ws);
            setWorkspaceModalOpen(true);
          }}
        />

        {activeWorkspace.description && (
          <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] -mt-2 max-w-3xl leading-relaxed">
            {activeWorkspace.description}
          </p>
        )}

        {workspaceNodes.length === 0 ? (
          /* Guided First-Panel Onboarding per workspace (no sample/preview data) */
          <FirstPanelOnboarding
            workspace={activeWorkspace}
            bridgeActive={bridgeActive}
            existingGroups={allKnownGroups}
            onSaveFirstNode={(data) => handleSaveNode(data)}
            onOpenImport={() => openSettings('import')}
            onOpenBridge={() => openSettings('bridge')}
          />
        ) : (
          <div className="space-y-5">
            {/* Editorial underline group tabs + aligned view controls */}
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#E4E4E7] dark:border-[#27272A]">
              <div className="flex items-center gap-6 overflow-x-auto no-scrollbar" role="tablist" aria-label="分组筛选">
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedGroup === 'all'}
                  onClick={() => setSelectedGroup('all')}
                  className={`relative pb-3 text-[13px] font-medium transition-colors whitespace-nowrap focus-visible:outline-none ${
                    selectedGroup === 'all'
                      ? 'text-[#09090B] dark:text-[#FAFAFA]'
                      : 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#FAFAFA]'
                  }`}
                >
                  <span>全部</span>
                  <span className="ml-1.5 font-mono text-[11px] tabular-nums text-[#A1A1AA] dark:text-[#71717A]">
                    {workspaceNodes.length}
                  </span>
                  {selectedGroup === 'all' && (
                    <motion.span
                      layoutId="group-tab-underline"
                      transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 h-[2px] bg-[#09090B] dark:bg-[#FAFAFA]"
                    />
                  )}
                </button>

                {groupCounts.map((grp) => {
                  const active = selectedGroup === grp.name;
                  return (
                    <button
                      key={grp.name}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setSelectedGroup(grp.name)}
                      className={`relative pb-3 text-[13px] font-medium transition-colors whitespace-nowrap focus-visible:outline-none ${
                        active
                          ? 'text-[#09090B] dark:text-[#FAFAFA]'
                          : 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#FAFAFA]'
                      }`}
                    >
                      <span>{grp.name}</span>
                      <span className="ml-1.5 font-mono text-[11px] tabular-nums text-[#A1A1AA] dark:text-[#71717A]">
                        {grp.count}
                      </span>
                      {active && (
                        <motion.span
                          layoutId="group-tab-underline"
                          transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                          aria-hidden="true"
                          className="absolute inset-x-0 bottom-0 h-[2px] bg-[#09090B] dark:bg-[#FAFAFA]"
                        />
                      )}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setGroupManagerOpen(true)}
                  aria-label="管理分组"
                  title="新建、重命名或删除分组"
                  className="inline-flex items-center gap-1 pb-3 text-[12px] text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#FAFAFA] transition-colors whitespace-nowrap shrink-0"
                >
                  <Pencil className="w-3 h-3" aria-hidden="true" />
                  <span>管理分组</span>
                </button>
              </div>

              <div className="flex items-center gap-2 pb-2">
                {viewMode === 'table' && (
                  <button
                    type="button"
                    onClick={handleBatchProbe}
                    disabled={batchProbing || filteredNodes.length === 0}
                    className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium text-[#52525B] dark:text-[#A1A1AA] bg-white dark:bg-[#111113] border border-[#E4E4E7] dark:border-[#27272A] hover:border-[#A1A1AA] dark:hover:border-[#3F3F46] hover:text-[#09090B] dark:hover:text-white rounded-lg transition-colors active:scale-[0.98] disabled:opacity-40 whitespace-nowrap"
                  >
                    {batchProbing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Activity className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    <span>{batchProbing ? '探测中' : '全部检测'}</span>
                  </button>
                )}

                <CustomSelect<SortOption>
                  ariaLabel="站点排序方式"
                  value={sortBy}
                  onChange={setSortBy}
                  options={[
                    { value: 'pinned', label: '置顶优先' },
                    { value: 'recent', label: '最近访问' },
                    { value: 'name', label: '名称排序' },
                    { value: 'group', label: '按分组' },
                  ]}
                />

                <div className="inline-flex h-8 p-0.5 bg-[#F4F4F5] dark:bg-[#18181B] rounded-lg border border-[#E4E4E7] dark:border-[#27272A]">
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    aria-label="卡片模式"
                    aria-pressed={viewMode === 'grid'}
                    className={`relative inline-flex items-center gap-1.5 px-2.5 text-[12px] font-medium rounded-md transition-colors whitespace-nowrap ${
                      viewMode === 'grid'
                        ? 'text-[#09090B] dark:text-white'
                        : 'text-[#71717A] hover:text-[#09090B] dark:hover:text-white'
                    }`}
                  >
                    {viewMode === 'grid' && (
                      <motion.span
                        layoutId="view-mode-pill"
                        transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                        className="absolute inset-0 bg-white dark:bg-[#27272A] rounded-md shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                      />
                    )}
                    <LayoutGrid className="relative z-10 w-3.5 h-3.5" aria-hidden="true" />
                    <span className="relative z-10">卡片</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    aria-label="详细模式"
                    aria-pressed={viewMode === 'table'}
                    className={`relative inline-flex items-center gap-1.5 px-2.5 text-[12px] font-medium rounded-md transition-colors whitespace-nowrap ${
                      viewMode === 'table'
                        ? 'text-[#09090B] dark:text-white'
                        : 'text-[#71717A] hover:text-[#09090B] dark:hover:text-white'
                    }`}
                  >
                    {viewMode === 'table' && (
                      <motion.span
                        layoutId="view-mode-pill"
                        transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                        className="absolute inset-0 bg-white dark:bg-[#27272A] rounded-md shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                      />
                    )}
                    <List className="relative z-10 w-3.5 h-3.5" aria-hidden="true" />
                    <span className="relative z-10">详细</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Cards (default) vs Detailed Table */}
            <AnimatePresence mode="wait">
              {filteredNodes.length === 0 ? (
                <motion.div
                  key="empty-filter"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="py-16 text-center"
                >
                  <p className="text-sm text-[#71717A]">未找到匹配的站点</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedGroup('all');
                    }}
                    className="mt-3 text-xs text-[#09090B] dark:text-white underline underline-offset-4"
                  >
                    清除筛选
                  </button>
                </motion.div>
              ) : viewMode === 'grid' ? (
                <motion.div
                  key={`view-grid-${activeWorkspace.id}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                >
                  <PanelGrid
                    nodes={filteredNodes}
                    panelType={activeWorkspace.panelType}
                    onEdit={(n) => {
                      setEditingNode(n);
                      setDrawerOpen(true);
                    }}
                    onLaunch={handleLaunchNode}
                    onTogglePin={handleTogglePin}
                    onCopy={handleCopy}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key={`view-table-${activeWorkspace.id}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                >
                  <PanelTable
                    nodes={filteredNodes}
                    panelType={activeWorkspace.panelType}
                    onEdit={(n) => {
                      setEditingNode(n);
                      setDrawerOpen(true);
                    }}
                    onLaunch={handleLaunchNode}
                    onProbe={handleProbeNode}
                    onTogglePin={handleTogglePin}
                    onCopy={handleCopy}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </main>

      <PanelDrawer
        open={drawerOpen}
        workspace={activeWorkspace}
        editingNode={editingNode}
        existingGroups={allKnownGroups}
        onClose={() => {
          setDrawerOpen(false);
          setEditingNode(null);
        }}
        onSave={handleSaveNode}
        onDelete={handleDeleteNode}
      />

      <WorkspaceModal
        open={workspaceModalOpen}
        editingWorkspace={editingWorkspace}
        existingWorkspaces={workspaces}
        nodeCount={editingWorkspace ? nodeCountsByWorkspace[editingWorkspace.id] || 0 : 0}
        canDelete={workspaces.length > 1}
        onClose={() => {
          setWorkspaceModalOpen(false);
          setEditingWorkspace(null);
        }}
        onSave={handleSaveWorkspace}
        onDelete={handleDeleteWorkspace}
      />

      <GroupManagerModal
        open={groupManagerOpen}
        groups={groupManagerList}
        onClose={() => setGroupManagerOpen(false)}
        onAddGroup={handleAddGroup}
        onRenameGroup={handleRenameGroup}
        onDeleteGroup={handleDeleteGroup}
      />

      <SettingsModal
        open={settingsOpen}
        initialTab={settingsTab}
        nodes={nodes}
        workspaces={workspaces}
        activeWorkspace={activeWorkspace}
        bridgeActive={bridgeActive}
        bridgeVersion={bridgeVersion}
        hasMasterLock={Boolean(masterPassphrase)}
        adminUsername={authStatus.username}
        envManaged={authStatus.envManaged}
        onLogout={handleLogout}
        onClose={() => setSettingsOpen(false)}
        onImportNodes={handleImportNodes}
        onEnableMasterLock={handleEnableMasterLock}
        onDisableMasterLock={handleDisableMasterLock}
        onLockNow={handleLockNow}
        onClearAll={() => {
          updateNodes(() => []);
          notify('已清空全部站点');
        }}
        onCopy={handleCopy}
        onNotify={notify}
      />

      <CommandPalette
        open={commandOpen}
        nodes={nodes}
        workspaces={workspaces}
        theme={theme}
        onClose={() => setCommandOpen(false)}
        onLaunch={handleLaunchNode}
        onAddNew={() => {
          setEditingNode(null);
          setDrawerOpen(true);
        }}
        onOpenBatchImport={() => openSettings('import')}
        onNavigate={(section) => {
          if (section === 'bridge') openSettings('bridge');
          if (section === 'security') openSettings('security');
        }}
        onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
      />

      <AnimatePresence>
        {toastMessage && (
          <motion.div
            key={toastMessage}
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-5 right-5 z-50 px-4 py-2.5 text-xs font-medium text-white bg-[#09090B] dark:bg-[#FAFAFA] dark:text-[#09090B] rounded-lg shadow-lg border border-black/[0.1] dark:border-white/[0.1]"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
