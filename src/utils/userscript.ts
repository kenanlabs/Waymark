import type { BridgeLaunchPayload, PanelNode, PanelType } from '../types/panel';

export const BRIDGE_VERSION = '1.5.1';
export const BRIDGE_PROBE_REQUEST_EVENT = 'waymark-probe-request';
export const BRIDGE_PROBE_RESULT_EVENT = 'waymark-probe-result';

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

export function buildBasicAuthTargetUrl(
  targetUrl: string,
  username: string,
  password: string
): string {
  if (!username && !password) return targetUrl;
  try {
    const parsed = new URL(targetUrl);
    if (username) parsed.username = username;
    if (password) parsed.password = password;
    return parsed.toString();
  } catch {
    return targetUrl;
  }
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
  const authMode = node.authMode === 'basic' ? 'basic' : 'form';
  if (authMode === 'basic') {
    return buildBasicAuthTargetUrl(targetUrl, node.username, node.password);
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
    authMode,
    ts: Date.now(),
  };
  const encoded = toBase64Url(JSON.stringify(payload));
  return `${targetUrl}#_1p_autologin=${encoded}`;
}

/**
 * Shared fill runtime used by both the bookmarklet and the userscript.
 * It is intentionally written without comments so it can be compacted into a
 * javascript: URL without breaking.
 */
