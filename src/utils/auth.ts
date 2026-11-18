import type {
  PanelProbeResult,
  PanelType,
  PanelVersion,
  PublicNodeItem,
  PublicWorkspaceViewData,
  ViewMode,
  Workspace,
} from '../types/panel';

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
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(targetUrl, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow',
      signal: controller.signal,
    });

    const elapsed =
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
    const latencyMs = Math.max(1, Math.round(elapsed));

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
      message: `客户端直连可达 (${latencyMs} ms)`,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    const elapsed =
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
    const latencyMs = Math.max(1, Math.round(elapsed));
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

    const isHttpsPage =
      typeof window !== 'undefined' && window.location.protocol === 'https:';
    const isLocalHost =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '[::1]';

    if (isHttpsPage && parsed.protocol === 'http:' && !isLocalHost) {
      return {
        status: 'unreachable',
        latencyMs,
        message:
          '当前为 HTTPS 页面，受浏览器混合内容限制无法探测 HTTP 目标，请点击卡片直接打开验证',
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
    window.clearTimeout(timer);
  }
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
