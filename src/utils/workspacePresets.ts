import type {
  BgPattern,
  BgTone,
  CustomFieldKey,
  CustomFieldPlacement,
  PanelNode,
  PublicNodeItem,
  Workspace,
  WorkspaceCustomFieldDef,
} from '../types/panel';

export const DEFAULT_WORKSPACE_ID = 'ws-default';
export const DEFAULT_WORKSPACE_GROUPS = ['默认分组'];

export interface BgTonePreset {
  id: BgTone;
  name: string;
  subtitle: string;
  lightCanvas: string;
  lightSurface: string;
  lightMuted: string;
  lightBorder: string;
  darkCanvas: string;
  darkSurface: string;
  darkMuted: string;
  darkBorder: string;
}

export const BG_TONE_PRESETS: BgTonePreset[] = [
  {
    id: 'paper',
    name: '柔光暖纸',
    subtitle: '微暖米白纸感底色',
    lightCanvas: '#F4F1EA',
    lightSurface: '#FAF8F3',
    lightMuted: '#EAE5DB',
    lightBorder: '#DFD9CD',
    darkCanvas: '#11100E',
    darkSurface: '#181614',
    darkMuted: '#211E1B',
    darkBorder: '#2C2824',
  },
  {
    id: 'sage',
    name: '清润豆沙绿',
    subtitle: '低饱和柔和青绿底色',
    lightCanvas: '#EBF1ED',
    lightSurface: '#F5F9F6',
    lightMuted: '#DFE9E2',
    lightBorder: '#CFDCD3',
    darkCanvas: '#0B100D',
    darkSurface: '#111814',
    darkMuted: '#18221C',
    darkBorder: '#233028',
  },
  {
    id: 'stone',
    name: '温润云灰',
    subtitle: '中性微冷低对比灰阶',
    lightCanvas: '#ECEEF0',
    lightSurface: '#F7F8F9',
    lightMuted: '#E1E5E9',
    lightBorder: '#D3D8DE',
    darkCanvas: '#0B0D10',
    darkSurface: '#12151A',
    darkMuted: '#1A1E25',
    darkBorder: '#262B34',
  },
  {
    id: 'oat',
    name: '燕麦亚麻',
    subtitle: '自然亚麻暖米色调',
    lightCanvas: '#F1ECE4',
    lightSurface: '#F9F6F1',
    lightMuted: '#E6DFD4',
    lightBorder: '#D9D0C3',
    darkCanvas: '#12100E',
    darkSurface: '#1A1714',
    darkMuted: '#24201C',
    darkBorder: '#302A25',
  },
  {
    id: 'mist',
    name: '雾霭冰蓝',
    subtitle: '清爽北欧冷雾色调',
    lightCanvas: '#EAF0F6',
    lightSurface: '#F5F8FC',
    lightMuted: '#DEE7F0',
    lightBorder: '#CDD9E5',
    darkCanvas: '#090D14',
    darkSurface: '#101620',
    darkMuted: '#17202D',
    darkBorder: '#232F40',
  },
  {
    id: 'pure',
    name: '纯净默认',
    subtitle: '经典纯白与深炭黑',
    lightCanvas: '#FAFAFA',
    lightSurface: '#FFFFFF',
    lightMuted: '#F4F4F5',
    lightBorder: '#E4E4E7',
    darkCanvas: '#09090B',
    darkSurface: '#111113',
    darkMuted: '#18181B',
    darkBorder: '#27272A',
  },
];

export function normalizeBgTone(raw?: unknown): BgTone {
  if (
    raw === 'pure' ||
    raw === 'paper' ||
    raw === 'sage' ||
    raw === 'stone' ||
    raw === 'oat' ||
    raw === 'mist'
  ) {
    return raw;
  }
  return 'paper';
}

export interface BgPatternPreset {
  id: BgPattern;
  name: string;
  subtitle: string;
}

export const BG_PATTERN_PRESETS: BgPatternPreset[] = [
  {
    id: 'dots',
    name: '圆点矩阵',
    subtitle: '轻量坐标波点点缀',
  },
  {
    id: 'grid',
    name: '极细方格',
    subtitle: '精细经纬网格底纹',
  },
  {
    id: 'paper',
    name: '纸质肌理',
    subtitle: '微噪颗粒纸张质感',
  },
  {
    id: 'lines',
    name: '斜向细线',
    subtitle: '45° 极细斜纹几何',
  },
  {
    id: 'rings',
    name: '圆弧几何',
    subtitle: '顶部同心圆弧点缀',
  },
  {
    id: 'none',
    name: '纯色无纹',
    subtitle: '不叠加任何背景纹理',
  },
];

export function normalizeBgPattern(raw?: unknown): BgPattern {
  if (
    raw === 'none' ||
    raw === 'dots' ||
    raw === 'grid' ||
    raw === 'paper' ||
    raw === 'lines' ||
    raw === 'rings'
  ) {
    return raw;
  }
  return 'dots';
}