function buildAutoFillCoreSource(): string {
  return String.raw`
function __wmToast(message, isError) {
  try {
    var existing = document.getElementById('__waymark_autofill_toast');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    var box = document.createElement('div');
    box.id = '__waymark_autofill_toast';
    box.textContent = message;
    box.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:360px;padding:10px 14px;border-radius:10px;font:12px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#fff;background:' + (isError ? '#B91C1C' : '#111827') + ';box-shadow:0 8px 30px rgba(0,0,0,.28);opacity:.97;pointer-events:none';
    (document.body || document.documentElement).appendChild(box);
    setTimeout(function () {
      try { if (box.parentNode) box.parentNode.removeChild(box); } catch (_) {}
    }, isError ? 8000 : 3200);
  } catch (_) {}
}

function __wmView(el) {
  try { return (el.ownerDocument && el.ownerDocument.defaultView) || window; } catch (_) { return window; }
}

function __wmAll(root, selector, out) {
  out = out || [];
  if (!root) return out;
  try {
    var matched = root.querySelectorAll(selector);
    for (var i = 0; i < matched.length; i++) {
      if (out.indexOf(matched[i]) < 0) out.push(matched[i]);
    }
    var all = root.querySelectorAll('*');
    for (var j = 0; j < all.length; j++) {
      var el = all[j];
      if (el.shadowRoot) __wmAll(el.shadowRoot, selector, out);
      if (el.tagName === 'IFRAME') {
        try {
          var frameDoc = el.contentDocument;
          if (frameDoc) __wmAll(frameDoc, selector, out);
        } catch (_) {}
      }
    }
  } catch (_) {}
  return out;
}

function __wmVisible(el) {
  if (!el || !el.isConnected) return false;
  try {
    var style = __wmView(el).getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    var rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  } catch (_) {
    return false;
  }
}

function __wmDescribe(el) {
  if (!el) return '';
  try {
    var cls = typeof el.className === 'string' ? el.className : '';
    return String((el.innerText || el.textContent || '')).slice(0, 400) + ' ' +
      (el.getAttribute ? (el.getAttribute('aria-label') || '') : '') + ' ' +
      (el.name || '') + ' ' + (el.id || '') + ' ' + cls;
  } catch (_) {
    return '';
  }
}

function __wmSetValue(el, value) {
  if (!el) return;
  try { el.removeAttribute('readonly'); el.readOnly = false; } catch (_) {}
  try { el.focus({ preventScroll: true }); } catch (_) {}
  try {
    var proto = Object.getPrototypeOf(el);
    var desc = (proto && Object.getOwnPropertyDescriptor(proto, 'value')) ||
      Object.getOwnPropertyDescriptor(__wmView(el).HTMLInputElement.prototype, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
  } catch (_) {
    try { el.value = value; } catch (__) {}
  }
  try {
    var tracker = el._valueTracker;
    if (tracker && typeof tracker.setValue === 'function') tracker.setValue('');
  } catch (_) {}
  var W = __wmView(el);
  try {
    el.dispatchEvent(new W.InputEvent('input', { bubbles: true, cancelable: true, data: String(value), inputType: 'insertText' }));
  } catch (_) {
    try { el.dispatchEvent(new W.Event('input', { bubbles: true })); } catch (__) {}
  }
  try {
    el.dispatchEvent(new W.Event('change', { bubbles: true }));
    el.dispatchEvent(new W.Event('blur', { bubbles: true }));
  } catch (_) {}
}

function __wmIsChecked(el) {
  if (!el) return false;
  if (el.type === 'checkbox' || el.type === 'radio') return Boolean(el.checked);
  try {
    if (el.getAttribute('aria-checked') === 'true') return true;
  } catch (_) {}
  var cls = typeof el.className === 'string' ? el.className : '';
  return /(^|\s)(is-checked|checked|selected)(\s|$)/.test(cls);
}

function __wmAgreementBoxes(scope) {
  var boxes = [];
  var list = __wmAll(scope || document, 'input[type="checkbox"],[role="checkbox"]');
  for (var i = 0; i < list.length; i++) {
    var box = list[i];
    if (box.disabled) continue;
    var label = box.closest ? box.closest('label') : null;
    var near = label || (box.parentElement && box.parentElement.parentElement) || box;
    var clue = __wmDescribe(box) + ' ' + __wmDescribe(near);
    if (/同意|协议|条款|许可|隐私|agree|terms|license|privacy|policy|consent/i.test(clue)) {
      if (boxes.indexOf(box) < 0) boxes.push(box);
    }
  }
  if (!boxes.length && scope && scope !== document) {
    var globalList = __wmAll(document, 'input[type="checkbox"],[role="checkbox"]');
    for (var g = 0; g < globalList.length; g++) {
      var globalBox = globalList[g];
      if (globalBox.disabled) continue;
      var globalLabel = globalBox.closest ? globalBox.closest('label') : null;
      var globalNear = globalLabel || (globalBox.parentElement && globalBox.parentElement.parentElement) || globalBox;
      var globalClue = __wmDescribe(globalBox) + ' ' + __wmDescribe(globalNear);
      if (/同意|协议|条款|许可|隐私|agree|terms|license|privacy|policy|consent/i.test(globalClue)) {
        if (boxes.indexOf(globalBox) < 0) boxes.push(globalBox);
      }
    }
  }
  if (!boxes.length) {
    var scopeText = String((scope && (scope.innerText || scope.textContent)) || '');
    if (/同意|协议|条款|许可|agree|terms|license|privacy|policy|consent/i.test(scopeText)) {
      var fallback = __wmAll(scope || document, 'input[type="checkbox"]');
      for (var j = 0; j < fallback.length; j++) {
        if (!fallback[j].disabled) boxes.push(fallback[j]);
      }
    }
  }
  return boxes;
}

function __wmHasUncheckedAgreement(scope) {
  var boxes = __wmAgreementBoxes(scope);
  for (var i = 0; i < boxes.length; i++) {
    if (!__wmIsChecked(boxes[i])) return true;
  }
  return false;
}

function __wmFindPassword() {
  var direct = document.querySelectorAll('input[type="password"]');
  for (var d = 0; d < direct.length; d++) {
    if (__wmVisible(direct[d]) && !direct[d].disabled) return direct[d];
  }
  var list = __wmAll(document, 'input');
  for (var i = 0; i < list.length; i++) {
    var input = list[i];
    if (!__wmVisible(input) || input.disabled) continue;
    if (__wmLooksLikePassword(input)) return input;
  }
  return null;
}

function __wmLooksLikePassword(input) {
  if (input.type === 'password') return true;
  var autocomplete = String(input.getAttribute('autocomplete') || '').toLowerCase();
  if (autocomplete.indexOf('current-password') >= 0 || autocomplete.indexOf('new-password') >= 0) {
    return true;
  }
  var clue = [
    input.name || '',
    input.id || '',
    input.getAttribute('placeholder') || '',
    input.getAttribute('aria-label') || '',
  ].join(' ');
  if (!/(pass|pwd|密码)/i.test(clue)) return false;
  return !/user|account|login|email|name|phone|账号|用户|邮箱|手机|登录名/i.test(clue);
}

function __wmFindScope(passInput) {
  var form = passInput.closest ? passInput.closest('form') : null;
  if (form) return form;
  var cur = passInput.parentElement;
  var depth = 0;
  while (cur && cur !== document.body && depth < 6) {
    var inputs = __wmAll(cur, 'input');
    var hasText = false;
    for (var i = 0; i < inputs.length; i++) {
      var input = inputs[i];
      if (input !== passInput && __wmVisible(input) && !input.disabled &&
        !/^(hidden|checkbox|radio|submit|button|reset|file|image|password)$/i.test(input.type || '')) {
        hasText = true;
        break;
      }
    }
    var buttons = __wmAll(cur, 'button,input[type="submit"],[role="button"]');
    var hasButton = false;
    for (var j = 0; j < buttons.length; j++) {
      if (__wmVisible(buttons[j])) { hasButton = true; break; }
    }
    if (hasText || hasButton) return cur;
    cur = cur.parentElement;
    depth++;
  }
  return document;
}

function __wmFindUsername(passInput, scope) {
  var all = __wmAll(scope, 'input');
  var candidates = [];
  for (var i = 0; i < all.length; i++) {
    var input = all[i];
    if (input === passInput || !__wmVisible(input) || input.disabled) continue;
    if (/^(hidden|checkbox|radio|submit|button|reset|file|image|password)$/i.test(input.type || '')) continue;
    candidates.push(input);
  }
  var passIndex = all.indexOf(passInput);
  for (var j = 0; j < candidates.length; j++) {
    var candidate = candidates[j];
    if (/username|email/i.test(candidate.autocomplete || '') ||
      /user|account|login|email|name|phone|账号|用户|邮箱|手机|登录名/i.test(__wmDescribe(candidate))) {
      return candidate;
    }
  }
  var before = [];
  for (var k = 0; k < candidates.length; k++) {
    if (passIndex < 0 || all.indexOf(candidates[k]) < passIndex) before.push(candidates[k]);
  }
  return before[before.length - 1] || candidates[0] || null;
}

function __wmFindSubmit(scope, passInput) {
  var containers = [scope];
  if (scope !== document && scope.parentElement) containers.push(scope.parentElement);
  containers.push(document);
  for (var c = 0; c < containers.length; c++) {
    var container = containers[c];
    var nativeButtons = __wmAll(container, 'button[type="submit"],input[type="submit"]');
    for (var i = 0; i < nativeButtons.length; i++) {
      if (__wmVisible(nativeButtons[i]) && !nativeButtons[i].disabled) return nativeButtons[i];
    }
    var buttons = __wmAll(container, 'button,[role="button"],input[type="button"],a[role="button"]');
    for (var j = 0; j < buttons.length; j++) {
      var button = buttons[j];
      if (!__wmVisible(button) || button.disabled || button.getAttribute('aria-disabled') === 'true') continue;
      var label = String(button.textContent || button.value || button.getAttribute('aria-label') || '').trim();
      if (/登\s*录|登\s*入|进\s*入|提\s*交|Log\s*In|Sign\s*In|Login|Signin|Submit|Continue/i.test(label)) {
        return button;
      }
    }
    var primary = __wmAll(container, 'button.el-button--primary,button.ant-btn-primary,button.n-button--primary-type,button[class*="primary"]');
    for (var k = 0; k < primary.length; k++) {
      if (__wmVisible(primary[k]) && !primary[k].disabled) return primary[k];
    }
  }
  return null;
}

function __wmHasCaptcha(scope, passInput, userInput) {
  var inputs = __wmAll(scope, 'input');
  for (var i = 0; i < inputs.length; i++) {
    var input = inputs[i];
    if (input === passInput || input === userInput) continue;
    if (!__wmVisible(input)) continue;
    if (/captcha|verify|otp|mfa|验证码|校验码/i.test(__wmDescribe(input))) return true;
  }
  var images = __wmAll(scope, 'img');
  for (var j = 0; j < images.length; j++) {
    var src = String(images[j].getAttribute('src') || '');
    if (/captcha|verify|验证码/i.test(src) && __wmVisible(images[j])) return true;
  }
  return false;
}

function __wmClickPasswordTab() {
  var elements = __wmAll(document, 'button,a,[role="button"],.el-tabs__item,.tab,[class*="tab"]');
  for (var i = 0; i < elements.length; i++) {
    var el = elements[i];
    if (!__wmVisible(el)) continue;
    var label = String(el.textContent || el.value || '').trim();
    if (label.length > 0 && label.length < 40 &&
      /账号密码登录|密码登录|账号登录|密码方式|使用密码|Password|Use password|Sign in with password/i.test(label)) {
      try { el.click(); } catch (_) {}
      return true;
    }
  }
  return false;
}

function __wmStartAutoFill(options) {
  var username = String((options && options.username) || '');
  var password = String((options && options.password) || '');
  var autoSubmit = !options || options.autoSubmit !== false;
  var done = false;
  var submitted = false;
  var tries = 0;
  var tabClicked = false;

  function attempt() {
    if (done) return;
    tries++;
    if (tries > 100) {
      __wmToast('Waymark：未找到登录表单，可能仍在加载或需要切换密码登录', true);
      return;
    }
    var passInput = __wmFindPassword();
    if (!passInput) {
      if (!tabClicked && tries >= 5) {
        tabClicked = true;
        __wmClickPasswordTab();
      }
      setTimeout(attempt, 150);
      return;
    }

    done = true;
    var scope = __wmFindScope(passInput);
    var userInput = __wmFindUsername(passInput, scope);

    if (userInput && username) __wmSetValue(userInput, username);
    if (password) __wmSetValue(passInput, password);
    __wmToast('Waymark：已填充' + (autoSubmit ? '，正在登录…' : ''), false);

    setTimeout(function () {
      if (userInput && username && userInput.value !== username) __wmSetValue(userInput, username);
      if (password && passInput.value !== password) __wmSetValue(passInput, password);
      if (!autoSubmit) return;

      if (__wmHasCaptcha(document, passInput, userInput)) {
        __wmToast('Waymark：检测到验证码，请手动完成登录', true);
        return;
      }

      if (__wmHasUncheckedAgreement(scope)) {
        __wmToast('Waymark：已填充账号密码；登录页仍有未勾选的协议，请手动勾选后登录', true);
        return;
      }

      setTimeout(function () {
        if (submitted) return;
        submitted = true;
        var submitButton = __wmFindSubmit(scope, passInput);
        if (submitButton && !submitButton.disabled) {
          try { submitButton.click(); } catch (_) {}
          return;
        }
        try {
          passInput.focus();
          var W = __wmView(passInput);
          ['keydown', 'keypress', 'keyup'].forEach(function (type) {
            passInput.dispatchEvent(new W.KeyboardEvent(type, {
              key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
            }));
          });
          var form = passInput.closest && passInput.closest('form');
          if (form && typeof form.requestSubmit === 'function') {
            try { form.requestSubmit(); } catch (_) {}
          }
        } catch (_) {}
      }, 160);
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attempt, { once: true });
  } else {
    attempt();
  }
}
`;
}

