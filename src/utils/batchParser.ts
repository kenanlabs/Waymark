import type { CustomFieldKey, PanelNode, PanelVersion, Workspace } from '../types/panel';
import { generateId } from './crypto';
import { normalizeBaseUrl, normalizeEntrance, splitFullPanelUrl } from './userscript';

export interface ParsedBatchCandidate {
  lineNumber: number;
  workspaceName?: string;
  name: string;
  baseUrl: string;
  entrance: string;
  username: string;
  password: string;
  group: string;
  customValues?: Partial<Record<CustomFieldKey, string>>;
  version: PanelVersion;
  valid: boolean;
  error?: string;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  if (delimiter !== ',') {
    return line.split(delimiter).map((s) => s.trim());
  }
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function buildCustomValues(
  f1?: unknown,
  f2?: unknown,
  f3?: unknown
): Partial<Record<CustomFieldKey, string>> | undefined {
  const v1 = String(f1 || '').trim();
  const v2 = String(f2 || '').trim();
  const v3 = String(f3 || '').trim();
  const out: Partial<Record<CustomFieldKey, string>> = {};
  if (v1) out.field1 = v1;
  if (v2) out.field2 = v2;
  if (v3) out.field3 = v3;
  return Object.keys(out).length > 0 ? out : undefined;
}

function looksLikeUrl(input: string): boolean {
  const trimmed = String(input || '').trim();
  if (!trimmed) return false;
  return Boolean(normalizeBaseUrl(trimmed));
}

export function parseBatchInput(raw: string): ParsedBatchCandidate[] {
  const trimmed = raw.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.nodes) ? parsed.nodes : [];
      return list.map((item: Record<string, unknown>, idx: number) => {
        const rawUrl = String(item.baseUrl || item.url || '');
        const split = splitFullPanelUrl(rawUrl);
        const explicitEntrance = normalizeEntrance(String(item.entrance || ''));
        const baseUrl = normalizeBaseUrl(split.baseUrl || rawUrl);
        const entrance = explicitEntrance || split.entrance;
        const name = String(item.name || baseUrl.replace(/^https?:\/\//i, '')).trim();
        const username = String(item.username || item.user || '').trim();
        const password = String(item.password || item.pass || '');
        const workspaceName = String(item.workspace || item.workspaceName || '').trim() || undefined;
        const rawCustom =
          item.customValues && typeof item.customValues === 'object'
            ? (item.customValues as Record<string, unknown>)
            : {};
        const customValues = buildCustomValues(
          rawCustom.field1 ?? item.field1,
          rawCustom.field2 ?? item.field2,
          rawCustom.field3 ?? item.field3
        );
        const valid = Boolean(baseUrl);
        return {
          lineNumber: idx + 1,
          workspaceName,
          name: name || `Site-${idx + 1}`,
          baseUrl,
          entrance,
          username,
          password,
          group: String(item.group || '默认分组').trim() || '默认分组',
          customValues,
          version: item.version === 'v1' ? 'v1' : 'v2',
          valid,
          error: valid ? undefined : '缺少有效的访问地址',
        };
      });
    } catch {
      // Fallback to line-by-line parsing
    }
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('//'));

  const out: ParsedBatchCandidate[] = [];
  let isExportedWorkspaceFormat = false;

  lines.forEach((line, index) => {
    const delimiter = line.includes('\t')
      ? '\t'
      : line.includes('|')
      ? '|'
      : ',';
    const cols = splitCsvLine(line, delimiter);

    if (index === 0) {
      const c0 = (cols[0] || '').toLowerCase();
      const c1 = (cols[1] || '').toLowerCase();
      const c2 = (cols[2] || '').toLowerCase();
      if (
        (c0 === 'workspace' || c0 === '工作空间') &&
        (c1 === 'name' || c1 === '名称' || c1 === '站点') &&
        (c2 === 'baseurl' || c2 === 'url' || c2 === '地址')
      ) {
        isExportedWorkspaceFormat = true;
        return;
      }
      if (
        /^(workspace|name|节点|站点|名称)$/i.test(c0) &&
        /^(name|url|baseurl|地址|ip)$/i.test(c1)
      ) {
        return;
      }
    }

    let workspaceName: string | undefined;
    let nameRaw = '';
    let urlRaw = '';
    let username = '';
    let password = '';
    let explicitEntrance = '';
    let group = '默认分组';
    let customValues: Partial<Record<CustomFieldKey, string>> | undefined;

    // Detect single-column URL list: e.g. "https://panel.example.com:8080/entry"
    if (cols.length === 1 && looksLikeUrl(cols[0])) {
      urlRaw = cols[0];
    } else if (
      isExportedWorkspaceFormat ||
      (cols.length >= 3 && !looksLikeUrl(cols[1]) && looksLikeUrl(cols[2]))
    ) {
      // Exported 10-column CSV format:
      // workspace, name, baseUrl, entrance, username, password, group, field1, field2, field3
      workspaceName = (cols[0] || '').trim() || undefined;
      nameRaw = cols[1] || '';
      urlRaw = cols[2] || '';
      explicitEntrance = normalizeEntrance(cols[3] || '');
      username = (cols[4] || '').trim();
      password = cols[5] || '';
      group = (cols[6] || '默认分组').trim() || '默认分组';
      customValues = buildCustomValues(cols[7], cols[8], cols[9]);
    } else {
      // Standard 9-column format:
      // name, url, username, password, entrance, group, field1, field2, field3
      nameRaw = cols[0] || '';
      urlRaw = cols[1] || '';
      username = (cols[2] || '').trim();
      password = cols[3] || '';
      explicitEntrance = normalizeEntrance(cols[4] || '');
      group = (cols[5] || '默认分组').trim() || '默认分组';
      customValues = buildCustomValues(cols[6], cols[7], cols[8]);
    }

    const version: PanelVersion = 'v2';
    const split = splitFullPanelUrl(urlRaw);
    const baseUrl = normalizeBaseUrl(split.baseUrl || urlRaw);
    const entrance = explicitEntrance || split.entrance;
    const name = nameRaw || baseUrl.replace(/^https?:\/\//i, '');

    let error: string | undefined;
    if (!urlRaw) error = '缺少访问地址';
    else if (!baseUrl || !/^https?:\/\/.+/.test(baseUrl)) error = '地址格式无效';

    out.push({
      lineNumber: index + 1,
      workspaceName,
      name,
      baseUrl,
      entrance,
      username,
      password,
      group,
      customValues,
      version,
      valid: !error,
      error,
    });
  });

  return out;
}

export function candidatesToPanelNodes(
  candidates: ParsedBatchCandidate[],
  activeWorkspaceId?: string,
  workspaces?: Workspace[]
): PanelNode[] {
  const now = new Date().toISOString();
  const wsByName = new Map<string, string>();
  if (workspaces) {
    for (const ws of workspaces) {
      wsByName.set(ws.name.trim().toLowerCase(), ws.id);
    }
  }

  return candidates
    .filter((c) => c.valid)
    .map((c) => {
      const matchedWsId =
        c.workspaceName && wsByName.has(c.workspaceName.toLowerCase())
          ? wsByName.get(c.workspaceName.toLowerCase())
          : activeWorkspaceId;
      return {
        id: generateId(),
        workspaceId: matchedWsId,
        name: c.name,
        baseUrl: c.baseUrl,
        entrance: c.entrance,
        username: c.username,
        password: c.password,
        group: c.group || '默认分组',
        customValues: c.customValues,
        version: c.version,
        autoSubmit: Boolean(c.username || c.password),
        createdAt: now,
        updatedAt: now,
      };
    });
}
