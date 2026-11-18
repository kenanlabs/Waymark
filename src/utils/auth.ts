import type {
  PanelProbeResult,
  PanelType,
  PanelVersion,
  PublicNodeItem,
  PublicWorkspaceViewData,
  ViewMode,
  Workspace,
} from '../types/panel';
import {
  BRIDGE_PROBE_REQUEST_EVENT,
  BRIDGE_PROBE_RESULT_EVENT,
  BRIDGE_VERSION,
} from './userscript';
import {
  EXTENSION_PROBE_REQUEST,
  EXTENSION_PROBE_RESULT,
  EXTENSION_VERSION,
} from './extensionMeta';

const ADMIN_TOKEN_KEY = 'paneldeck_admin_token_v1';

export interface AdminAuthStatus {
  initialized: boolean;
  authenticated: boolean;
  username?: string;
  role?: 'admin';
  envManaged?: boolean;
}

export function getStoredAdminToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredAdminToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function getAdminHeaders(): Record<string, string> {
  const token = getStoredAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchAuthStatus(): Promise<AdminAuthStatus> {
  const resp = await fetch('/api/auth/status', {
    credentials: 'include',
    headers: getAdminHeaders(),
  });
  if (!resp.ok) {
    throw new Error('Failed to check auth status');
  }
  return (await resp.json()) as AdminAuthStatus;
}

export async function setupAdminAccount(
  username: string,
  password: string
): Promise<{ ok: boolean; username?: string; message?: string }> {
  const resp = await fetch('/api/auth/setup', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = (await resp.json()) as {
    ok?: boolean;
    username?: string;
    token?: string;
    message?: string;
  };
  if (resp.ok && data.ok && data.token) {
    setStoredAdminToken(data.token);
    return { ok: true, username: data.username };
  }
  return { ok: false, message: data.message || '初始化失败，请重试' };
}

export async function loginAdminAccount(
  username: string,
  password: string
): Promise<{ ok: boolean; username?: string; message?: string }> {
  const resp = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = (await resp.json()) as {
    ok?: boolean;
    username?: string;
    token?: string;
    message?: string;
  };
  if (resp.ok && data.ok && data.token) {
    setStoredAdminToken(data.token);
    return { ok: true, username: data.username };
  }
  return { ok: false, message: data.message || '登录失败' };
}

export async function logoutAdminAccount(): Promise<void> {
  setStoredAdminToken(null);
  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  }).catch(() => undefined);
}

