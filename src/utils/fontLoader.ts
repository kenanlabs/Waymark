import type { FontFamily } from '../types/panel';

export interface FontPreset {
  id: FontFamily;
  name: string;
  subtitle: string;
  badgeText: string;
  cssFamilyName?: string;
  urls?: string[];
  expectedBytes?: number;
}

const FONT_CACHE_NAME = 'waymark-fonts-v1';
const loadedFontFamilies = new Set<FontFamily>(['default']);
const inFlightDownloads = new Map<
  FontFamily,
  {
    promise: Promise<boolean>;
    listeners: Set<(percent: number) => void>;
    lastPercent: number;
  }
>();

export const FONT_PRESETS: FontPreset[] = [
  {
    id: 'default',
    name: '系统默认',
    subtitle: '现代无衬线 · 零加载开销',
    badgeText: 'Aa',
  },
  {
    id: 'lxgw-wenkai',
    name: '霞鹜文楷',
    subtitle: '温润书卷手写楷体',
    badgeText: '文楷',
    cssFamilyName: 'Waymark LXGW WenKai',
    expectedBytes: 24744500,
    urls: [
      'https://cdn.jsdelivr.net/npm/@fontpkg/lxgw-wen-kai@1.520.0/LXGWWenKai-Regular.ttf',
      'https://fastly.jsdelivr.net/npm/@fontpkg/lxgw-wen-kai@1.520.0/LXGWWenKai-Regular.ttf',
      'https://gcore.jsdelivr.net/npm/@fontpkg/lxgw-wen-kai@1.520.0/LXGWWenKai-Regular.ttf',
    ],
  },
  {
    id: 'tsanger-jinkai',
    name: '仓耳今楷',
    subtitle: '清朗秀丽现代楷书',
    badgeText: '今楷',
    cssFamilyName: 'Waymark TsangerJinKai',
    expectedBytes: 18948192,
    urls: [
      'https://cdn.jsdelivr.net/gh/Elyodians/myfonts@main/tsangerjinkai02-w04.ttf',
      'https://fastly.jsdelivr.net/gh/Elyodians/myfonts@main/tsangerjinkai02-w04.ttf',
      'https://gcore.jsdelivr.net/gh/Elyodians/myfonts@main/tsangerjinkai02-w04.ttf',
    ],
  },
];

export function normalizeFontFamily(raw?: unknown): FontFamily {
  if (raw === 'default' || raw === 'lxgw-wenkai' || raw === 'tsanger-jinkai') {
    return raw;
  }
  return 'default';
}

function getCacheKeyUrl(fontId: FontFamily): string {
  return `https://waymark.local/__font_cache__/${fontId}.ttf`;
}

export function applyFontAttribute(fontId: FontFamily): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-font', fontId);
}

export async function isFontCached(fontId: FontFamily): Promise<boolean> {
  if (fontId === 'default' || loadedFontFamilies.has(fontId)) {
    return true;
  }
  if (typeof window === 'undefined' || !('caches' in window)) {
    return false;
  }
  try {
    const cache = await caches.open(FONT_CACHE_NAME);
    const match = await cache.match(getCacheKeyUrl(fontId));
    return Boolean(match);
  } catch {
    return false;
  }
}

async function registerFontBuffer(familyName: string, buffer: ArrayBuffer): Promise<void> {
  if (typeof window === 'undefined' || typeof FontFace === 'undefined') return;
  const face = new FontFace(familyName, buffer, {
    style: 'normal',
    weight: '400',
    display: 'swap',
  });
  const loadedFace = await face.load();
  document.fonts.add(loadedFace);
}

