import type { Workspace } from '../types/panel';

export const DEFAULT_WORKSPACE_ID = 'ws-default';
export const DEFAULT_WORKSPACE_GROUPS = ['生产环境', '测试环境', '常用工具'];

const RESERVED_ROUTE_PREFIXES = [
  '/api',
  '/assets',
  '/src',
  '/node_modules',
  '/@vite',
  '/@react-refresh',
  '/opsdeck-bridge.user.js',
  '/1panel-bridge.user.js',
  '/waymark-bridge.user.js',
  '/favicon.ico',
];

export function createDefaultWorkspace(customGroups?: string[]): Workspace {
  const now = new Date().toISOString();
  return {
    id: DEFAULT_WORKSPACE_ID,
    name: '默认空间',
    description: '',
    groups: customGroups && customGroups.length > 0 ? customGroups : [...DEFAULT_WORKSPACE_GROUPS],
    isPublic: false,
    publicRoute: '',
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizePublicDomain(raw: string): string {
  let cleaned = raw.trim();
  if (!cleaned) return '';

  if (/^https?:\/\//i.test(cleaned)) {
    try {
      cleaned = new URL(cleaned).host;
    } catch {
      cleaned = cleaned.replace(/^https?:\/\//i, '');
    }
  }

  cleaned = cleaned.split('/')[0].split('?')[0].split('#')[0].trim().toLowerCase();
  return cleaned;
}

export function validatePublicDomain(domain: string): string | null {
  if (!domain) return null;
  if (
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*(?::\d{1,5})?$/.test(
      domain
    )
  ) {
    return '域名格式无效，请填写如 grafana.example.com 的域名。';
  }
  return null;
}

export function normalizePublicRoute(raw: string): string {
  let cleaned = raw.trim();
  if (!cleaned) return '';

  // Strip full URL origin if user pasted a full URL
  if (/^https?:\/\//i.test(cleaned)) {
    try {
      cleaned = new URL(cleaned).pathname;
    } catch {
      // ignore
    }
  }

  // Collapse slashes, ensure leading slash, remove trailing slash
  cleaned = '/' + cleaned.replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
  if (cleaned === '/') return '';
  return cleaned;
}

export function validatePublicRoute(route: string, hasPublicDomain = false): string | null {
  if (!route) {
    return hasPublicDomain
      ? null
      : '请填写公开访问的自定义路由（例如 /grafana）或配置公开访问域名。';
  }
  if (!/^\/[a-zA-Z0-9/_-]+$/.test(route)) {
    return '路由仅支持英文字母、数字、短横线（-）、下划线（_）与斜杠（/）。';
  }
  const lower = route.toLowerCase();
  for (const prefix of RESERVED_ROUTE_PREFIXES) {
    if (lower === prefix || lower.startsWith(`${prefix}/`)) {
      return `路由不能使用系统保留路径「${prefix}」。`;
    }
  }
  return null;
}
