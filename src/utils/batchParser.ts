import type { CustomFieldKey, PanelNode, PanelVersion } from '../types/panel';
import { generateId } from './crypto';
import { normalizeBaseUrl, normalizeEntrance, splitFullPanelUrl } from './userscript';

export interface ParsedBatchCandidate {
  lineNumber: number;
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

export function parseBatchInput(raw: string): ParsedBatchCandidate[] {
  const trimmed = raw.trim();
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
          name: name || `Site-${idx + 1}`,
          baseUrl,
          entrance,
          username,
          password,
          group: String(item.group || '默认分组').trim(),
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

  lines.forEach((line, index) => {
    const delimiter = line.includes('\t')
      ? '\t'
      : line.includes('|')
      ? '|'
      : ',';
    const cols = splitCsvLine(line, delimiter);

    if (
      index === 0 &&
      /^(workspace|name|节点|站点|名称)/i.test(cols[0] || '') &&
      /(name|url|地址|ip)/i.test(cols[1] || '')
    ) {
      return;
    }

    const nameRaw = cols[0] || '';
    const urlRaw = cols[1] || '';
    const username = (cols[2] || '').trim();
    const password = cols[3] || '';
    const explicitEntrance = normalizeEntrance(cols[4] || '');
    const group = (cols[5] || '默认分组').trim();
    const customValues = buildCustomValues(cols[6], cols[7], cols[8]);
    const version: PanelVersion = 'v2';

    const split = splitFullPanelUrl(urlRaw);
    const baseUrl = normalizeBaseUrl(split.baseUrl || urlRaw);
    const entrance = explicitEntrance || split.entrance;
    const name = nameRaw || baseUrl.replace(/^https?:\/\//i, '');

    let error: string | undefined;
    if (!urlRaw) error = '缺少访问地址';
    else if (!/^https?:\/\/.+/.test(baseUrl)) error = '地址格式无效';

    out.push({
      lineNumber: index + 1,
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
  workspaceId?: string
): PanelNode[] {
  const now = new Date().toISOString();
  return candidates
    .filter((c) => c.valid)
    .map((c) => ({
      id: generateId(),
      workspaceId,
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
    }));
}