export function buildSingleNodeBookmarklet(node: PanelNode): string {
  const options = JSON.stringify({
    username: node.username || '',
    password: node.password || '',
    autoSubmit: Boolean(node.autoSubmit),
  });
  const core = buildAutoFillCoreSource().replace(/\s*\n\s*/g, ' ');
  return `javascript:(function(){${core}__wmStartAutoFill(${options});})();`;
}

export function generateUserscriptSource(hubOrigin?: string): string {
  const safeOrigin = (hubOrigin || '').replace(/\/+$/, '');
  const connectComment = safeOrigin
    ? `// @match        ${safeOrigin}/*`
    : '// @match        http://localhost:*/*';
  const updateUrls = safeOrigin
    ? `// @downloadURL  ${safeOrigin}/waymark-bridge.user.js
// @updateURL    ${safeOrigin}/waymark-bridge.user.js`
    : '';
  const core = buildAutoFillCoreSource();

  return `// ==UserScript==
// @name         Waymark Multi-Panel Auto-Login Bridge
// @namespace    https://waymark.local/
// @version      ${BRIDGE_VERSION}
// @description  Receive one-click launch credentials from Waymark, fill & submit login forms, and provide a privileged client-side reachability probe.
// @author       Waymark
${connectComment}
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @connect      *
${updateUrls}
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY = 'paneldeck_pending_login';
  const MAX_AGE_MS = 180000;
  const BRIDGE_VERSION = '${BRIDGE_VERSION}';
  const PROBE_REQUEST_EVENT = '${BRIDGE_PROBE_REQUEST_EVENT}';
  const PROBE_RESULT_EVENT = '${BRIDGE_PROBE_RESULT_EVENT}';

${core}

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

  function isHubDocument() {
    return Boolean(document.querySelector('meta[name="1panel-hub-bridge"]'));
  }

  function markHubReady() {
    if (!isHubDocument()) return false;
    document.documentElement.setAttribute('data-paneldeck-bridge', BRIDGE_VERSION);
    window.dispatchEvent(new CustomEvent('paneldeck-bridge-ready'));
    return true;
  }

  if (document.readyState !== 'loading') {
    markHubReady();
  } else {
    window.addEventListener('DOMContentLoaded', markHubReady, { once: true });
  }

  // Privileged client-side reachability probe (bypasses CORS, mixed content and PNA).
  window.addEventListener(PROBE_REQUEST_EVENT, (ev) => {
    if (!isHubDocument() || !ev || !ev.detail) return;
    let request;
    try {
      request = typeof ev.detail === 'string' ? JSON.parse(ev.detail) : ev.detail;
    } catch (_) {
      return;
    }
    if (!request || !request.requestId || !request.url) return;

    let parsed;
    try {
      parsed = new URL(String(request.url));
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
    } catch (_) {
      return;
    }

    const finish = (result) => {
      try {
        window.dispatchEvent(new CustomEvent(PROBE_RESULT_EVENT, {
          detail: JSON.stringify({ requestId: request.requestId, ...result }),
        }));
      } catch (_) {}
    };

    const requester =
      typeof GM_xmlhttpRequest === 'function'
        ? GM_xmlhttpRequest
        : typeof GM !== 'undefined' && GM && typeof GM.xmlHttpRequest === 'function'
          ? GM.xmlHttpRequest.bind(GM)
          : null;

    if (!requester) {
      finish({ unsupported: true });
      return;
    }

    let settled = false;
    const timeoutMs = Math.max(1000, Math.min(15000, Number(request.timeoutMs) || 6000));
    const finishOnce = (result) => {
      if (settled) return;
      settled = true;
      finish(result);
    };

    try {
      requester({
        method: 'GET',
        url: parsed.href,
        timeout: timeoutMs,
        anonymous: true,
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
        onload: (resp) => {
          finishOnce({
            ok: true,
            status: resp.status,
            statusText: resp.statusText || '',
            finalUrl: resp.finalUrl || parsed.href,
          });
        },
        onerror: (resp) => {
          finishOnce({
            ok: false,
            error: 'network',
            message: (resp && (resp.error || resp.statusText)) || '网络错误',
          });
        },
        ontimeout: () => finishOnce({ ok: false, error: 'timeout' }),
        onabort: () => finishOnce({ ok: false, error: 'abort' }),
      });
    } catch (err) {
      finishOnce({ ok: false, error: 'exception', message: String(err) });
    }
  });

  // Capture launch payloads from the Waymark page.
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

  // Capture the hash payload before the target SPA rewrites the URL.
  let hashPayload = null;
  if (location.hash && location.hash.includes('_1p_autologin=')) {
    try {
      const match = location.hash.match(/_1p_autologin=([A-Za-z0-9_-]+)/);
      if (match && match[1]) {
        hashPayload = JSON.parse(decodeBase64Url(match[1]));
        storePendingPayload(hashPayload);
        const cleanedHash = location.hash
          .replace(/[#&]_1p_autologin=[A-Za-z0-9_-]+/g, '')
          .replace(/^_1p_autologin=[A-Za-z0-9_-]+/, '');
        history.replaceState(null, '', location.pathname + location.search + cleanedHash);
      }
    } catch (_) {}
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
    } catch (_) {
      return false;
    }
  }

  let storedPayload = null;
  try {
    const raw = GM_getValue(STORAGE_KEY, '');
    if (raw) storedPayload = JSON.parse(raw);
  } catch (_) {}

  let payload = null;
  const candidates = [];
  if (hashPayload) candidates.push(hashPayload);
  if (storedPayload) candidates.push(storedPayload);
  const now = Date.now();
  for (const item of candidates) {
    if (!item || !item.origin) continue;
    if (item.ts && now - item.ts > MAX_AGE_MS) continue;
    if (isOriginMatch(item.origin, location.origin)) {
      payload = item;
      break;
    }
  }

  if (!payload) {
    const freshStored =
      storedPayload && storedPayload.origin && storedPayload.ts && now - storedPayload.ts <= 15000;
    if (hashPayload || freshStored) {
      __wmToast('Waymark：已收到登录信息，但当前域名与站点配置不匹配', true);
    }
    return;
  }

  if (isHubDocument() && !hashPayload) return;

  if (payload.authMode === 'basic') {
    try { GM_deleteValue(STORAGE_KEY); } catch (_) {}
    return;
  }

  __wmToast('Waymark：已收到登录信息，正在填充…', false);

  __wmStartAutoFill({
    username: payload.username || '',
    password: payload.password || '',
    autoSubmit: payload.autoSubmit !== false,
  });
})();
`;
}