export const FIXED_CUSTOM_FIELD_KEYS: CustomFieldKey[] = ['field1', 'field2', 'field3'];

export const DEFAULT_CUSTOM_FIELD_PLACEMENTS: Record<CustomFieldKey, CustomFieldPlacement> = {
  field1: 'card_top',
  field2: 'card_bottom',
  field3: 'detail_only',
};

export const CUSTOM_FIELD_PLACEMENT_OPTIONS: Array<{
  value: CustomFieldPlacement;
  label: string;
  shortLabel: string;
}> = [
  { value: 'card_top', label: '卡片顶部（分组旁）+ 详细视图', shortLabel: '卡片顶部' },
  { value: 'card_bottom', label: '卡片底部（域名旁）+ 详细视图', shortLabel: '卡片底部' },
  { value: 'detail_only', label: '仅详细视图显示', shortLabel: '仅详细' },
  { value: 'drawer_only', label: '仅在编辑抽屉内显示', shortLabel: '仅抽屉' },
];

export function normalizeWorkspaceCustomFields(
  fields?: WorkspaceCustomFieldDef[]
): WorkspaceCustomFieldDef[] {
  const byKey = new Map<CustomFieldKey, WorkspaceCustomFieldDef>();
  if (Array.isArray(fields)) {
    for (const item of fields) {
      if (
        item &&
        (item.key === 'field1' || item.key === 'field2' || item.key === 'field3')
      ) {
        const validPlacement: CustomFieldPlacement =
          item.placement === 'card_top' ||
          item.placement === 'card_bottom' ||
          item.placement === 'detail_only' ||
          item.placement === 'drawer_only'
            ? item.placement
            : DEFAULT_CUSTOM_FIELD_PLACEMENTS[item.key];
        byKey.set(item.key, {
          key: item.key,
          label: String(item.label || '').trim(),
          placement: validPlacement,
        });
      }
    }
  }
  return FIXED_CUSTOM_FIELD_KEYS.map((key) => {
    const existing = byKey.get(key);
    return (
      existing ?? {
        key,
        label: '',
        placement: DEFAULT_CUSTOM_FIELD_PLACEMENTS[key],
      }
    );
  });
}

export function getActiveWorkspaceCustomFields(
  fields?: WorkspaceCustomFieldDef[]
): WorkspaceCustomFieldDef[] {
  return normalizeWorkspaceCustomFields(fields).filter((f) => Boolean(f.label));
}

export function resolveNodeCustomEntries(
  node: Pick<PanelNode | PublicNodeItem, 'customValues'>,
  fields?: WorkspaceCustomFieldDef[]
): Array<{
  key: CustomFieldKey;
  label: string;
  value: string;
  placement: CustomFieldPlacement;
}> {
  const activeDefs = getActiveWorkspaceCustomFields(fields);
  const values = node.customValues;
  if (!values || activeDefs.length === 0) return [];
  const result: Array<{
    key: CustomFieldKey;
    label: string;
    value: string;
    placement: CustomFieldPlacement;
  }> = [];
  for (const def of activeDefs) {
    const val = String(values[def.key] || '').trim();
    if (val) {
      result.push({
        key: def.key,
        label: def.label,
        value: val,
        placement: def.placement,
      });
    }
  }
  return result;
}

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
  '/favicon.svg',
];

export function createDefaultWorkspace(customGroups?: string[]): Workspace {
  const now = new Date().toISOString();
  return {
    id: DEFAULT_WORKSPACE_ID,
    name: '默认空间',
    description: '',
    groups: customGroups && customGroups.length > 0 ? customGroups : [...DEFAULT_WORKSPACE_GROUPS],
    customFields: normalizeWorkspaceCustomFields(),
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

export function parsePublicDomainInput(raw: string): {
  protocol: 'http' | 'https';
  domain: string;
} {
  const trimmed = raw.trim();
  const protocol: 'http' | 'https' = /^http:\/\//i.test(trimmed) ? 'http' : 'https';
  return {
    protocol,
    domain: normalizePublicDomain(trimmed),
  };
}

export function buildWorkspacePublicUrl(
  workspace: Pick<Workspace, 'publicDomain' | 'publicProtocol' | 'publicRoute'>,
  origin = ''
): string {
  const domain = normalizePublicDomain(workspace.publicDomain || '');
  const route = normalizePublicRoute(workspace.publicRoute || '');
  if (domain) {
    const protocol = workspace.publicProtocol === 'http' ? 'http' : 'https';
    return `${protocol}://${domain}${route || '/'}`;
  }
  if (route) {
    return `${origin}${route}`;
  }
  return '';
}

export function validatePublicDomain(domain: string): string | null {
  if (!domain) return null;
  if (
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*(?::\d{1,5})?$/.test(
      domain
    )
  ) {
    return '域名格式无效，请填写如 nav.example.com 的域名。';
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
      : '请填写公开访问的自定义路由（例如 /team）或配置公开访问域名。';
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