export async function changeAdminPassword(
  currentPassword: string,
  newPassword: string
): Promise<{ ok: boolean; message: string }> {
  const resp = await fetch('/api/auth/change-password', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...getAdminHeaders(),
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const data = (await resp.json()) as { ok?: boolean; token?: string; message?: string };
  if (resp.ok && data.ok) {
    if (data.token) setStoredAdminToken(data.token);
    return { ok: true, message: data.message || '密码已修改' };
  }
  return { ok: false, message: data.message || '修改密码失败' };
}

export async function probePanelNode(params: {
  baseUrl: string;
  entrance: string;
  username?: string;
  password?: string;
  version?: PanelVersion;
  panelType?: PanelType;
  verifyAuth?: boolean;
}): Promise<PanelProbeResult & { unauthorized?: boolean }> {
  const rawUrl = String(params.baseUrl || '').trim();
  const checkedAt = new Date().toISOString();

  if (!rawUrl) {
    return {
      status: 'unreachable',
      message: '缺少访问地址',
      checkedAt,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `http://${rawUrl}`);
  } catch {
    return {
      status: 'unreachable',
      message: '访问地址格式无效',
      checkedAt,
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      status: 'unreachable',
      message: '仅支持 HTTP 或 HTTPS 协议',
      checkedAt,
    };
  }

  const cleanedEntrance = String(params.entrance || '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  const entrancePath = cleanedEntrance ? `/${cleanedEntrance}` : '';
  const targetUrl = `${parsed.origin}${entrancePath}`;

  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const controller = new AbortController();
  const timeoutMs = 6000;
  let timer = 0;
  const elapsedMs = () =>
    Math.max(1, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt));
  const isHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const isLocalTarget =
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '[::1]';
  const extensionVersion = getExtensionVersion();
  const bridgeVersion = getBridgeVersion();
  const bridgeStale =
    !extensionVersion && Boolean(bridgeVersion) && !isVersionAtLeast(bridgeVersion, BRIDGE_VERSION);
  const bridgeNotResponding =
    '脚本或插件未响应。请刷新 Waymark 页面后重试，或下载安装最新版 Waymark 浏览器插件。';
  let bridgeUnsupported = false;
  let bridged: BridgeProbeResponse | null = null;

  try {
    if (extensionVersion) {
      const extResp = await probeViaExtension({
        url: targetUrl,
        timeoutMs,
        panelType: params.panelType,
        entrance: cleanedEntrance,
        username: params.username,
        password: params.password,
        version: params.version,
        verifyAuth: params.verifyAuth,
      });
      if (extResp?.bridged && extResp.result) {
        const extResult = extResp.result;
        const latencyMs = extResult.latencyMs || elapsedMs();
        if (extResult.ok) {
          if (extResult.authStatus === 'auth_ok') {
            return {
              status: 'auth_ok',
              httpStatus: extResult.status,
              latencyMs,
              message: `${extResult.authMessage || '插件检测连通且凭据有效'} (${latencyMs} ms)`,
              checkedAt: new Date().toISOString(),
            };
          }
          if (extResult.authStatus === 'auth_failed') {
            return {
              status: 'auth_failed',
              httpStatus: extResult.status,
              latencyMs,
              message: `${extResult.authMessage || '目标可达，但凭据校验未通过'} (${latencyMs} ms)`,
              checkedAt: new Date().toISOString(),
            };
          }
          const httpStatus = Number(extResult.status) || 0;
          if (httpStatus === 404) {
            return {
              status: 'unreachable',
              httpStatus: 404,
              latencyMs,
              message: `插件检测：返回 404，请核对入口路径是否正确 (${latencyMs} ms)`,
              checkedAt: new Date().toISOString(),
            };
          }
          if (httpStatus > 0) {
            return {
              status: 'reachable',
              httpStatus,
              latencyMs,
              message: `插件检测可达 · HTTP ${httpStatus} (${latencyMs} ms)`,
              checkedAt: new Date().toISOString(),
            };
          }
        }
        if (extResult.error === 'timeout') {
          return {
            status: 'unreachable',
            latencyMs,
            message: '插件检测超时 (6s)，请检查目标地址、端口或网络连通性。',
            checkedAt: new Date().toISOString(),
          };
        }
        return {
          status: 'unreachable',
          latencyMs,
          message: extResult.message || '插件检测：目标无法连接，请检查地址或自签名证书。',
          checkedAt: new Date().toISOString(),
        };
      }
    }

    bridged = await probeViaBridge(targetUrl, timeoutMs);
    if (bridged?.bridged && bridged.result) {
      const bridgeResult = bridged.result;
      const latencyMs = elapsedMs();
      if (!bridgeResult.unsupported) {
        if (bridgeResult.ok) {
          const httpStatus = Number(bridgeResult.status) || 0;
          if (httpStatus === 404) {
            return {
              status: 'unreachable',
              httpStatus: 404,
              latencyMs,
              message: `脚本代理检测：返回 404，请核对入口路径是否正确 (${latencyMs} ms)`,
              checkedAt: new Date().toISOString(),
            };
          }
          if (httpStatus > 0) {
            return {
              status: 'reachable',
              httpStatus,
              latencyMs,
              message: `脚本代理检测可达 · HTTP ${httpStatus} (${latencyMs} ms)`,
              checkedAt: new Date().toISOString(),
            };
          }
          return {
            status: 'blocked',
            latencyMs,
            message: '脚本已收到响应，但无法读取 HTTP 状态码；推荐改用 Waymark 浏览器插件进行无限制检测。',
            checkedAt: new Date().toISOString(),
          };
        }
        if (bridgeResult.error === 'timeout') {
          return {
            status: 'unreachable',
            latencyMs,
            message: '脚本代理检测超时 (6s)，请检查目标地址或网络连通性。',
            checkedAt: new Date().toISOString(),
          };
        }
        return {
          status: 'unreachable',
          latencyMs,
          message: `脚本代理检测失败：${bridgeResult.message || bridgeResult.error || '网络错误'}`,
          checkedAt: new Date().toISOString(),
        };
      }
      bridgeUnsupported = true;
    }

    if (isHttpsPage && parsed.protocol === 'http:' && !isLocalTarget) {
      const bridgeHint = bridgeStale
        ? `检测到旧版脚本 ${bridgeVersion}，请更新至 ${BRIDGE_VERSION} 或改用 Waymark 浏览器插件。`
        : bridgeUnsupported
          ? '当前脚本未获得跨域请求权限，建议改用 Waymark 浏览器插件或允许脚本访问目标域名。'
          : bridged
          ? bridgeNotResponding
          : '建议在右上角设置中下载安装「Waymark 浏览器插件」，即可直接探测 HTTP 与内网地址。';
      return {
        status: 'blocked',
        latencyMs: 0,
        message:
          `当前为 HTTPS 页面，浏览器禁止直接探测 HTTP 目标（混合内容限制）。${bridgeHint}`,
        checkedAt: new Date().toISOString(),
      };
    }

    timer = window.setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(targetUrl, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow',
      signal: controller.signal,
    });

    const latencyMs = elapsedMs();

    try {
      await resp.body?.cancel();
    } catch {
      // Ignore stream cancel errors
    }

    if (resp.type !== 'opaque' && resp.status > 0) {
      if (resp.status === 404) {
        return {
          status: 'unreachable',
          httpStatus: 404,
          latencyMs,
          message: `返回 404，请核对入口路径是否正确 (${latencyMs} ms)`,
          checkedAt: new Date().toISOString(),
        };
      }
      return {
        status: 'reachable',
        httpStatus: resp.status,
        latencyMs,
        message: `客户端直连可达 · HTTP ${resp.status} (${latencyMs} ms)`,
        checkedAt: new Date().toISOString(),
      };
    }

    return {
      status: 'reachable',
      latencyMs,
      message: `客户端直连可达（跨域响应不可读）(${latencyMs} ms)`,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    const latencyMs = elapsedMs();
    const isAborted =
      controller.signal.aborted || (err instanceof Error && err.name === 'AbortError');

    if (isAborted) {
      return {
        status: 'unreachable',
        latencyMs,
        message: '客户端连接超时 (6s)',
        checkedAt: new Date().toISOString(),
      };
    }

    if (isHttpsPage && parsed.protocol === 'http:' && !isLocalTarget) {
      const bridgeHint = bridgeStale
        ? `检测到旧版脚本 ${bridgeVersion}，请更新至 ${BRIDGE_VERSION} 或改用 Waymark 浏览器插件。`
        : bridgeUnsupported
          ? '当前脚本未获得跨域请求权限，建议改用 Waymark 浏览器插件。'
          : bridged
          ? bridgeNotResponding
          : '建议在右上角设置中安装「Waymark 浏览器插件」，即可直接探测 HTTP 目标。';
      return {
        status: 'blocked',
        latencyMs,
        message:
          `当前为 HTTPS 页面，受浏览器混合内容限制无法探测 HTTP 目标。${bridgeHint}`,
        checkedAt: new Date().toISOString(),
      };
    }

    if (
      typeof window !== 'undefined' &&
      !isPrivateHostname(window.location.hostname) &&
      isPrivateHostname(parsed.hostname)
    ) {
      return {
        status: 'blocked',
        latencyMs,
        message:
          '目标位于内网/保留地址，浏览器私有网络访问（PNA）策略阻止了直连。请安装 Waymark 浏览器插件后即可无限制检测。',
        checkedAt: new Date().toISOString(),
      };
    }

    if (parsed.protocol === 'https:') {
      return {
        status: 'unreachable',
        latencyMs,
        message:
          '客户端无法建立连接（可能是地址不可达、网络断开或自签名 HTTPS 证书尚未被浏览器信任）',
        checkedAt: new Date().toISOString(),
      };
    }

    return {
      status: 'unreachable',
      latencyMs,
      message: '客户端无法连接到目标地址，请检查网络、端口或浏览器拦截策略',
      checkedAt: new Date().toISOString(),
    };
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

interface BridgeProbeResult {
  ok?: boolean;
  status?: number;
  statusText?: string;
  finalUrl?: string;
  latencyMs?: number;
  authStatus?: 'auth_ok' | 'auth_failed';
  authMessage?: string;
  error?: string;
  message?: string;
  unsupported?: boolean;
  requestId?: string;
}

interface BridgeProbeResponse {
  bridged: boolean;
  reason?: 'timeout' | 'dispatch_error';
  result?: BridgeProbeResult;
}

function parseVersionParts(input: string | null): number[] {
  return String(input || '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
}

function isVersionAtLeast(current: string | null, minimum: string): boolean {
  if (!current) return false;
  const a = parseVersionParts(current);
  const b = parseVersionParts(minimum);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const left = a[i] || 0;
    const right = b[i] || 0;
    if (left > right) return true;
    if (left < right) return false;
  }
  return true;
}

function getExtensionVersion(): string | null {
  if (typeof document === 'undefined') return null;
  try {
    return document.documentElement.getAttribute('data-waymark-extension');
  } catch {
    return null;
  }
}

function getBridgeVersion(): string | null {
  if (typeof document === 'undefined') return null;
  try {
    return document.documentElement.getAttribute('data-paneldeck-bridge');
  } catch {
    return null;
  }
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return false;
  if (
    host === 'localhost' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host) || /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./.test(host)) return true;
  const private172 = host.match(/^172\.(\d{1,3})\./);
  if (private172) {
    const second = Number(private172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  if (/^(fc|fd|fe80):/i.test(host)) return true;
  return false;
}

function probeViaExtension(params: {
  url: string;
  timeoutMs: number;
  panelType?: PanelType;
  entrance?: string;
  username?: string;
  password?: string;
  version?: PanelVersion;
  verifyAuth?: boolean;
}): Promise<BridgeProbeResponse | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(null);
  }
  const version = getExtensionVersion();
  if (!version || !isVersionAtLeast(version, EXTENSION_VERSION)) {
    return Promise.resolve(null);
  }

  const requestId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `wm-ext-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise<BridgeProbeResponse>((resolve) => {
    let settled = false;
    let timer = 0;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      if (timer) window.clearTimeout(timer);
    };

    const finish = (response: BridgeProbeResponse) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(response);
    };

    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== window || !ev.data || typeof ev.data !== 'object') return;
      if (ev.data.source === 'waymark-extension' && ev.data.type === EXTENSION_PROBE_RESULT) {
        if (ev.data.requestId !== requestId) return;
        finish({ bridged: true, result: (ev.data.result || {}) as BridgeProbeResult });
      }
    };

    timer = window.setTimeout(
      () => finish({ bridged: false, reason: 'timeout' }),
      params.timeoutMs + 2500
    );
    window.addEventListener('message', onMessage);

    try {
      window.postMessage(
        {
          source: 'waymark-hub',
          type: EXTENSION_PROBE_REQUEST,
          requestId,
          url: params.url,
          timeoutMs: params.timeoutMs,
          panelType: params.panelType,
          entrance: params.entrance,
          username: params.username,
          password: params.password,
          version: params.version,
          verifyAuth: params.verifyAuth,
        },
        window.location.origin
      );
    } catch {
      finish({ bridged: false, reason: 'dispatch_error' });
    }
  });
}

function probeViaBridge(url: string, timeoutMs: number): Promise<BridgeProbeResponse | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(null);
  }
  const version = getBridgeVersion();
  if (!version || !isVersionAtLeast(version, BRIDGE_VERSION)) {
    return Promise.resolve(null);
  }

  const requestId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `wm-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise<BridgeProbeResponse>((resolve) => {
    let settled = false;
    let timer = 0;

    const cleanup = () => {
      window.removeEventListener(BRIDGE_PROBE_RESULT_EVENT, onResult as EventListener);
      window.removeEventListener('message', onMessage);
      if (timer) window.clearTimeout(timer);
    };

    const finish = (response: BridgeProbeResponse) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(response);
    };

    const onResult = (event: Event) => {
      try {
        const detail = (event as CustomEvent).detail;
        const parsedDetail = typeof detail === 'string' ? JSON.parse(detail) : detail;
        if (!parsedDetail || parsedDetail.requestId !== requestId) return;
        finish({ bridged: true, result: parsedDetail as BridgeProbeResult });
      } catch {
        // Ignore malformed bridge responses
      }
    };

    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== window || !ev.data || typeof ev.data !== 'object') return;
      if (ev.data.source === 'waymark-userscript' && ev.data.type === 'WAYMARK_USERSCRIPT_PROBE_RESULT') {
        if (ev.data.requestId !== requestId) return;
        finish({ bridged: true, result: ev.data as BridgeProbeResult });
      }
    };

    timer = window.setTimeout(
      () => finish({ bridged: false, reason: 'timeout' }),
      timeoutMs + 2000
    );
    window.addEventListener(BRIDGE_PROBE_RESULT_EVENT, onResult as EventListener);
    window.addEventListener('message', onMessage);

    try {
      window.postMessage(
        {
          source: 'waymark-hub',
          type: 'WAYMARK_USERSCRIPT_PROBE_REQUEST',
          requestId,
          url,
          timeoutMs,
        },
        window.location.origin
      );
      window.dispatchEvent(
        new CustomEvent(BRIDGE_PROBE_REQUEST_EVENT, {
          detail: JSON.stringify({ requestId, url, timeoutMs }),
        })
      );
    } catch {
      finish({ bridged: false, reason: 'dispatch_error' });
    }
  });
}

