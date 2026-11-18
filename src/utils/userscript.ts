import type { BridgeLaunchPayload, PanelNode, PanelType } from '../types/panel';

export function normalizeBaseUrl(rawUrl: string): string {
  let trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `http://${trimmed}`;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.origin;
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

export function normalizeEntrance(rawEntrance: string): string {
  const cleaned = rawEntrance.trim().replace(/^\/+|\/+$/g, '');
  return cleaned ? `/${cleaned}` : '';
}

export function splitFullPanelUrl(
  rawInput: string,
  panelType: PanelType = '1panel'
): { baseUrl: string; entrance: string } {
  const trimmed = rawInput.trim();
  if (!trimmed) return { baseUrl: '', entrance: '' };
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    const pathname = parsed.pathname.replace(/^\/+|\/+$/g, '');
    if (!pathname) {
      return { baseUrl: parsed.origin, entrance: '' };
    }

    if (panelType === '1panel') {
      const ignorePaths = new Set(['', 'login', 'entrance', 'home', 'dashboard']);
      const firstSegment = pathname.split('/')[0] || '';
      const entrance = ignorePaths.has(firstSegment.toLowerCase()) ? '' : `/${firstSegment}`;
      return {
        baseUrl: parsed.origin,
        entrance,
      };
    }

    return {
      baseUrl: parsed.origin,
      entrance: `/${pathname}`,
    };
  } catch {
    return { baseUrl: normalizeBaseUrl(trimmed), entrance: '' };
  }
}

export function buildPanelTargetUrl(node: Pick<PanelNode, 'baseUrl' | 'entrance'>): string {
  const base = normalizeBaseUrl(node.baseUrl);
  const ent = normalizeEntrance(node.entrance);
  return `${base}${ent}`;
}

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function buildBridgeLaunchUrl(node: PanelNode, panelType?: PanelType): string {
  const targetUrl = buildPanelTargetUrl(node);
  if (!node.username && !node.password) {
    return targetUrl;
  }
  const payload: BridgeLaunchPayload = {
    id: node.id,
    name: node.name,
    panelType,
    origin: normalizeBaseUrl(node.baseUrl),
    targetUrl,
    entrance: normalizeEntrance(node.entrance),
    username: node.username,
    password: node.password,
    version: node.version,
    autoSubmit: node.autoSubmit,
    ts: Date.now(),
  };
  const encoded = toBase64Url(JSON.stringify(payload));
  return `${targetUrl}#_1p_autologin=${encoded}`;
}

export function buildSingleNodeBookmarklet(node: PanelNode): string {
  const userJson = JSON.stringify(node.username || '');
  const passJson = JSON.stringify(node.password || '');
  const autoSubmit = node.autoSubmit ? 'true' : 'false';
  const code = `(function(){var u=${userJson},p=${passJson},a=${autoSubmit};function sv(el,v){var d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');if(d&&d.set){d.set.call(el,v);}else{el.value=v;}el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}var pEl=document.querySelector('input[type="password"]');if(!pEl){alert('未在当前页面检测到登录表单');return;}var f=pEl.closest('form')||document;var ins=Array.from(f.querySelectorAll('input')).filter(function(i){return i.offsetParent!==null&&!i.disabled&&i.type!=='hidden'&&i.type!=='checkbox';});var uEl=ins.find(function(i){return i!==pEl&&(i.type==='text'||i.type==='email'||!i.type);});if(uEl)sv(uEl,u);sv(pEl,p);var cap=ins.find(function(i){return i!==uEl&&i!==pEl&&/captcha|code|verify|验证/i.test((i.placeholder||'')+(i.name||''));});if(a&&!cap){var btn=f.querySelector('button[type="submit"],button.el-button--primary')||Array.from(f.querySelectorAll('button')).find(function(b){return /登录|Log In|Log in|Sign In|Sign in|Login/i.test(b.textContent||'');});if(btn)setTimeout(function(){btn.click();},150);}})();`;
  return `javascript:${code}`;
}

