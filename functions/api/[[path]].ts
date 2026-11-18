interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

interface CloudflareEnv {
  WAYMARK_KV?: KVNamespaceLike;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
}

interface PagesContext {
  request: Request;
  env: CloudflareEnv;
  params: {
    path?: string | string[];
  };
}

interface StoredAdminConfig {
  username: string;
  role: 'admin';
  salt: string;
  passwordHash: string;
  sessionSecret: string;
  createdAt: string;
  updatedAt: string;
}

interface SessionPayload {
  sub: string;
  role: 'admin';
  iat: number;
  exp: number;
}

interface PublicWorkspaceRecord {
  id: string;
  name: string;
  description?: string;
  publicRoute: string;
  publicDomain?: string;
  publicProtocol?: 'http' | 'https';
  customFields?: Array<Record<string, unknown>>;
  updatedAt: string;
  nodes: Array<Record<string, unknown>>;
}

interface ServerWorkspaceState {
  version: 1;
  activeWorkspaceId?: string;
  viewMode?: 'grid' | 'table';
  bgTone?: string;
  bgPattern?: string;
  fontFamily?: string;
  workspaces: Array<Record<string, unknown>>;
  nodes: Array<Record<string, unknown>>;
  updatedAt: string;
}

const SESSION_COOKIE = 'paneldeck_admin_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const KV_ADMIN_KEY = 'waymark:admin_v1';
const KV_STATE_KEY = 'waymark:state_v1';
const KV_PUBLIC_WORKSPACES_KEY = 'waymark:public_workspaces_v1';