async function fetchFontStreamWithProgress(
  urls: string[],
  expectedBytes: number,
  onProgress: (percent: number) => void
): Promise<ArrayBuffer> {
  let lastError: Error | null = null;

  for (const url of urls) {
    try {
      const resp = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      if (!resp.body) {
        const buf = await resp.arrayBuffer();
        onProgress(100);
        return buf;
      }

      const contentLengthHeader = Number(resp.headers.get('content-length') || 0);
      const totalEstimate =
        expectedBytes > 0
          ? expectedBytes
          : contentLengthHeader > 0
          ? contentLengthHeader
          : 20 * 1024 * 1024;

      const reader = resp.body.getReader();
      const chunks: Uint8Array[] = [];
      let receivedLength = 0;
      let lastReported = 1;
      onProgress(1);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          receivedLength += value.byteLength;
          const ratio = receivedLength / totalEstimate;
          const pct = Math.max(2, Math.min(98, Math.round(ratio * 100)));
          if (pct !== lastReported) {
            lastReported = pct;
            onProgress(pct);
          }
        }
      }

      const combined = new Uint8Array(receivedLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
      }
      onProgress(99);
      return combined.buffer;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError || new Error('字体下载失败');
}

export async function loadAndApplyFont(
  fontId: FontFamily,
  onProgress?: (percent: number) => void
): Promise<boolean> {
  if (fontId === 'default') {
    onProgress?.(100);
    applyFontAttribute('default');
    return true;
  }

  const preset = FONT_PRESETS.find((p) => p.id === fontId);
  if (!preset || !preset.cssFamilyName || !preset.urls?.length) {
    applyFontAttribute('default');
    return false;
  }

  // Already registered in document.fonts in current session
  if (loadedFontFamilies.has(fontId)) {
    onProgress?.(100);
    applyFontAttribute(fontId);
    return true;
  }

  // Check if an in-flight download is already running for this font
  const existingTask = inFlightDownloads.get(fontId);
  if (existingTask) {
    if (onProgress) {
      existingTask.listeners.add(onProgress);
      onProgress(existingTask.lastPercent);
    }
    const ok = await existingTask.promise;
    if (onProgress) {
      existingTask.listeners.delete(onProgress);
    }
    if (ok) applyFontAttribute(fontId);
    return ok;
  }

  const listeners = new Set<(percent: number) => void>();
  if (onProgress) listeners.add(onProgress);

  const notifyProgress = (pct: number) => {
    const task = inFlightDownloads.get(fontId);
    if (task) task.lastPercent = pct;
    for (const fn of listeners) {
      fn(pct);
    }
  };

  const taskPromise = (async (): Promise<boolean> => {
    try {
      // 1. Check persistent Cache Storage first
      if (typeof window !== 'undefined' && 'caches' in window) {
        try {
          const cache = await caches.open(FONT_CACHE_NAME);
          const cachedResp = await cache.match(getCacheKeyUrl(fontId));
          if (cachedResp) {
            notifyProgress(100);
            const buffer = await cachedResp.arrayBuffer();
            await registerFontBuffer(preset.cssFamilyName!, buffer);
            loadedFontFamilies.add(fontId);
            applyFontAttribute(fontId);
            return true;
          }
        } catch {
          // Proceed to network stream if Cache Storage access fails
        }
      }

      // 2. Stream from CDN with real-time byte progress
      const buffer = await fetchFontStreamWithProgress(
        preset.urls!,
        preset.expectedBytes || 20 * 1024 * 1024,
        notifyProgress
      );

      // 3. Persist binary in Cache Storage for offline/zero-latency future loads
      if (typeof window !== 'undefined' && 'caches' in window) {
        try {
          const cache = await caches.open(FONT_CACHE_NAME);
          await cache.put(
            getCacheKeyUrl(fontId),
            new Response(buffer.slice(0), {
              headers: {
                'Content-Type': 'font/ttf',
                'Content-Length': String(buffer.byteLength),
              },
            })
          );
        } catch {
          // Ignore quota or private-browsing cache write errors
        }
      }

      // 4. Register in document.fonts and activate
      await registerFontBuffer(preset.cssFamilyName!, buffer);
      loadedFontFamilies.add(fontId);
      notifyProgress(100);
      applyFontAttribute(fontId);
      return true;
    } catch {
      return false;
    } finally {
      inFlightDownloads.delete(fontId);
    }
  })();

  inFlightDownloads.set(fontId, {
    promise: taskPromise,
    listeners,
    lastPercent: 0,
  });

  return taskPromise;
}
