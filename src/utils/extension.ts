import zlib from 'node:zlib';
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
  data: Buffer;
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

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function generateExtensionIconPng(size: number): Buffer {
  const raw = Buffer.alloc(size * (1 + size * 4));
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

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const idat = zlib.deflateSync(raw);

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
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
const MAX_AGE_MS = 180000;
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

async function storeLaunchPayload(rawPayload) {
  if (!rawPayload || !rawPayload.origin) return;
  const current = await readPendingLaunches();
  const launchKey = String(rawPayload.id || rawPayload.origin) + '|' + String(rawPayload.ts || Date.now());
  const filtered = current.filter((item) => {
    const existingKey = String(item.id || item.origin) + '|' + String(item.ts || 0);
    return existingKey !== launchKey && item.origin !== rawPayload.origin;
  });
  filtered.unshift({
    ...rawPayload,
    ts: Date.now(),
    filledTabs: [],
  });
  await writePendingLaunches(filtered);
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
  const list = await readPendingLaunches();
  let changed = false;
  for (const item of list) {
    if (isOriginMatch(item.origin, origin)) {
      const filledTabs = Array.isArray(item.filledTabs) ? item.filledTabs : [];
      if (!filledTabs.includes(tabId)) {
        item.filledTabs = [...filledTabs, tabId];
        changed = true;
      }
    }
  }
  if (changed) {
    await writePendingLaunches(list);
  }
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
  if (changeInfo.status === 'complete' && tab && tab.url) {
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
    writePendingLaunches([])
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

  function isHubDocument() {
    return Boolean(document.querySelector('meta[name="1panel-hub-bridge"]'));
  }

  function markHubReady() {
    if (!isHubDocument()) return false;
    document.documentElement.setAttribute('data-waymark-extension', EXT_VERSION);
    if (!document.documentElement.getAttribute('data-paneldeck-bridge')) {
      document.documentElement.setAttribute('data-paneldeck-bridge', EXT_VERSION);
    }
    try {
      window.dispatchEvent(new CustomEvent('${EXTENSION_READY_EVENT}', { detail: EXT_VERSION }));
      window.dispatchEvent(new CustomEvent('paneldeck-bridge-ready'));
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

  function decodeBase64Url(b64u) {
    let b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function captureHashLaunch() {
    if (!location.hash || !location.hash.includes('_1p_autologin=')) return;
    try {
      const match = location.hash.match(/_1p_autologin=([A-Za-z0-9_-]+)/);
      if (match && match[1]) {
        const parsed = JSON.parse(decodeBase64Url(match[1]));
        const cleanedHash = location.hash
          .replace(/[#&]_1p_autologin=[A-Za-z0-9_-]+/g, '')
          .replace(/^_1p_autologin=[A-Za-z0-9_-]+/, '');
        history.replaceState(null, '', location.pathname + location.search + cleanedHash);
        chrome.runtime.sendMessage({ type: 'STORE_LAUNCH', payload: parsed }, () => {
          void chrome.runtime.lastError;
          if (!isHubDocument()) {
            chrome.runtime.sendMessage({ type: 'CHECK_TAB_AUTOFILL', url: location.href }, () => {
              void chrome.runtime.lastError;
            });
          }
        });
      }
    } catch (_) {}
  }

  captureHashLaunch();

  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data || typeof ev.data !== 'object') return;
    const data = ev.data;

    if (data.source === 'waymark-hub' && data.type === '${EXTENSION_PROBE_REQUEST}') {
      if (!isHubDocument() || !data.requestId || !data.url) return;
      chrome.runtime.sendMessage({ type: 'PROBE_URL', payload: data }, (result) => {
        const err = chrome.runtime.lastError;
        const payload = err
          ? { ok: false, error: 'extension_error', message: err.message || '扩展通信失败' }
          : result || { ok: false, error: 'no_response', message: '扩展未返回结果' };
        window.postMessage(
          {
            source: 'waymark-extension',
            type: '${EXTENSION_PROBE_RESULT}',
            requestId: data.requestId,
            result: payload,
          },
          '*'
        );
      });
      return;
    }

    if (
      (data.source === 'waymark-hub' && data.type === '${EXTENSION_LAUNCH_PAYLOAD}') ||
      data.type === 'waymark-hub-launch'
    ) {
      if (!isHubDocument() || !data.payload) return;
      const parsed = typeof data.payload === 'string' ? JSON.parse(data.payload) : data.payload;
      chrome.runtime.sendMessage({ type: 'STORE_LAUNCH', payload: parsed }, () => {
        void chrome.runtime.lastError;
      });
      return;
    }

    if (data.source === 'waymark-autofill' && data.type === 'WAYMARK_AUTOFILL_FILLED') {
      chrome.runtime.sendMessage({ type: 'MARK_TAB_FILLED', origin: location.origin }, () => {
        void chrome.runtime.lastError;
      });
    }
  });

  function triggerTabAutofillCheck() {
    if (isHubDocument()) return;
    chrome.runtime.sendMessage({ type: 'CHECK_TAB_AUTOFILL', url: location.href }, () => {
      void chrome.runtime.lastError;
    });
  }

  if (document.readyState !== 'loading') {
    triggerTabAutofillCheck();
  } else {
    window.addEventListener('DOMContentLoaded', triggerTabAutofillCheck, { once: true });
  }
  window.addEventListener('load', triggerTabAutofillCheck, { once: true });
  window.addEventListener('hashchange', () => {
    captureHashLaunch();
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
    { name: 'manifest.json', data: Buffer.from(buildManifestJson(), 'utf8') },
    { name: 'background.js', data: Buffer.from(buildBackgroundJs(), 'utf8') },
    { name: 'hub-bridge.js', data: Buffer.from(buildHubBridgeJs(), 'utf8') },
    { name: 'autofill-core.js', data: Buffer.from(buildAutofillCoreFileJs(), 'utf8') },
    { name: 'popup.html', data: Buffer.from(buildPopupHtml(), 'utf8') },
    { name: 'popup.js', data: Buffer.from(buildPopupJs(), 'utf8') },
    { name: 'icons/icon16.png', data: generateExtensionIconPng(16) },
    { name: 'icons/icon48.png', data: generateExtensionIconPng(48) },
    { name: 'icons/icon128.png', data: generateExtensionIconPng(128) },
  ];
}

function buildZipFromEntries(entries: ExtensionArchiveEntry[]): Buffer {
  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const uncompressed = entry.data;
    const compressed = zlib.deflateRawSync(uncompressed);
    const crc = crc32(uncompressed);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(uncompressed.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(uncompressed.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

let cachedZipBuffer: Buffer | null = null;

export function getExtensionZipBuffer(): Buffer {
  if (!cachedZipBuffer) {
    cachedZipBuffer = buildZipFromEntries(buildExtensionEntries());
  }
  return cachedZipBuffer;
}