export function generateUserscriptSource(hubOrigin?: string): string {
  const safeOrigin = (hubOrigin || '').replace(/\/+$/, '');
  const connectComment = safeOrigin
    ? `// @match        ${safeOrigin}/*`
    : '// @match        http://localhost:*/*';

  return `// ==UserScript==
// @name         Waymark Multi-Panel Auto-Login Bridge
// @namespace    https://waymark.local/
// @version      1.3.0
// @description  Receive one-click launch credentials from Waymark and automatically fill & submit login forms across domains.
// @author       Waymark
${connectComment}
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY = 'paneldeck_pending_login';
  const MAX_AGE_MS = 120000;

  function decodeBase64Url(b64u) {
    let b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // 1. On Waymark Hub page: announce bridge readiness & capture click payloads via GM_setValue
  const isHubPage = document.querySelector('meta[name="1panel-hub-bridge"]') || location.port === '3000';
  window.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('meta[name="1panel-hub-bridge"]')) {
      document.documentElement.setAttribute('data-paneldeck-bridge', '1.2.0');
      window.dispatchEvent(new CustomEvent('paneldeck-bridge-ready'));
    }
  });

  window.addEventListener('1panel-hub-launch', (ev) => {
    if (!ev || !ev.detail) return;
    try {
      GM_setValue(STORAGE_KEY, JSON.stringify({ ...ev.detail, ts: Date.now() }));
    } catch (_) {}
  });

  // 2. Capture URL Hash payload immediately (before SPA router rewrites URL)
  let hashPayload = null;
  if (location.hash && location.hash.includes('_1p_autologin=')) {
    try {
      const m = location.hash.match(/_1p_autologin=([A-Za-z0-9_-]+)/);
      if (m && m[1]) {
        hashPayload = JSON.parse(decodeBase64Url(m[1]));
        GM_setValue(STORAGE_KEY, JSON.stringify({ ...hashPayload, ts: Date.now() }));
        history.replaceState(null, '', location.pathname + location.search);
      }
    } catch (_) {}
  }

  if (isHubPage && !hashPayload) return;

  // 3. On target panel page: resolve matching pending payload
  function getMatchingPayload() {
    const candidates = [];
    if (hashPayload) candidates.push(hashPayload);
    try {
      const raw = GM_getValue(STORAGE_KEY, '');
      if (raw) candidates.push(JSON.parse(raw));
    } catch (_) {}

    const now = Date.now();
    for (const item of candidates) {
      if (!item || !item.origin) continue;
      if (item.ts && now - item.ts > MAX_AGE_MS) continue;
      if (item.origin === location.origin) {
        return item;
      }
    }
    return null;
  }

  const payload = getMatchingPayload();
  if (!payload) return;

  function setNativeValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value') ||
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (desc && desc.set) {
      desc.set.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  let done = false;
  let tries = 0;

  function tryFillAndLogin() {
    if (done || tries > 60) return;
    tries++;

    const passInput = document.querySelector('input[type="password"]');
    if (!passInput || passInput.offsetParent === null) return;

    const form = passInput.closest('form') || document;
    const inputs = Array.from(form.querySelectorAll('input')).filter(
      (i) => i.offsetParent !== null && !i.disabled && i.type !== 'hidden' && i.type !== 'checkbox'
    );
    const userInput = inputs.find(
      (i) => i !== passInput && (i.type === 'text' || i.type === 'email' || !i.type)
    );

    if (!userInput) return;

    done = true;
    try { GM_deleteValue(STORAGE_KEY); } catch (_) {}

    setNativeValue(userInput, payload.username || '');
    setNativeValue(passInput, payload.password || '');

    const hasCaptcha = inputs.some(
      (i) =>
        i !== userInput &&
        i !== passInput &&
        /captcha|code|verify|mfa|otp|验证/i.test((i.placeholder || '') + ' ' + (i.name || ''))
    );

    if (payload.autoSubmit && !hasCaptcha) {
      setTimeout(() => {
        const submitBtn =
          form.querySelector('button[type="submit"]') ||
          Array.from(form.querySelectorAll('button')).find((b) =>
            /登录|Log In|Log in|Sign In|Sign in|Login|Submit/i.test(b.textContent || '')
          ) ||
          form.querySelector('button.el-button--primary');
        if (submitBtn && !submitBtn.disabled) {
          submitBtn.click();
        }
      }, 220);
    }
  }

  const observer = new MutationObserver(() => {
    tryFillAndLogin();
    if (done) observer.disconnect();
  });

  window.addEventListener('DOMContentLoaded', () => {
    tryFillAndLogin();
    if (!done && document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  });

  const timer = setInterval(() => {
    tryFillAndLogin();
    if (done || tries > 60) {
      clearInterval(timer);
      observer.disconnect();
    }
  }, 150);
})();
`;
}
