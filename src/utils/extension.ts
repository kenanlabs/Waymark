import {
  EXTENSION_LAUNCH_PAYLOAD,
  EXTENSION_PROBE_REQUEST,
  EXTENSION_PROBE_RESULT,
  EXTENSION_READY_EVENT,
  EXTENSION_VERSION,
} from './extensionMeta.ts';
import { buildAutoFillCoreSource } from './userscript.ts';

export interface ExtensionArchiveEntry {
  name: string;
  data: Uint8Array;
}

const textEncoder = new TextEncoder();

function encodeUtf8(str: string): Uint8Array {
  return textEncoder.encode(str);
}

function concatBytes(arrays: Uint8Array[]): Uint8Array {
  let totalLength = 0;
  for (const arr of arrays) totalLength += arr.length;
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    out.set(arr, offset);
    offset += arr.length;
  }
  return out;
}

function writeUInt16LE(buf: Uint8Array, value: number, offset: number): void {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >>> 8) & 0xff;
}

function writeUInt32LE(buf: Uint8Array, value: number, offset: number): void {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >>> 8) & 0xff;
  buf[offset + 2] = (value >>> 16) & 0xff;
  buf[offset + 3] = (value >>> 24) & 0xff;
}

function writeUInt32BE(buf: Uint8Array, value: number, offset: number): void {
  buf[offset] = (value >>> 24) & 0xff;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(buf: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function zlibStoreUncompressed(raw: Uint8Array): Uint8Array {
  const maxBlock = 65535;
  const numBlocks = Math.max(1, Math.ceil(raw.length / maxBlock));
  const out = new Uint8Array(2 + numBlocks * 5 + raw.length + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let inOffset = 0;
  let outOffset = 2;
  for (let b = 0; b < numBlocks; b++) {
    const isFinal = b === numBlocks - 1;
    const len = Math.min(maxBlock, raw.length - inOffset);
    const nlen = ~len & 0xffff;
    out[outOffset] = isFinal ? 0x01 : 0x00;
    writeUInt16LE(out, len, outOffset + 1);
    writeUInt16LE(out, nlen, outOffset + 3);
    outOffset += 5;
    out.set(raw.subarray(inOffset, inOffset + len), outOffset);
    outOffset += len;
    inOffset += len;
  }
  writeUInt32BE(out, adler32(raw), outOffset);
  return out;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBuf = encodeUtf8(type);
  const lenBuf = new Uint8Array(4);
  writeUInt32BE(lenBuf, data.length, 0);
  const crcInput = concatBytes([typeBuf, data]);
  const crcBuf = new Uint8Array(4);
  writeUInt32BE(crcBuf, crc32(crcInput), 0);
  return concatBytes([lenBuf, typeBuf, data, crcBuf]);
}

function generateExtensionIconPng(size: number): Uint8Array {
  const raw = new Uint8Array(size * (1 + size * 4));
  const radius = size * 0.22;
  const center = (size - 1) / 2;

  const distToSegment = (
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  };

  const s = size;
  const stroke = Math.max(1.3, s * 0.1);

  for (let y = 0; y < size; y++) {
    const rowOffset = y * (1 + size * 4);
    raw[rowOffset] = 0;
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;

      const qx = Math.abs(px - (center + 0.5)) - (size / 2 - radius);
      const qy = Math.abs(py - (center + 0.5)) - (size / 2 - radius);
      const outsideDist =
        Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;

      const bgAlpha = Math.max(0, Math.min(1, 0.5 - outsideDist));

      const d1 = distToSegment(px, py, s * 0.3, s * 0.7, s * 0.7, s * 0.3);
      const d2 = distToSegment(px, py, s * 0.42, s * 0.3, s * 0.7, s * 0.3);
      const d3 = distToSegment(px, py, s * 0.7, s * 0.3, s * 0.7, s * 0.58);
      const glyphDist = Math.min(d1, d2, d3) - stroke * 0.5;
      const glyphAlpha = Math.max(0, Math.min(1, 0.5 - glyphDist));

      const r = Math.round(9 + (250 - 9) * glyphAlpha);
      const g = Math.round(9 + (250 - 9) * glyphAlpha);
      const b = Math.round(11 + (250 - 11) * glyphAlpha);
      const a = Math.round(255 * bgAlpha);

      const p = rowOffset + 1 + x * 4;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
      raw[p + 3] = a;
    }
  }

  const ihdr = new Uint8Array(13);
  writeUInt32BE(ihdr, size, 0);
  writeUInt32BE(ihdr, size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const idat = zlibStoreUncompressed(raw);

  return concatBytes([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', new Uint8Array(0)),
  ]);
}

function buildManifestJson(): string {
  return JSON.stringify(
    {
      manifest_version: 3,
      name: 'Waymark 自动登录与连通性探测助手',
      version: EXTENSION_VERSION,
      description:
        '为 Waymark 提供无限制站点连通性检测（绕过 CORS / 混合内容 / PNA）以及更可靠的后台页面表单自动填充登录。',
      icons: {
        16: 'icons/icon16.png',
        48: 'icons/icon48.png',
        128: 'icons/icon128.png',
      },
      permissions: ['storage', 'scripting', 'tabs'],
      host_permissions: ['<all_urls>'],
      background: {
        service_worker: 'background.js',
      },
      content_scripts: [
        {
          matches: ['<all_urls>'],
          js: ['hub-bridge.js'],
          run_at: 'document_start',
          all_frames: false,
        },
      ],
      action: {
        default_popup: 'popup.html',
        default_title: 'Waymark 助手',
        default_icon: {
          16: 'icons/icon16.png',
          48: 'icons/icon48.png',
        },
      },
    },
    null,
    2
  );
}

function buildBackgroundJs(): string {
  return `const STORAGE_KEY = 'waymark_pending_launches';
const MAX_AGE_MS = 60000;
const MAX_ENTRIES = 12;

function getSessionStore() {
  return chrome.storage && chrome.storage.session ? chrome.storage.session : chrome.storage.local;
}

async function readPendingLaunches() {
  try {
    const store = getSessionStore();
    const res = await store.get(STORAGE_KEY);
    const list = Array.isArray(res && res[STORAGE_KEY]) ? res[STORAGE_KEY] : [];
    const now = Date.now();
    return list.filter((item) => item && item.origin && (!item.ts || now - item.ts <= MAX_AGE_MS));
  } catch {
    return [];
  }
}

async function writePendingLaunches(list) {
  try {
    const store = getSessionStore();
    await store.set({ [STORAGE_KEY]: list.slice(0, MAX_ENTRIES) });
  } catch {
    // Ignore storage errors
  }
}

function isOriginMatch(itemOrigin, currentOrigin) {
  if (!itemOrigin || !currentOrigin) return false;
  if (itemOrigin === currentOrigin) return true;
  try {
    const a = new URL(itemOrigin);
    const b = new URL(currentOrigin);
    if (a.hostname !== b.hostname) return false;
    const aPort = a.port || (a.protocol === 'https:' ? '443' : '80');
    const bPort = b.port || (b.protocol === 'https:' ? '443' : '80');
    if (a.protocol === 'http:' && b.protocol === 'https:') {
      if ((aPort === '80' && bPort === '443') || aPort === bPort) return true;
    }
    return a.protocol === b.protocol && aPort === bPort;
  } catch {
    return false;
  }
}

let storageQueue = Promise.resolve();

function withStorageLock(fn) {
  const next = storageQueue.then(() => fn(), () => fn());
  storageQueue = next.catch(() => {});
  return next;
}

async function storeLaunchPayload(rawPayload) {
  if (!rawPayload || !rawPayload.origin) return;
  return withStorageLock(async () => {
    const current = await readPendingLaunches();
    const launchKey = String(rawPayload.id || rawPayload.origin) + '|' + String(rawPayload.ts || Date.now());
    const filtered = current.filter((item) => {
      const existingKey = String(item.id || item.origin) + '|' + String(item.ts || 0);
      return existingKey !== launchKey && !isOriginMatch(item.origin, rawPayload.origin);
    });
    filtered.unshift({
      ...rawPayload,
      ts: Date.now(),
      filledTabs: [],
    });
    await writePendingLaunches(filtered);
  });
}

async function findMatchingLaunch(origin, tabId) {
  const list = await readPendingLaunches();
  for (const item of list) {
    if (!isOriginMatch(item.origin, origin)) continue;
    const filledTabs = Array.isArray(item.filledTabs) ? item.filledTabs : [];
    if (typeof tabId === 'number' && filledTabs.includes(tabId)) continue;
    return item;
  }
  return null;
}

async function markTabFilled(origin, tabId) {
  if (typeof tabId !== 'number') return;
  return withStorageLock(async () => {
    const list = await readPendingLaunches();
    // Burn-after-reading: remove the consumed credential entry once the target tab is filled
    const remaining = list.filter((item) => !isOriginMatch(item.origin, origin));
    if (remaining.length !== list.length) {
      await writePendingLaunches(remaining);
    }
  });
}

async function injectAutofillForTab(tabId, urlString) {
  if (typeof tabId !== 'number' || !urlString) return { injected: false };
  let parsed;
  try {
    parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { injected: false };
    }
  } catch {
    return { injected: false };
  }

  const payload = await findMatchingLaunch(parsed.origin, tabId);
  if (!payload || payload.authMode === 'basic') {
    return { injected: false };
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['autofill-core.js'],
      world: 'MAIN',
    });

    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: 'MAIN',
      args: [
        {
          username: String(payload.username || ''),
          password: String(payload.password || ''),
          autoSubmit: payload.autoSubmit !== false,
        },
      ],
      func: (opts) => {
        try {
          if (typeof window.__wmStartAutoFill !== 'function') return;
          const isTop = window === window.top;
          const hasPass =
            typeof window.__wmHasPasswordField === 'function' && window.__wmHasPasswordField();
          if (isTop || hasPass) {
            window.__wmStartAutoFill(opts);
          }
        } catch {
          // Ignore frame execution errors
        }
      },
    });
    return { injected: true };
  } catch (err) {
    return { injected: false, error: String(err) };
  }
}

function encodeBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

async function verifyPanelAuth(req, baseOrigin, timeoutMs) {
  const panelType = String(req.panelType || '1panel').toLowerCase();
  const entranceRaw = String(req.entrance || '').trim().replace(/^\\/+|\\/+$/g, '');
  const entrancePath = entranceRaw ? '/' + entranceRaw : '';
  const username = String(req.username || '');
  const password = String(req.password || '');
  if (!username || !password) return null;

  try {
    if (panelType === '1panel') {
      const apiPath = req.version === 'v1' ? '/api/v1/auth/login' : '/api/v2/auth/login';
      const fallbackPath = req.version === 'v1' ? '/api/v2/auth/login' : '/api/v1/auth/login';
      const headers = { 'Content-Type': 'application/json' };
      if (entranceRaw) {
        headers['EntranceCode'] = encodeBase64Utf8(entranceRaw);
      }
      const attempt = (endpoint) =>
        fetch(baseOrigin + endpoint, {
          method: 'POST',
          headers,
          credentials: 'omit',
          body: JSON.stringify({
            name: username,
            password,
            ignoreCaptcha: true,
            captcha: '',
            captchaID: '',
            authMethod: 'jwt',
            language: 'zh',
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });

      let authResp = await attempt(apiPath);
      if (authResp.status === 404) {
        authResp = await attempt(fallbackPath);
      }
      if (authResp.ok) {
        const data = await authResp.json().catch(() => ({}));
        if (data.code === 200 || data.code === undefined) {
          return { authStatus: 'auth_ok', status: authResp.status, authMessage: '目标连通且凭据校验通过' };
        }
        return {
          authStatus: 'auth_failed',
          status: authResp.status,
          authMessage: data.message || '账号密码校验未通过或需验证码/MFA',
        };
      }
      if (authResp.status === 401 || authResp.status === 400 || authResp.status === 403) {
        return {
          authStatus: 'auth_failed',
          status: authResp.status,
          authMessage: '端口可达，但凭据校验返回 HTTP ' + authResp.status,
        };
      }
      return null;
    }

    if (panelType === 'grafana') {
      const prefix = entrancePath === '/login' ? '' : entrancePath;
      const token = encodeBase64Utf8(username + ':' + password);
      const authResp = await fetch(baseOrigin + prefix + '/api/org', {
        method: 'GET',
        headers: { Authorization: 'Basic ' + token, Accept: 'application/json' },
        credentials: 'omit',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (authResp.ok) {
        return { authStatus: 'auth_ok', status: authResp.status, authMessage: 'Grafana 连通且凭据有效' };
      }
      if (authResp.status === 401 || authResp.status === 403) {
        return { authStatus: 'auth_failed', status: authResp.status, authMessage: 'Grafana 可达，但账号或密码未通过校验' };
      }
    }

    if (panelType === 'portainer') {
      const prefix = entrancePath === '/login' ? '' : entrancePath;
      const authResp = await fetch(baseOrigin + prefix + '/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({ username, password }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (authResp.ok) {
        return { authStatus: 'auth_ok', status: authResp.status, authMessage: 'Portainer 连通且凭据校验通过' };
      }
      if (authResp.status === 422 || authResp.status === 401) {
        return { authStatus: 'auth_failed', status: authResp.status, authMessage: 'Portainer 可达，但凭据校验失败' };
      }
    }

    if (panelType === 'kubesphere') {
      const authResp = await fetch(baseOrigin + '/kapis/iam.kubesphere.io/v1alpha2/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({ username, password }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (authResp.ok) {
        return { authStatus: 'auth_ok', status: authResp.status, authMessage: 'KubeSphere 连通且凭据有效' };
      }
      if (authResp.status === 401 || authResp.status === 400) {
        return { authStatus: 'auth_failed', status: authResp.status, authMessage: 'KubeSphere 可达，但凭据校验失败' };
      }
    }
  } catch {
    // Ignore auth probe errors and fall back to HTTP reachability result
  }
  return null;
}

async function handleProbeUrl(req) {
  const rawUrl = String((req && req.url) || '');
  let parsed;
  try {
    parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: 'protocol', message: '仅支持 HTTP 或 HTTPS 协议' };
    }
  } catch {
    return { ok: false, error: 'invalid_url', message: '访问地址格式无效' };
  }

  const timeoutMs = Math.max(1000, Math.min(15000, Number(req && req.timeoutMs) || 6000));
  const startedAt = Date.now();

  try {
    const resp = await fetch(parsed.href, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    try {
      await resp.body?.cancel();
    } catch {
      // Ignore cancel errors
    }

    const latencyMs = Math.max(1, Date.now() - startedAt);
    if (resp.status === 404) {
      return {
        ok: true,
        status: 404,
        latencyMs,
        finalUrl: resp.url || parsed.href,
      };
    }

    let authResult = null;
    if (req && req.verifyAuth && req.username && req.password) {
      let targetOrigin = parsed.origin;
      try {
        if (resp.url) targetOrigin = new URL(resp.url).origin;
      } catch {
        // Keep parsed.origin
      }
      authResult = await verifyPanelAuth(req, targetOrigin, timeoutMs);
    }

    const finalLatency = Math.max(1, Date.now() - startedAt);
    return {
      ok: true,
      status: resp.status,
      statusText: resp.statusText || '',
      latencyMs: finalLatency,
      finalUrl: resp.url || parsed.href,
      ...(authResult || {}),
    };
  } catch (err) {
    const latencyMs = Math.max(1, Date.now() - startedAt);
    const msg = err instanceof Error ? err.message : String(err);
    if (err && err.name === 'TimeoutError' || /abort|timeout/i.test(msg)) {
      return { ok: false, error: 'timeout', latencyMs };
    }
    if (parsed.protocol === 'https:') {
      return {
        ok: false,
        error: 'tls_or_network',
        latencyMs,
        message: '无法建立连接（地址不可达或自签名 HTTPS 证书尚未被浏览器信任）',
      };
    }
    return {
      ok: false,
      error: 'network',
      latencyMs,
      message: '目标不可达或连接被拒绝，请检查地址、端口或防火墙设置',
    };
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if ((changeInfo.status === 'complete' || changeInfo.url) && tab && tab.url) {
    void injectAutofillForTab(tabId, tab.url);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return false;

  if (msg.type === 'PROBE_URL') {
    handleProbeUrl(msg.payload)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: 'exception', message: String(err) }));
    return true;
  }

  if (msg.type === 'STORE_LAUNCH') {
    storeLaunchPayload(msg.payload)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === 'CHECK_TAB_AUTOFILL') {
    const tabId = sender && sender.tab ? sender.tab.id : undefined;
    const url = (msg.url || (sender && sender.tab && sender.tab.url) || '');
    injectAutofillForTab(tabId, url)
      .then((res) => sendResponse(res))
      .catch(() => sendResponse({ injected: false }));
    return true;
  }

  if (msg.type === 'MARK_TAB_FILLED') {
    const tabId = sender && sender.tab ? sender.tab.id : undefined;
    markTabFilled(String(msg.origin || ''), tabId)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === 'GET_STATUS') {
    readPendingLaunches()
      .then((list) =>
        sendResponse({
          ok: true,
          version: '${EXTENSION_VERSION}',
          pendingCount: list.length,
        })
      )
      .catch(() => sendResponse({ ok: false, version: '${EXTENSION_VERSION}', pendingCount: 0 }));
    return true;
  }

  if (msg.type === 'CLEAR_LAUNCHES') {
    withStorageLock(() => writePendingLaunches([]))
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  return false;
});
`;
}

function buildHubBridgeJs(): string {
  return `(function () {
  'use strict';

  const EXT_VERSION = '${EXTENSION_VERSION}';
  let lastLaunchSig = '';
  let lastLaunchAt = 0;

  function isExtensionContextValid() {
    try {
      return typeof chrome !== 'undefined' && Boolean(chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  function safeSendMessage(message, callback) {
    if (!isExtensionContextValid()) {
      if (typeof callback === 'function') {
        callback(null, 'Extension context invalidated');
      }
      return false;
    }
    try {
      chrome.runtime.sendMessage(message, (res) => {
        let errMsg = '';
        try {
          if (chrome.runtime && chrome.runtime.lastError) {
            errMsg = chrome.runtime.lastError.message || '扩展通信失败';
          }
        } catch (err) {
          errMsg = (err && err.message) || 'Extension context invalidated';
        }
        if (typeof callback === 'function') {
          callback(res, errMsg);
        }
      });
      return true;
    } catch (err) {
      if (typeof callback === 'function') {
        callback(null, (err && err.message) || 'Extension context invalidated');
      }
      return false;
    }
  }

  function isHubDocument() {
    return Boolean(document.querySelector('meta[name="1panel-hub-bridge"]'));
  }

  function markHubReady() {
    if (!isHubDocument() || !isExtensionContextValid()) return false;
    document.documentElement.setAttribute('data-waymark-extension', EXT_VERSION);
    try {
      window.dispatchEvent(new CustomEvent('${EXTENSION_READY_EVENT}', { detail: EXT_VERSION }));
    } catch (_) {}
    try {
      window.postMessage(
        { source: 'waymark-extension', type: 'WAYMARK_EXT_READY', version: EXT_VERSION },
        '*'
      );
    } catch (_) {}
    return true;
  }

  if (!markHubReady()) {
    try {
      const obs = new MutationObserver(() => {
        if (markHubReady()) obs.disconnect();
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      window.addEventListener(
        'DOMContentLoaded',
        () => {
          markHubReady();
          obs.disconnect();
        },
        { once: true }
      );
    } catch (_) {
      window.addEventListener('DOMContentLoaded', markHubReady, { once: true });
    }
  }

  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data || typeof ev.data !== 'object') return;
    const data = ev.data;

    if (data.source === 'waymark-hub' && data.type === '${EXTENSION_PROBE_REQUEST}') {
      if (!isHubDocument() || !data.requestId || !data.url) return;
      safeSendMessage({ type: 'PROBE_URL', payload: data }, (result, errMsg) => {
        const isInvalidated = /invalidated/i.test(errMsg || '');
        const payload = errMsg
          ? {
              ok: false,
              error: isInvalidated ? 'extension_invalidated' : 'extension_error',
              message: isInvalidated
                ? '插件刚更新或已重载，请刷新当前 Waymark 页面后再试'
                : errMsg || '扩展通信失败',
            }
          : result || { ok: false, error: 'no_response', message: '扩展未返回结果' };
        try {
          window.postMessage(
            {
              source: 'waymark-extension',
              type: '${EXTENSION_PROBE_RESULT}',
              requestId: data.requestId,
              result: payload,
            },
            '*'
          );
        } catch (_) {}
      });
      return;
    }

    if (
      (data.source === 'waymark-hub' && data.type === '${EXTENSION_LAUNCH_PAYLOAD}') ||
      data.type === 'waymark-hub-launch'
    ) {
      if (!isHubDocument() || !data.payload) return;
      let parsed = null;
      try {
        parsed = typeof data.payload === 'string' ? JSON.parse(data.payload) : data.payload;
      } catch (_) {
        return;
      }
      if (!parsed || typeof parsed !== 'object') return;
      const sig = String(parsed.id || parsed.origin || '') + '|' + String(parsed.ts || '');
      const now = Date.now();
      if (sig === lastLaunchSig && now - lastLaunchAt < 1000) return;
      lastLaunchSig = sig;
      lastLaunchAt = now;
      safeSendMessage({ type: 'STORE_LAUNCH', payload: parsed });
      return;
    }

    if (data.source === 'waymark-autofill' && data.type === 'WAYMARK_AUTOFILL_FILLED') {
      safeSendMessage({ type: 'MARK_TAB_FILLED', origin: location.origin });
    }
  });

  function triggerTabAutofillCheck() {
    if (isHubDocument() || !isExtensionContextValid()) return;
    safeSendMessage({ type: 'CHECK_TAB_AUTOFILL', url: location.href });
  }

  if (document.readyState !== 'loading') {
    triggerTabAutofillCheck();
  } else {
    window.addEventListener('DOMContentLoaded', triggerTabAutofillCheck, { once: true });
  }
  window.addEventListener('load', triggerTabAutofillCheck, { once: true });
  window.addEventListener('hashchange', () => {
    triggerTabAutofillCheck();
  });
})();
`;
}

function buildAutofillCoreFileJs(): string {
  const core = buildAutoFillCoreSource();
  return `(function () {
  'use strict';
${core}
  window.__wmStartAutoFill = __wmStartAutoFill;
  window.__wmHasPasswordField = function () {
    return Boolean(__wmFindPassword());
  };
})();
`;
}

function buildPopupHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>Waymark 助手</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 280px;
      padding: 16px;
      font: 12px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #fafafa;
      color: #09090b;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 12px;
      border-bottom: 1px solid #e4e4e7;
    }
    .title { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
    .ver { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: #71717a; }
    .body { padding: 12px 0; color: #52525b; }
    .row { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
    .val { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 600; color: #09090b; }
    .btn {
      width: 100%;
      margin-top: 8px;
      padding: 8px 12px;
      border: 1px solid #e4e4e7;
      border-radius: 8px;
      background: #fff;
      color: #09090b;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
    }
    .btn:hover { background: #f4f4f5; }
    .btn:disabled { opacity: 0.45; cursor: default; }
  </style>
</head>
<body>
  <div class="header">
    <span class="title">Waymark 助手</span>
    <span class="ver" id="version">v${EXTENSION_VERSION}</span>
  </div>
  <div class="body">
    <p>已就绪，支持无限制站点连通性检测与自动登录填充。</p>
    <div class="row">
      <span>当前暂存待登录凭据</span>
      <span class="val" id="count">0</span>
    </div>
  </div>
  <button class="btn" id="clear" type="button">清除暂存凭据</button>
  <script src="popup.js"></script>
</body>
</html>
`;
}

function buildPopupJs(): string {
  return `document.addEventListener('DOMContentLoaded', () => {
  const countEl = document.getElementById('count');
  const clearBtn = document.getElementById('clear');

  function refresh() {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
      const count = res && typeof res.pendingCount === 'number' ? res.pendingCount : 0;
      if (countEl) countEl.textContent = String(count);
      if (clearBtn) clearBtn.disabled = count === 0;
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'CLEAR_LAUNCHES' }, () => refresh());
    });
  }

  refresh();
});
`;
}

export function buildExtensionEntries(): ExtensionArchiveEntry[] {
  return [
    { name: 'manifest.json', data: encodeUtf8(buildManifestJson()) },
    { name: 'background.js', data: encodeUtf8(buildBackgroundJs()) },
    { name: 'hub-bridge.js', data: encodeUtf8(buildHubBridgeJs()) },
    { name: 'autofill-core.js', data: encodeUtf8(buildAutofillCoreFileJs()) },
    { name: 'popup.html', data: encodeUtf8(buildPopupHtml()) },
    { name: 'popup.js', data: encodeUtf8(buildPopupJs()) },
    { name: 'icons/icon16.png', data: generateExtensionIconPng(16) },
    { name: 'icons/icon48.png', data: generateExtensionIconPng(48) },
    { name: 'icons/icon128.png', data: generateExtensionIconPng(128) },
  ];
}

function buildZipFromEntries(entries: ExtensionArchiveEntry[]): Uint8Array {
  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = encodeUtf8(entry.name);
    const data = entry.data;
    const crc = crc32(data);

    const localHeader = new Uint8Array(30);
    writeUInt32LE(localHeader, 0x04034b50, 0);
    writeUInt16LE(localHeader, 20, 4);
    writeUInt16LE(localHeader, 0x0800, 6);
    writeUInt16LE(localHeader, 0, 8); // STORE (uncompressed) for universal isomorphic compatibility
    writeUInt16LE(localHeader, dosTime, 10);
    writeUInt16LE(localHeader, dosDate, 12);
    writeUInt32LE(localHeader, crc, 14);
    writeUInt32LE(localHeader, data.length, 18);
    writeUInt32LE(localHeader, data.length, 22);
    writeUInt16LE(localHeader, nameBuf.length, 26);
    writeUInt16LE(localHeader, 0, 28);

    localParts.push(localHeader, nameBuf, data);

    const centralHeader = new Uint8Array(46);
    writeUInt32LE(centralHeader, 0x02014b50, 0);
    writeUInt16LE(centralHeader, 20, 4);
    writeUInt16LE(centralHeader, 20, 6);
    writeUInt16LE(centralHeader, 0x0800, 8);
    writeUInt16LE(centralHeader, 0, 10); // STORE
    writeUInt16LE(centralHeader, dosTime, 12);
    writeUInt16LE(centralHeader, dosDate, 14);
    writeUInt32LE(centralHeader, crc, 16);
    writeUInt32LE(centralHeader, data.length, 20);
    writeUInt32LE(centralHeader, data.length, 24);
    writeUInt16LE(centralHeader, nameBuf.length, 28);
    writeUInt16LE(centralHeader, 0, 30);
    writeUInt16LE(centralHeader, 0, 32);
    writeUInt16LE(centralHeader, 0, 34);
    writeUInt16LE(centralHeader, 0, 36);
    writeUInt32LE(centralHeader, 0, 38);
    writeUInt32LE(centralHeader, offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + data.length;
  }

  const centralDir = concatBytes(centralParts);
  const eocd = new Uint8Array(22);
  writeUInt32LE(eocd, 0x06054b50, 0);
  writeUInt16LE(eocd, 0, 4);
  writeUInt16LE(eocd, 0, 6);
  writeUInt16LE(eocd, entries.length, 8);
  writeUInt16LE(eocd, entries.length, 10);
  writeUInt32LE(eocd, centralDir.length, 12);
  writeUInt32LE(eocd, offset, 16);
  writeUInt16LE(eocd, 0, 20);

  return concatBytes([...localParts, centralDir, eocd]);
}

let cachedZipBytes: Uint8Array | null = null;

export function getExtensionZipBuffer(): Uint8Array {
  if (!cachedZipBytes) {
    cachedZipBytes = buildZipFromEntries(buildExtensionEntries());
  }
  return cachedZipBytes;
}