export async function fetchPublicWorkspaceByRoute(
  route: string,
  previewId?: string
): Promise<{ ok: boolean; workspace?: PublicWorkspaceViewData; message?: string }> {
  const params = new URLSearchParams({ route });
  if (previewId) {
    params.set('previewId', previewId);
  }
  const resp = await fetch(`/api/public/workspace?${params.toString()}`);
  return (await resp.json()) as {
    ok: boolean;
    workspace?: PublicWorkspaceViewData;
    message?: string;
  };
}

export async function syncPublicWorkspace(
  workspace: Workspace,
  nodes: PublicNodeItem[]
): Promise<{ ok: boolean; message?: string }> {
  const resp = await fetch(`/api/admin/public-workspaces/${encodeURIComponent(workspace.id)}`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...getAdminHeaders(),
    },
    body: JSON.stringify({
      name: workspace.name,
      description: workspace.description || '',
      publicRoute: workspace.publicRoute || '',
      publicDomain: workspace.publicDomain || '',
      publicProtocol: workspace.publicProtocol || 'https',
      nodes,
    }),
  });
  return (await resp.json()) as { ok: boolean; message?: string };
}

export async function removePublicWorkspace(workspaceId: string): Promise<void> {
  await fetch(`/api/admin/public-workspaces/${encodeURIComponent(workspaceId)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: getAdminHeaders(),
  }).catch(() => undefined);
}

export interface PersistedWorkspaceState {
  activeWorkspaceId?: string;
  viewMode?: ViewMode;
  workspaces: Workspace[];
  nodes: import('../types/panel').PanelNode[];
  updatedAt?: string;
}

export async function fetchAdminState(): Promise<{
  ok: boolean;
  hasSavedState: boolean;
  state?: PersistedWorkspaceState | null;
  unauthorized?: boolean;
}> {
  const resp = await fetch('/api/admin/state', {
    credentials: 'include',
    headers: getAdminHeaders(),
  });
  if (resp.status === 401) {
    return { ok: false, hasSavedState: false, unauthorized: true };
  }
  if (!resp.ok) {
    return { ok: false, hasSavedState: false };
  }
  return (await resp.json()) as {
    ok: boolean;
    hasSavedState: boolean;
    state?: PersistedWorkspaceState | null;
  };
}

export async function saveAdminState(payload: {
  activeWorkspaceId?: string;
  viewMode?: ViewMode;
  workspaces: Workspace[];
  nodes: import('../types/panel').PanelNode[];
}): Promise<{ ok: boolean; unauthorized?: boolean; message?: string }> {
  const resp = await fetch('/api/admin/state', {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...getAdminHeaders(),
    },
    body: JSON.stringify(payload),
  });
  if (resp.status === 401) {
    return { ok: false, unauthorized: true };
  }
  return (await resp.json()) as { ok: boolean; message?: string };
}