function jsonResponse(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomHex(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function toBase64Url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64UrlToString(b64url: string): string {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + '='.repeat(padLen));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

async function hashPasswordEdge(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(`waymark_edge:${salt}`),
      iterations: 60000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

async function hmacSignEdge(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return toBase64Url(new Uint8Array(sig));
}

async function signSessionTokenEdge(username: string, secret: string): Promise<string> {
  const payload: SessionPayload = {
    sub: username,
    role: 'admin',
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
  };
  const body = toBase64Url(JSON.stringify(payload));
  const sig = await hmacSignEdge(body, secret);
  return `${body}.${sig}`;
}

async function verifySessionTokenEdge(
  token: string,
  secret: string
): Promise<SessionPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = await hmacSignEdge(body, secret);
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(fromBase64UrlToString(body)) as SessionPayload;
    if (
      !payload ||
      payload.role !== 'admin' ||
      typeof payload.sub !== 'string' ||
      typeof payload.exp !== 'number' ||
      payload.exp < Date.now()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function extractTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookieHeader = request.headers.get('cookie') || '';
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName === SESSION_COOKIE) {
      const value = rest.join('=').trim();
      if (value) return decodeURIComponent(value);
    }
  }
  return null;
}

function buildCookieHeader(token: string, request: Request, clear = false): string {
  const isHttps = new URL(request.url).protocol === 'https:';
  const maxAge = clear ? 0 : Math.floor(SESSION_TTL_MS / 1000);
  const parts = [
    `${SESSION_COOKIE}=${clear ? '' : encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (isHttps) parts.push('Secure');
  return parts.join('; ');
}

function getEnvAdmin(env: CloudflareEnv): {
  username: string;
  password: string;
  sessionSecret: string;
} | null {
  const username = env.ADMIN_USERNAME?.trim();
  const password = env.ADMIN_PASSWORD;
  if (username && password) {
    const sessionSecret =
      env.SESSION_SECRET?.trim() || `waymark_env_secret_${username}_${password}`;
    return { username, password, sessionSecret };
  }
  return null;
}

async function readKvAdmin(kv?: KVNamespaceLike): Promise<StoredAdminConfig | null> {
  if (!kv) return null;
  try {
    const raw = await kv.get(KV_ADMIN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAdminConfig;
    if (
      parsed &&
      typeof parsed.username === 'string' &&
      typeof parsed.salt === 'string' &&
      typeof parsed.passwordHash === 'string' &&
      typeof parsed.sessionSecret === 'string'
    ) {
      return parsed;
    }
  } catch {
    // Ignore KV parse errors
  }
  return null;
}

async function resolveAdminSession(
  request: Request,
  env: CloudflareEnv
): Promise<{
  initialized: boolean;
  authenticated: boolean;
  username?: string;
  envManaged: boolean;
  storageMode: 'cloudflare-kv' | 'client-local';
  secret?: string;
  storedAdmin?: StoredAdminConfig | null;
}> {
  const envAdmin = getEnvAdmin(env);
  const kvAdmin = await readKvAdmin(env.WAYMARK_KV);

  if (!envAdmin && !env.WAYMARK_KV) {
    return {
      initialized: false,
      authenticated: false,
      envManaged: false,
      storageMode: 'client-local',
    };
  }

  const initialized = Boolean(envAdmin || kvAdmin);
  const secret = envAdmin?.sessionSecret || kvAdmin?.sessionSecret;
  const expectedUsername = envAdmin?.username || kvAdmin?.username;
  const token = extractTokenFromRequest(request);

  if (initialized && secret && token) {
    const verified = await verifySessionTokenEdge(token, secret);
    if (verified && (!expectedUsername || verified.sub === expectedUsername)) {
      return {
        initialized: true,
        authenticated: true,
        username: verified.sub,
        envManaged: Boolean(envAdmin),
        storageMode: 'cloudflare-kv',
        secret,
        storedAdmin: kvAdmin,
      };
    }
  }

  return {
    initialized,
    authenticated: false,
    envManaged: Boolean(envAdmin),
    storageMode: 'cloudflare-kv',
    secret,
    storedAdmin: kvAdmin,
  };
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  const session = await resolveAdminSession(request, env);

  // If neither WAYMARK_KV nor ADMIN_USERNAME/ADMIN_PASSWORD is bound in Cloudflare Pages,
  // instruct the frontend to use its built-in client-local storage mode seamlessly.
  if (session.storageMode === 'client-local') {
    return jsonResponse({
      ok: true,
      storageMode: 'client-local',
      initialized: false,
      authenticated: false,
    });
  }

  // 1. GET /api/auth/status
  if (pathname === '/api/auth/status' && method === 'GET') {
    return jsonResponse({
      initialized: session.initialized,
      authenticated: session.authenticated,
      username: session.authenticated ? session.username : undefined,
      role: session.authenticated ? 'admin' : undefined,
      envManaged: session.envManaged,
      storageMode: 'cloudflare-kv',
    });
  }

  // 2. POST /api/auth/setup
  if (pathname === '/api/auth/setup' && method === 'POST') {
    if (session.initialized) {
      return jsonResponse({ ok: false, message: '管理员账号已初始化，请直接登录' }, 409);
    }
    if (!env.WAYMARK_KV) {
      return jsonResponse({
        ok: true,
        storageMode: 'client-local',
      });
    }
    let body: { username?: string; password?: string } = {};
    try {
      body = (await request.json()) as { username?: string; password?: string };
    } catch {
      return jsonResponse({ ok: false, message: '请求格式无效' }, 400);
    }
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    if (username.length < 2 || username.length > 32) {
      return jsonResponse({ ok: false, message: '管理员用户名需为 2-32 个字符' }, 400);
    }
    if (password.length < 6 || password.length > 128) {
      return jsonResponse({ ok: false, message: '管理员密码需为 6-128 个字符' }, 400);
    }

    const salt = randomHex(16);
    const passwordHash = await hashPasswordEdge(password, salt);
    const sessionSecret = randomHex(32);
    const now = new Date().toISOString();
    const config: StoredAdminConfig = {
      username,
      role: 'admin',
      salt,
      passwordHash,
      sessionSecret,
      createdAt: now,
      updatedAt: now,
    };
    await env.WAYMARK_KV.put(KV_ADMIN_KEY, JSON.stringify(config));
    const token = await signSessionTokenEdge(username, sessionSecret);
    return jsonResponse(
      { ok: true, username, role: 'admin', token },
      200,
      { 'Set-Cookie': buildCookieHeader(token, request, false) }
    );
  }

  // 3. POST /api/auth/login
  if (pathname === '/api/auth/login' && method === 'POST') {
    if (!session.initialized) {
      return jsonResponse({ ok: false, message: '管理员账号尚未初始化' }, 400);
    }
    let body: { username?: string; password?: string } = {};
    try {
      body = (await request.json()) as { username?: string; password?: string };
    } catch {
      return jsonResponse({ ok: false, message: '请求格式无效' }, 400);
    }
    const username = String(body.username || '').trim();
    const password = String(body.password || '');

    const envAdmin = getEnvAdmin(env);
    if (envAdmin) {
      if (username !== envAdmin.username || password !== envAdmin.password) {
        return jsonResponse({ ok: false, message: '管理员用户名或密码错误' }, 401);
      }
      const token = await signSessionTokenEdge(envAdmin.username, envAdmin.sessionSecret);
      return jsonResponse(
        { ok: true, username: envAdmin.username, role: 'admin', token },
        200,
        { 'Set-Cookie': buildCookieHeader(token, request, false) }
      );
    }

    const kvAdmin = session.storedAdmin;
    if (!kvAdmin) {
      return jsonResponse({ ok: false, message: '管理员配置读取失败' }, 500);
    }
    const candidateHash = await hashPasswordEdge(password, kvAdmin.salt);
    if (username !== kvAdmin.username || candidateHash !== kvAdmin.passwordHash) {
      return jsonResponse({ ok: false, message: '管理员用户名或密码错误' }, 401);
    }
    const token = await signSessionTokenEdge(kvAdmin.username, kvAdmin.sessionSecret);
    return jsonResponse(
      { ok: true, username: kvAdmin.username, role: 'admin', token },
      200,
      { 'Set-Cookie': buildCookieHeader(token, request, false) }
    );
  }

  // 4. POST /api/auth/logout
  if (pathname === '/api/auth/logout' && method === 'POST') {
    return jsonResponse(
      { ok: true },
      200,
      { 'Set-Cookie': buildCookieHeader('', request, true) }
    );
  }

  // 5. POST /api/auth/change-password
  if (pathname === '/api/auth/change-password' && method === 'POST') {
    if (!session.authenticated) {
      return jsonResponse({ ok: false, message: '未登录或会话已过期' }, 401);
    }
    if (session.envManaged) {
      return jsonResponse(
        { ok: false, message: '当前账号由环境变量管理，请在 Cloudflare 环境变量中修改' },
        400
      );
    }
    if (!env.WAYMARK_KV || !session.storedAdmin) {
      return jsonResponse({ ok: false, message: '未绑定 KV 存储，无法修改服务端密码' }, 400);
    }
    let body: { currentPassword?: string; newPassword?: string } = {};
    try {
      body = (await request.json()) as { currentPassword?: string; newPassword?: string };
    } catch {
      return jsonResponse({ ok: false, message: '请求格式无效' }, 400);
    }
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');
    if (newPassword.length < 6 || newPassword.length > 128) {
      return jsonResponse({ ok: false, message: '新密码需为 6-128 个字符' }, 400);
    }
    const currentHash = await hashPasswordEdge(currentPassword, session.storedAdmin.salt);
    if (currentHash !== session.storedAdmin.passwordHash) {
      return jsonResponse({ ok: false, message: '当前管理员密码错误' }, 401);
    }
    const nextSalt = randomHex(16);
    const nextHash = await hashPasswordEdge(newPassword, nextSalt);
    const nextSecret = randomHex(32);
    const updated: StoredAdminConfig = {
      ...session.storedAdmin,
      salt: nextSalt,
      passwordHash: nextHash,
      sessionSecret: nextSecret,
      updatedAt: new Date().toISOString(),
    };
    await env.WAYMARK_KV.put(KV_ADMIN_KEY, JSON.stringify(updated));
    const token = await signSessionTokenEdge(updated.username, nextSecret);
    return jsonResponse(
      { ok: true, message: '管理员密码已更新', token },
      200,
      { 'Set-Cookie': buildCookieHeader(token, request, false) }
    );
  }

  // 6. GET & PUT /api/admin/state
  if (pathname === '/api/admin/state') {
    if (!session.authenticated) {
      return jsonResponse({ ok: false, message: 'Unauthorized' }, 401);
    }
    if (!env.WAYMARK_KV) {
      return jsonResponse({ ok: true, storageMode: 'client-local', hasSavedState: false });
    }
    if (method === 'GET') {
      const raw = await env.WAYMARK_KV.get(KV_STATE_KEY);
      if (!raw) {
        return jsonResponse({ ok: true, hasSavedState: false, state: null });
      }
      try {
        const state = JSON.parse(raw) as ServerWorkspaceState;
        return jsonResponse({ ok: true, hasSavedState: true, state });
      } catch {
        return jsonResponse({ ok: true, hasSavedState: false, state: null });
      }
    }
    if (method === 'PUT') {
      let body: Partial<ServerWorkspaceState> = {};
      try {
        body = (await request.json()) as Partial<ServerWorkspaceState>;
      } catch {
        return jsonResponse({ ok: false, message: '请求格式无效' }, 400);
      }
      const nextState: ServerWorkspaceState = {
        version: 1,
        activeWorkspaceId:
          typeof body.activeWorkspaceId === 'string' ? body.activeWorkspaceId : undefined,
        viewMode: body.viewMode === 'table' ? 'table' : 'grid',
        bgTone: typeof body.bgTone === 'string' ? body.bgTone : undefined,
        bgPattern: typeof body.bgPattern === 'string' ? body.bgPattern : undefined,
        fontFamily: typeof body.fontFamily === 'string' ? body.fontFamily : undefined,
        workspaces: Array.isArray(body.workspaces) ? body.workspaces : [],
        nodes: Array.isArray(body.nodes) ? body.nodes : [],
        updatedAt: new Date().toISOString(),
      };
      await env.WAYMARK_KV.put(KV_STATE_KEY, JSON.stringify(nextState));
      return jsonResponse({ ok: true, updatedAt: nextState.updatedAt });
    }
  }

  // 7. PUT & DELETE /api/admin/public-workspaces/:id
  if (pathname.startsWith('/api/admin/public-workspaces/')) {
    if (!session.authenticated) {
      return jsonResponse({ ok: false, message: 'Unauthorized' }, 401);
    }
    if (!env.WAYMARK_KV) {
      return jsonResponse({ ok: true, storageMode: 'client-local' });
    }
    const workspaceId = decodeURIComponent(
      pathname.slice('/api/admin/public-workspaces/'.length)
    ).trim();
    const rawMap = await env.WAYMARK_KV.get(KV_PUBLIC_WORKSPACES_KEY);
    const map: Record<string, PublicWorkspaceRecord> = rawMap ? JSON.parse(rawMap) : {};

    if (method === 'DELETE') {
      delete map[workspaceId];
      await env.WAYMARK_KV.put(KV_PUBLIC_WORKSPACES_KEY, JSON.stringify(map));
      return jsonResponse({ ok: true });
    }

    if (method === 'PUT') {
      let body: Partial<PublicWorkspaceRecord> = {};
      try {
        body = (await request.json()) as Partial<PublicWorkspaceRecord>;
      } catch {
        return jsonResponse({ ok: false, message: '请求格式无效' }, 400);
      }
      const cleanedRoute =
        '/' +
        String(body.publicRoute || '')
          .trim()
          .replace(/^\/+|\/+$/g, '');
      map[workspaceId] = {
        id: workspaceId,
        name: String(body.name || '未命名空间'),
        description: String(body.description || ''),
        publicRoute: cleanedRoute === '/' ? '' : cleanedRoute,
        publicDomain: String(body.publicDomain || '').trim().toLowerCase(),
        publicProtocol: body.publicProtocol === 'http' ? 'http' : 'https',
        customFields: Array.isArray(body.customFields) ? body.customFields : [],
        updatedAt: new Date().toISOString(),
        nodes: Array.isArray(body.nodes) ? body.nodes : [],
      };
      await env.WAYMARK_KV.put(KV_PUBLIC_WORKSPACES_KEY, JSON.stringify(map));
      return jsonResponse({ ok: true });
    }
  }

  // 8. GET /api/public/workspace
  if (pathname === '/api/public/workspace' && method === 'GET') {
    if (!env.WAYMARK_KV) {
      return jsonResponse({ ok: false, storageMode: 'client-local', message: '未配置 KV' });
    }
    const rawMap = await env.WAYMARK_KV.get(KV_PUBLIC_WORKSPACES_KEY);
    const map: Record<string, PublicWorkspaceRecord> = rawMap ? JSON.parse(rawMap) : {};
    const previewId = (url.searchParams.get('previewId') || '').trim();
    const rawRoute = (url.searchParams.get('route') || '').trim();
    const normalizedRoute =
      '/' + rawRoute.replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');

    if (previewId && map[previewId]) {
      return jsonResponse({ ok: true, workspace: map[previewId] });
    }
    const reqHost = (request.headers.get('host') || '').split(':')[0].toLowerCase();
    const matched = Object.values(map).find((item) => {
      if (item.publicDomain && item.publicDomain === reqHost) {
        if (!item.publicRoute || normalizedRoute === '/' || item.publicRoute === normalizedRoute) {
          return true;
        }
      }
      return Boolean(item.publicRoute && item.publicRoute === normalizedRoute);
    });
    if (!matched) {
      return jsonResponse({ ok: false, message: '未找到公开工作空间' }, 404);
    }
    return jsonResponse({ ok: true, workspace: matched });
  }

  return jsonResponse({ ok: false, message: 'API route not found' }, 404);
}
