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
  const code = `(function(){var u=${userJson},p=${passJson},a=${autoSubmit};function qAll(r,s,o){o=o||[];if(!r||!r.querySelectorAll)return o;var m=r.querySelectorAll(s);for(var i=0;i<m.length;i++)o.push(m[i]);var all=r.querySelectorAll('*');for(var j=0;j<all.length;j++){if(all[j].shadowRoot)qAll(all[j].shadowRoot,s,o);}return o;}function vis(el){if(!el||!el.isConnected)return false;var st=getComputedStyle(el);if(st.display==='none'||st.visibility==='hidden'||st.opacity==='0')return false;var rc=el.getBoundingClientRect();return rc.width>0&&rc.height>0;}function sv(el,v){try{el.focus({preventScroll:true});}catch(_){}var pr=Object.getPrototypeOf(el);var d=(pr&&Object.getOwnPropertyDescriptor(pr,'value'))||Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');if(d&&d.set){d.set.call(el,v);}else{el.value=v;}try{if(el._valueTracker)el._valueTracker.setValue('');}catch(_){}el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new Event('blur',{bubbles:true}));}var pEl=qAll(document,'input[type="password"]').find(function(i){return vis(i)&&!i.disabled&&!i.readOnly;});if(!pEl){alert('未在当前页面检测到可用的登录密码框');return;}var sc=pEl.closest('form');if(!sc){var cur=pEl.parentElement,step=0;while(cur&&cur!==document.body&&step<6){var hasU=qAll(cur,'input').some(function(i){return i!==pEl&&vis(i)&&!i.disabled&&!/hidden|checkbox|radio|submit|button|reset|file|image|password/i.test(i.type||'');});var hasB=qAll(cur,'button,input[type="submit"],[role="button"]').some(vis);if(hasU||hasB){sc=cur;break;}cur=cur.parentElement;step++;}}sc=sc||document;var ins=qAll(sc,'input').filter(function(i){return vis(i)&&!i.disabled&&!i.readOnly&&!/hidden|checkbox|radio|submit|button|reset|file|image/i.test(i.type||'');});var cands=ins.filter(function(i){return i!==pEl&&i.type!=='password';});var pi=ins.indexOf(pEl);var uEl=cands.find(function(i){return /username|email/i.test(i.autocomplete||'')||/user|account|login|email|name|phone|账号|用户|邮箱|手机/i.test((i.name||'')+' '+(i.id||'')+' '+(i.placeholder||'')+' '+(i.getAttribute('aria-label')||''));})||(pi>0?cands.filter(function(i){return ins.indexOf(i)<pi;}).pop():null)||cands[0];if(uEl&&u)sv(uEl,u);sv(pEl,p);var cap=cands.find(function(i){return i!==uEl&&/captcha|code|verify|mfa|otp|验证/i.test((i.placeholder||'')+' '+(i.name||'')+' '+(i.id||''));});if(a&&!cap){var btn=qAll(sc,'button[type="submit"],input[type="submit"]').find(vis)||qAll(sc,'button,[role="button"],input[type="button"]').find(function(b){return vis(b)&&!b.disabled&&/登\\s*录|进\\s*入|提\\s*交|Log\\s*In|Sign\\s*In|Login|Signin|Submit|Continue/i.test((b.textContent||b.value||''));})||qAll(sc,'button.el-button--primary,button.ant-btn-primary,button.n-button--primary-type').find(vis);setTimeout(function(){if(uEl&&u&&uEl.value!==u)sv(uEl,u);if(p&&pEl.value!==p)sv(pEl,p);if(btn&&!btn.disabled){btn.click();}else{pEl.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));}},200);}})();`;
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
// @version      1.4.0
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
  const MAX_AGE_MS = 180000;

  function decodeBase64Url(b64u) {
    let b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function storePendingPayload(rawObj) {
    if (!rawObj || !rawObj.origin) return;
    try {
      GM_setValue(STORAGE_KEY, JSON.stringify({ ...rawObj, ts: Date.now() }));
    } catch (_) {}
  }

  // 1. On Waymark Hub page: announce bridge readiness & capture click payloads via postMessage / CustomEvent
  function markHubReady() {
    if (document.querySelector('meta[name="1panel-hub-bridge"]')) {
      document.documentElement.setAttribute('data-paneldeck-bridge', '1.4.0');
      window.dispatchEvent(new CustomEvent('paneldeck-bridge-ready'));
      return true;
    }
    return false;
  }

  if (document.readyState !== 'loading') {
    markHubReady();
  } else {
    window.addEventListener('DOMContentLoaded', markHubReady, { once: true });
  }

  window.addEventListener('1panel-hub-launch', (ev) => {
    if (!ev || !ev.detail) return;
    try {
      const parsed = typeof ev.detail === 'string' ? JSON.parse(ev.detail) : ev.detail;
      storePendingPayload(parsed);
    } catch (_) {}
  });

  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data || ev.data.type !== 'waymark-hub-launch') return;
    try {
      const parsed = typeof ev.data.payload === 'string' ? JSON.parse(ev.data.payload) : ev.data.payload;
      storePendingPayload(parsed);
    } catch (_) {}
  });

  // 2. Capture URL Hash payload immediately (before SPA router rewrites URL)
  let hashPayload = null;
  if (location.hash && location.hash.includes('_1p_autologin=')) {
    try {
      const m = location.hash.match(/_1p_autologin=([A-Za-z0-9_-]+)/);
      if (m && m[1]) {
        hashPayload = JSON.parse(decodeBase64Url(m[1]));
        storePendingPayload(hashPayload);
        const cleanedHash = location.hash
          .replace(/[#&]_1p_autologin=[A-Za-z0-9_-]+/g, '')
          .replace(/^_1p_autologin=[A-Za-z0-9_-]+/, '');
        history.replaceState(null, '', location.pathname + location.search + cleanedHash);
      }
    } catch (_) {}
  }

  function isHubDocument() {
    return Boolean(document.querySelector('meta[name="1panel-hub-bridge"]'));
  }

  function isOriginMatch(itemOrigin, currentOrigin) {
    if (!itemOrigin || !currentOrigin) return false;
    if (itemOrigin === currentOrigin) return true;
    try {
      const a = new URL(itemOrigin);
      const b = new URL(currentOrigin);
      if (a.hostname !== b.hostname) return false;
      const aDefaultPort = a.port || (a.protocol === 'https:' ? '443' : '80');
      const bDefaultPort = b.port || (b.protocol === 'https:' ? '443' : '80');
      if (a.protocol === 'http:' && b.protocol === 'https:' && aDefaultPort === '80' && bDefaultPort === '443') {
        return true;
      }
      return a.protocol === b.protocol && aDefaultPort === bDefaultPort;
    } catch {
      return false;
    }
  }

  // 3. On target page: resolve matching pending payload
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
      if (isOriginMatch(item.origin, location.origin)) {
        return item;
      }
    }
    return null;
  }

  const payload = getMatchingPayload();
  if (!payload) return;

  function queryAllDeep(root, selector, out = []) {
    if (!root || !root.querySelectorAll) return out;
    const matched = root.querySelectorAll(selector);
    for (let i = 0; i < matched.length; i++) out.push(matched[i]);
    const all = root.querySelectorAll('*');
    for (let i = 0; i < all.length; i++) {
      if (all[i].shadowRoot) {
        queryAllDeep(all[i].shadowRoot, selector, out);
      }
    }
    return out;
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function setNativeValue(el, value) {
    if (!el) return;
    try { el.focus({ preventScroll: true }); } catch (_) {}
    const proto = Object.getPrototypeOf(el);
    const desc =
      (proto && Object.getOwnPropertyDescriptor(proto, 'value')) ||
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (desc && desc.set) {
      desc.set.call(el, value);
    } else {
      el.value = value;
    }
    try {
      const tracker = el._valueTracker || (el.wrappedJSObject && el.wrappedJSObject._valueTracker);
      if (tracker && typeof tracker.setValue === 'function') {
        tracker.setValue('');
      }
    } catch (_) {}
    try {
      el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: value, inputType: 'insertText' }));
    } catch (_) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function findLoginScope(passInput) {
    const form = passInput.closest('form');
    if (form) return form;
    let cur = passInput.parentElement;
    let depth = 0;
    while (cur && cur !== document.body && depth < 6) {
      const hasOtherText = queryAllDeep(cur, 'input').some(
        (i) =>
          i !== passInput &&
          isVisible(i) &&
          !i.disabled &&
          !i.readOnly &&
          !/^(hidden|checkbox|radio|submit|button|reset|file|image|password)$/i.test(i.type || '')
      );
      const hasBtn = queryAllDeep(cur, 'button, input[type="submit"], [role="button"]').some(isVisible);
      if (hasOtherText && hasBtn) return cur;
      cur = cur.parentElement;
      depth++;
    }
    return passInput.parentElement?.parentElement || document;
  }

  function findSubmitButton(scope, passInput) {
    const candidates = [scope];
    if (scope !== document && scope.parentElement) {
      candidates.push(scope.parentElement);
    }
    for (const container of candidates) {
      const nativeSubmit = queryAllDeep(container, 'button[type="submit"], input[type="submit"]').find(
        (b) => isVisible(b) && !b.disabled
      );
      if (nativeSubmit) return nativeSubmit;

      const textSubmit = queryAllDeep(
        container,
        'button, [role="button"], input[type="button"], a[role="button"]'
      ).find((b) => {
        if (!isVisible(b) || b.disabled || b.getAttribute('aria-disabled') === 'true') return false;
        const label = (b.textContent || b.value || b.getAttribute('aria-label') || '').trim();
        return /登\\s*录|进\\s*入|提\\s*交|Log\\s*In|Sign\\s*In|Login|Signin|Submit|Continue/i.test(label);
      });
      if (textSubmit) return textSubmit;

      const primaryBtn = queryAllDeep(
        container,
        'button.el-button--primary, button.ant-btn-primary, button.n-button--primary-type, button[class*="primary"]'
      ).find((b) => isVisible(b) && !b.disabled);
      if (primaryBtn) return primaryBtn;
    }
    return null;
  }

  function triggerEnterSubmit(el) {
    try { el.focus({ preventScroll: true }); } catch (_) {}
    const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent('keydown', opts));
    el.dispatchEvent(new KeyboardEvent('keypress', opts));
    el.dispatchEvent(new KeyboardEvent('keyup', opts));
    const form = el.closest && el.closest('form');
    if (form) {
      if (typeof form.requestSubmit === 'function') {
        try { form.requestSubmit(); } catch (_) {}
      }
    }
  }

  let done = false;
  let tries = 0;

  function tryFillAndLogin() {
    if (done || tries > 100) return;
    if (isHubDocument() && !hashPayload) return;
    tries++;

    const passInput = queryAllDeep(document, 'input[type="password"]').find(
      (i) => isVisible(i) && !i.disabled && !i.readOnly
    );
    if (!passInput) return;

    const scope = findLoginScope(passInput);
    const scopeInputs = queryAllDeep(scope, 'input').filter(
      (i) =>
        isVisible(i) &&
        !i.disabled &&
        !i.readOnly &&
        !/^(hidden|checkbox|radio|submit|button|reset|file|image)$/i.test(i.type || '')
    );

    const textInputs = scopeInputs.filter((i) => i !== passInput && i.type !== 'password');
    const passIdx = scopeInputs.indexOf(passInput);
    const beforePass = passIdx > 0 ? textInputs.filter((i) => scopeInputs.indexOf(i) < passIdx) : textInputs;

    const userInput =
      textInputs.find(
        (i) =>
          /username|email/i.test(i.autocomplete || '') ||
          /user|account|login|email|name|phone|账号|用户|邮箱|手机/i.test(
            (i.name || '') + ' ' + (i.id || '') + ' ' + (i.placeholder || '') + ' ' + (i.getAttribute('aria-label') || '')
          )
      ) ||
      beforePass[beforePass.length - 1] ||
      textInputs[0];

    if (payload.username && !userInput && tries < 8) {
      // Wait a few ticks in case username input mounts slightly after password input
      return;
    }

    done = true;

    if (userInput && payload.username) {
      setNativeValue(userInput, payload.username);
    }
    if (payload.password) {
      setNativeValue(passInput, payload.password);
    }

    const hasCaptcha = textInputs.some(
      (i) =>
        i !== userInput &&
        /captcha|code|verify|mfa|otp|验证/i.test(
          (i.placeholder || '') + ' ' + (i.name || '') + ' ' + (i.id || '')
        )
    );

    setTimeout(() => {
      // Re-apply once if framework state hydration cleared values
      if (userInput && payload.username && userInput.value !== payload.username) {
        setNativeValue(userInput, payload.username);
      }
      if (payload.password && passInput.value !== payload.password) {
        setNativeValue(passInput, payload.password);
      }

      try { GM_deleteValue(STORAGE_KEY); } catch (_) {}

      if (payload.autoSubmit !== false && !hasCaptcha) {
        setTimeout(() => {
          const submitBtn = findSubmitButton(scope, passInput);
          if (submitBtn && !submitBtn.disabled) {
            submitBtn.click();
          } else {
            triggerEnterSubmit(passInput);
          }
        }, 120);
      }
    }, 180);
  }

  const observer = new MutationObserver(() => {
    tryFillAndLogin();
    if (done) observer.disconnect();
  });

  function startWatching() {
    tryFillAndLogin();
    if (!done && document.body) {
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    }
  }

  if (document.readyState !== 'loading') {
    startWatching();
  } else {
    window.addEventListener('DOMContentLoaded', startWatching, { once: true });
  }

  const timer = setInterval(() => {
    tryFillAndLogin();
    if (done || tries > 100) {
      clearInterval(timer);
      observer.disconnect();
    }
  }, 150);
})();
`;
}
