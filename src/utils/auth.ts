import type {
  PanelProbeResult,
  PanelType,
  PanelVersion,
  PublicNodeItem,
  PublicWorkspaceViewData,
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
  username: string;
  password: string;
  version: PanelVersion;
  panelType?: PanelType;
  verifyAuth: boolean;
}): Promise<PanelProbeResult & { unauthorized?: boolean }> {
  const resp = await fetch('/api/probe', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...getAdminHeaders(),
    },
    body: JSON.stringify(params),
  });
  const data = (await resp.json()) as PanelProbeResult;
  if (resp.status === 401) {
    return { ...data, unauthorized: true };
  }
  return data;
}

export async function fetchPublicWorkspaceByRoute(
  route: string
): Promise<{ ok: boolean; workspace?: PublicWorkspaceViewData; message?: string }> {
  const resp = await fetch(`/api/public/workspace?route=${encodeURIComponent(route)}`);
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
