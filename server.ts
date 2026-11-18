import express, { type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateUserscriptSource } from './src/utils/userscript.ts';
import { getExtensionZipBuffer } from './src/utils/extension.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const ADMIN_FILE = path.join(DATA_DIR, 'admin.json');
const PUBLIC_WORKSPACES_FILE = path.join(DATA_DIR, 'public-workspaces.json');
const STATE_FILE = path.join(DATA_DIR, 'workspace-state.json');
const SESSION_COOKIE = 'paneldeck_admin_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface PublicNodeItem {
  id: string;
  name: string;
  targetUrl: string;
  group: string;
  provider?: string;
  region?: string;
  notes?: string;
  pinned?: boolean;
}

interface PublicWorkspaceRecord {
  id: string;
  name: string;
  description?: string;
  publicRoute: string;
  publicDomain?: string;
  publicProtocol?: 'http' | 'https';
  updatedAt: string;
  nodes: PublicNodeItem[];
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

interface ServerWorkspaceState {
  version: 1;
  activeWorkspaceId?: string;
  viewMode?: 'grid' | 'table';
  workspaces: Array<Record<string, unknown>>;
  nodes: Array<Record<string, unknown>>;
  updatedAt: string;
}

let inMemoryAdmin: StoredAdminConfig | null = null;
let inMemoryPublicWorkspaces: Record<string, PublicWorkspaceRecord> | null = null;
let inMemoryWorkspaceState: ServerWorkspaceState | null = null;
const envFallbackSecret = process.env.SESSION_SECRET?.trim() || crypto.randomBytes(32).toString('hex');
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

const RESERVED_PUBLIC_PREFIXES = [
  '/api',
  '/assets',
  '/src',
  '/node_modules',
  '/@vite',
  '/@react-refresh',
  '/waymark-extension.zip',
  '/waymark-bridge.user.js',
  '/opsdeck-bridge.user.js',
  '/1panel-bridge.user.js',
  '/favicon.ico',
  '/favicon.svg',
];

function normalizePublicRoute(raw: string): string {
  const cleaned = '/' + String(raw || '').trim().replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
  return cleaned === '/' ? '' : cleaned;
}

function normalizePublicDomain(raw: string): string {
  let cleaned = String(raw || '').trim();
  if (!cleaned) return '';
  if (/^https?:\/\//i.test(cleaned)) {
    try {
      cleaned = new URL(cleaned).host;
    } catch {
      cleaned = cleaned.replace(/^https?:\/\//i, '');
    }
  }
  return cleaned.split('/')[0].split('?')[0].split('#')[0].trim().toLowerCase();
}

function isValidPublicDomain(domain: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*(?::\d{1,5})?$/.test(
    domain
  );
}

function getRequestHost(req: Request): string {
  const raw = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  return raw.split(',')[0].trim().toLowerCase();
}

function hostMatchesDomain(reqHost: string, configuredDomain: string): boolean {
  if (!reqHost || !configuredDomain) return false;
  const target = configuredDomain.toLowerCase();
  if (target.includes(':')) {
    return reqHost === target;
  }
  const reqHostname = reqHost.replace(/:\d+$/, '');
  return reqHostname === target;
}

function isReservedPublicRoute(route: string): boolean {
  const lower = route.toLowerCase();
  return RESERVED_PUBLIC_PREFIXES.some(
    (prefix) => lower === prefix || lower.startsWith(`${prefix}/`)
  );
}

function readPublicWorkspaces(): Record<string, PublicWorkspaceRecord> {
  if (inMemoryPublicWorkspaces) return inMemoryPublicWorkspaces;
  try {
    if (!fs.existsSync(PUBLIC_WORKSPACES_FILE)) {
      inMemoryPublicWorkspaces = {};
      return inMemoryPublicWorkspaces;
    }
    const raw = fs.readFileSync(PUBLIC_WORKSPACES_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, PublicWorkspaceRecord>;
    if (parsed && typeof parsed === 'object') {
      inMemoryPublicWorkspaces = parsed;
      return parsed;
    }
  } catch {
    // Ignore malformed file
  }
  inMemoryPublicWorkspaces = {};
  return inMemoryPublicWorkspaces;
}

function writePublicWorkspaces(data: Record<string, PublicWorkspaceRecord>): void {
  inMemoryPublicWorkspaces = data;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(PUBLIC_WORKSPACES_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
  } catch {
    // Keep in-memory state if filesystem is read-only
  }
}

function readServerWorkspaceState(): ServerWorkspaceState | null {
  if (inMemoryWorkspaceState) return inMemoryWorkspaceState;
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ServerWorkspaceState>;
    if (parsed && Array.isArray(parsed.workspaces) && Array.isArray(parsed.nodes)) {
      const normalized: ServerWorkspaceState = {
        version: 1,
        activeWorkspaceId:
          typeof parsed.activeWorkspaceId === 'string' ? parsed.activeWorkspaceId : undefined,
        workspaces: parsed.workspaces,
        nodes: parsed.nodes,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      };
      inMemoryWorkspaceState = normalized;
      return normalized;
    }
  } catch {
    // Ignore malformed file
  }
  return null;
}

function writeServerWorkspaceState(state: ServerWorkspaceState): void {
  inMemoryWorkspaceState = state;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
  } catch {
    // Keep in-memory state if filesystem is read-only
  }
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64, { N: 16384 }).toString('hex');
}

function constantTimeMatchHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function constantTimeMatchText(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function getEnvAdmin(): { username: string; password: string; sessionSecret: string } | null {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (username && password) {
    return {
      username,
      password,
      sessionSecret: envFallbackSecret,
    };
  }
  return null;
}

function readStoredAdmin(): StoredAdminConfig | null {
  if (inMemoryAdmin) return inMemoryAdmin;
  try {
    if (!fs.existsSync(ADMIN_FILE)) return null;
    const raw = fs.readFileSync(ADMIN_FILE, 'utf8');
    const parsed = JSON.parse(raw) as StoredAdminConfig;
    if (
      parsed &&
      typeof parsed.username === 'string' &&
      parsed.role === 'admin' &&
      typeof parsed.salt === 'string' &&
      typeof parsed.passwordHash === 'string' &&
      typeof parsed.sessionSecret === 'string'
    ) {
      inMemoryAdmin = parsed;
      return parsed;
    }
  } catch {
    // Ignore malformed file
  }
  return null;
}

function writeStoredAdmin(config: StoredAdminConfig): void {
  inMemoryAdmin = config;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(ADMIN_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
  } catch {
    // Keep in-memory config if filesystem is read-only
  }
}

function getActiveSessionSecret(): string | null {
  const envAdmin = getEnvAdmin();
  if (envAdmin) return envAdmin.sessionSecret;
  return readStoredAdmin()?.sessionSecret ?? null;
}

function getActiveAdminUsername(): string | null {
  const envAdmin = getEnvAdmin();
  if (envAdmin) return envAdmin.username;
  return readStoredAdmin()?.username ?? null;
}

function createSessionToken(username: string, secret: string): string {
  const payload: SessionPayload = {
    sub: username,
    role: 'admin',
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const secret = getActiveSessionSecret();
  const activeUsername = getActiveAdminUsername();
  if (!secret || !activeUsername) return null;

  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;
  const encoded = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  if (!encoded || !sig) return null;

  const expectedSig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (
      parsed &&
      parsed.role === 'admin' &&
      parsed.sub === activeUsername &&
      typeof parsed.exp === 'number' &&
      parsed.exp > Date.now()
    ) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    result[key] = decodeURIComponent(val);
  }
  return result;
}

function extractRequestToken(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const bearer = auth.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE];
}

function isHttpsRequest(req: Request): boolean {
  const fwdProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return req.secure || fwdProto === 'https';
}

function setSessionCookie(req: Request, res: Response, token: string): void {
  const secure = isHttpsRequest(req);
  const attrs = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    secure ? 'SameSite=None; Secure' : 'SameSite=Lax',
  ];
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function clearSessionCookie(req: Request, res: Response): void {
  const secure = isHttpsRequest(req);
  const attrs = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    secure ? 'SameSite=None; Secure' : 'SameSite=Lax',
  ];
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const session = verifySessionToken(extractRequestToken(req));
  if (!session) {
    res.status(401).json({
      ok: false,
      status: 'unreachable',
      message: '未登录或管理员会话已失效，请重新登录',
    });
    return;
  }
  next();
}

function isBlockedMetadataHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    lower === '169.254.169.254' ||
    lower === 'metadata.google.internal' ||
    lower === '0.0.0.0' ||
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '::1'
  );
}

function isLikelyPrivateLanIp(hostname: string): boolean {
  return (
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Admin auth status
  app.get('/api/auth/status', (req, res) => {
    const envAdmin = getEnvAdmin();
    const stored = readStoredAdmin();
    const initialized = Boolean(envAdmin || stored);
    const session = initialized ? verifySessionToken(extractRequestToken(req)) : null;

    res.json({
      initialized,
      authenticated: Boolean(session),
      username: session?.sub,
      role: session?.role,
      envManaged: Boolean(envAdmin),
    });
  });

  // First-time Admin initialization (only allowed when no admin exists yet)
  app.post('/api/auth/setup', (req, res) => {
    const envAdmin = getEnvAdmin();
    if (envAdmin || readStoredAdmin()) {
      res.status(409).json({
        ok: false,
        message: '系统已配置管理员账户，请直接登录',
      });
      return;
    }

    const body = req.body as { username?: string; password?: string };
    const username = String(body?.username || '').trim();
    const password = String(body?.password || '');

    if (username.length < 2 || username.length > 32) {
      res.status(400).json({ ok: false, message: '管理员账号长度需为 2–32 个字符' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ ok: false, message: '管理员密码至少需要 6 个字符' });
      return;
    }

    const now = new Date().toISOString();
    const salt = crypto.randomBytes(16).toString('hex');
    const config: StoredAdminConfig = {
      username,
      role: 'admin',
      salt,
      passwordHash: hashPassword(password, salt),
      sessionSecret: crypto.randomBytes(32).toString('hex'),
      createdAt: now,
      updatedAt: now,
    };

    writeStoredAdmin(config);
    const token = createSessionToken(config.username, config.sessionSecret);
    setSessionCookie(req, res, token);

    res.json({
      ok: true,
      username: config.username,
      role: 'admin',
      token,
    });
  });

  // Admin login
  app.post('/api/auth/login', (req, res) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const record = loginAttempts.get(ip);
    if (record && record.resetAt > now && record.count >= 10) {
      res.status(429).json({
        ok: false,
        message: '尝试次数过多，请 5 分钟后再试',
      });
      return;
    }

    const body = req.body as { username?: string; password?: string };
    const username = String(body?.username || '').trim();
    const password = String(body?.password || '');

    const envAdmin = getEnvAdmin();
    const stored = readStoredAdmin();

    if (!envAdmin && !stored) {
      res.status(400).json({
        ok: false,
        message: '系统尚未初始化管理员账户',
      });
      return;
    }

    let valid = false;
    let activeUsername = '';
    let activeSecret = '';

    if (envAdmin) {
      valid =
        constantTimeMatchText(username, envAdmin.username) &&
        constantTimeMatchText(password, envAdmin.password);
      activeUsername = envAdmin.username;
      activeSecret = envAdmin.sessionSecret;
    } else if (stored) {
      const candidateHash = hashPassword(password, stored.salt);
      valid =
        constantTimeMatchText(username, stored.username) &&
        constantTimeMatchHex(candidateHash, stored.passwordHash);
      activeUsername = stored.username;
      activeSecret = stored.sessionSecret;
    }

    if (!valid) {
      const nextCount = record && record.resetAt > now ? record.count + 1 : 1;
      loginAttempts.set(ip, { count: nextCount, resetAt: now + 5 * 60 * 1000 });
      res.status(401).json({
        ok: false,
        message: '管理员账号或密码不正确',
      });
      return;
    }

    loginAttempts.delete(ip);
    const token = createSessionToken(activeUsername, activeSecret);
    setSessionCookie(req, res, token);

    res.json({
      ok: true,
      username: activeUsername,
      role: 'admin',
      token,
    });
  });

  // Admin logout
  app.post('/api/auth/logout', (req, res) => {
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  // Change admin password
  app.post('/api/auth/change-password', requireAdmin, (req, res) => {
    if (getEnvAdmin()) {
      res.status(400).json({
        ok: false,
        message: '当前管理员凭据由环境变量接管，请通过环境变量修改',
      });
      return;
    }

    const stored = readStoredAdmin();
    if (!stored) {
      res.status(400).json({ ok: false, message: '未找到管理员配置' });
      return;
    }

    const body = req.body as { currentPassword?: string; newPassword?: string };
    const currentPassword = String(body?.currentPassword || '');
    const newPassword = String(body?.newPassword || '');

    if (newPassword.length < 6) {
      res.status(400).json({ ok: false, message: '新密码至少需要 6 个字符' });
      return;
    }

    const currentHash = hashPassword(currentPassword, stored.salt);
    if (!constantTimeMatchHex(currentHash, stored.passwordHash)) {
      res.status(401).json({ ok: false, message: '当前密码验证失败' });
      return;
    }

    const nextSalt = crypto.randomBytes(16).toString('hex');
    const nextConfig: StoredAdminConfig = {
      ...stored,
      salt: nextSalt,
      passwordHash: hashPassword(newPassword, nextSalt),
      sessionSecret: crypto.randomBytes(32).toString('hex'),
      updatedAt: new Date().toISOString(),
    };

    writeStoredAdmin(nextConfig);
    const token = createSessionToken(nextConfig.username, nextConfig.sessionSecret);
    setSessionCookie(req, res, token);

    res.json({
      ok: true,
      token,
      message: '管理员密码已更新',
    });
  });

  // Public Workspace read endpoint (NO auth required, strictly zero credentials/sensitive fields)
  app.get('/api/public/workspace', (req, res) => {
    const previewId = String(req.query.previewId || '').trim();
    const routeParam = normalizePublicRoute(String(req.query.route || ''));
    const effectiveRoute = routeParam || '/';
    const reqHost = getRequestHost(req);
    const all = readPublicWorkspaces();
    const list = Object.values(all);

    let match = previewId ? all[previewId] : undefined;

    if (!match) {
      match = list.find(
        (ws) =>
          ws.publicDomain &&
          hostMatchesDomain(reqHost, ws.publicDomain) &&
          (ws.publicRoute || '/').toLowerCase() === effectiveRoute.toLowerCase()
      );
    }

    if (!match && effectiveRoute === '/') {
      match = list.find((ws) => ws.publicDomain && hostMatchesDomain(reqHost, ws.publicDomain));
    }

    if (!match && routeParam) {
      match =
        list.find(
          (ws) =>
            !ws.publicDomain &&
            ws.publicRoute &&
            ws.publicRoute.toLowerCase() === routeParam.toLowerCase()
        ) ??
        list.find(
          (ws) => ws.publicRoute && ws.publicRoute.toLowerCase() === routeParam.toLowerCase()
        );
    }

    if (!match) {
      res.status(404).json({ ok: false, message: '未找到对应的公开工作空间' });
      return;
    }
    res.json({
      ok: true,
      workspace: {
        id: match.id,
        name: match.name,
        description: match.description || '',
        publicRoute: match.publicRoute || '',
        publicDomain: match.publicDomain || '',
        publicProtocol: match.publicProtocol || 'https',
        updatedAt: match.updatedAt,
        nodes: match.nodes.map((n) => ({
          id: n.id,
          name: n.name,
          targetUrl: n.targetUrl,
          group: n.group,
          provider: n.provider || '',
          region: n.region || '',
          notes: n.notes || '',
          pinned: Boolean(n.pinned),
        })),
      },
    });
  });

  // Admin: publish or update sanitized public workspace snapshot
  app.put('/api/admin/public-workspaces/:id', requireAdmin, (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!id) {
      res.status(400).json({ ok: false, message: '缺少工作空间 ID' });
      return;
    }

    const body = req.body as {
      name?: string;
      description?: string;
      publicRoute?: string;
      publicDomain?: string;
      publicProtocol?: string;
      nodes?: Array<Record<string, unknown>>;
    };

    const name = String(body?.name || '').trim();
    const publicRoute = normalizePublicRoute(String(body?.publicRoute || ''));
    const publicDomain = normalizePublicDomain(String(body?.publicDomain || ''));
    const publicProtocol: 'http' | 'https' = body?.publicProtocol === 'http' ? 'http' : 'https';

    if (!name) {
      res.status(400).json({ ok: false, message: '工作空间标题不能为空' });
      return;
    }
    if (publicDomain && !isValidPublicDomain(publicDomain)) {
      res.status(400).json({ ok: false, message: '公开访问域名格式无效，请填写如 nav.example.com' });
      return;
    }
    if (!publicDomain && !publicRoute) {
      res.status(400).json({ ok: false, message: '请至少配置公开访问路由或公开访问域名' });
      return;
    }
    if (publicRoute && !/^\/[a-zA-Z0-9/_-]+$/.test(publicRoute)) {
      res.status(400).json({ ok: false, message: '公开路由格式无效，请使用如 /team 的路径' });
      return;
    }
    if (publicRoute && isReservedPublicRoute(publicRoute)) {
      res.status(400).json({ ok: false, message: `公开路由不能使用系统保留路径 ${publicRoute}` });
      return;
    }

    const all = { ...readPublicWorkspaces() };
    const myRoute = (publicRoute || (publicDomain ? '/' : '')).toLowerCase();
    const collision = Object.values(all).find((ws) => {
      if (ws.id === id) return false;
      const otherDomain = normalizePublicDomain(ws.publicDomain || '');
      const otherRoute = (ws.publicRoute || (otherDomain ? '/' : '')).toLowerCase();
      if (publicDomain && otherDomain && publicDomain === otherDomain && myRoute === otherRoute) {
        return true;
      }
      if (!publicDomain && !otherDomain && myRoute && otherRoute === myRoute) {
        return true;
      }
      return false;
    });
    if (collision) {
      res.status(409).json({
        ok: false,
        message: publicDomain
          ? `域名 ${publicDomain} 下的路径 ${myRoute} 已被工作空间「${collision.name}」占用`
          : `路由 ${publicRoute} 已被工作空间「${collision.name}」占用`,
      });
      return;
    }

    // Strict whitelist sanitization: NEVER store usernames, passwords, secrets, or autoSubmit flags
    const rawNodes = Array.isArray(body?.nodes) ? body.nodes : [];
    const sanitizedNodes: PublicNodeItem[] = rawNodes
      .map((item): PublicNodeItem | null => {
        const targetUrl = String(item?.targetUrl || '').trim();
        const nodeName = String(item?.name || '').trim();
        if (!nodeName || !targetUrl) return null;
        return {
          id: String(item?.id || crypto.randomUUID()),
          name: nodeName,
          targetUrl,
          group: String(item?.group || '默认分组').trim() || '默认分组',
          provider: String(item?.provider || '').trim() || undefined,
          region: String(item?.region || '').trim() || undefined,
          notes: String(item?.notes || '').trim() || undefined,
          pinned: Boolean(item?.pinned),
        };
      })
      .filter((n): n is PublicNodeItem => n !== null);

    const record: PublicWorkspaceRecord = {
      id,
      name,
      description: String(body?.description || '').trim() || undefined,
      publicRoute,
      publicDomain: publicDomain || undefined,
      publicProtocol: publicDomain ? publicProtocol : undefined,
      updatedAt: new Date().toISOString(),
      nodes: sanitizedNodes,
    };

    all[id] = record;
    writePublicWorkspaces(all);
    res.json({ ok: true, workspace: record });
  });

  // Admin: unpublish / remove public workspace
  app.delete('/api/admin/public-workspaces/:id', requireAdmin, (req, res) => {
    const id = String(req.params.id || '').trim();
    if (id) {
      const all = { ...readPublicWorkspaces() };
      if (all[id]) {
        delete all[id];
        writePublicWorkspaces(all);
      }
    }
    res.json({ ok: true });
  });

  // Admin: read persisted workspaces & nodes (cross-domain / cross-device sync)
  app.get('/api/admin/state', requireAdmin, (_req, res) => {
    const state = readServerWorkspaceState();
    res.json({
      ok: true,
      hasSavedState: Boolean(state),
      state,
    });
  });

  // Admin: persist full workspaces & nodes snapshot
  app.put('/api/admin/state', requireAdmin, (req, res) => {
    const body = req.body as {
      activeWorkspaceId?: string;
      viewMode?: string;
      workspaces?: unknown;
      nodes?: unknown;
    };

    if (!Array.isArray(body?.workspaces) || body.workspaces.length === 0) {
      res.status(400).json({ ok: false, message: '工作空间列表不能为空' });
      return;
    }
    if (!Array.isArray(body?.nodes)) {
      res.status(400).json({ ok: false, message: '站点列表格式无效' });
      return;
    }

    const updatedAt = new Date().toISOString();
    const viewMode =
      body.viewMode === 'table' || body.viewMode === 'grid' ? body.viewMode : undefined;
    const nextState: ServerWorkspaceState = {
      version: 1,
      activeWorkspaceId:
        typeof body.activeWorkspaceId === 'string' && body.activeWorkspaceId.trim()
          ? body.activeWorkspaceId.trim()
          : undefined,
      viewMode,
      workspaces: body.workspaces as Array<Record<string, unknown>>,
      nodes: body.nodes as Array<Record<string, unknown>>,
      updatedAt,
    };

    writeServerWorkspaceState(nextState);
    res.json({ ok: true, updatedAt });
  });

  // Serve Chrome / Edge Manifest V3 extension archive
  app.get('/waymark-extension.zip', (_req, res) => {
    const zipBuffer = getExtensionZipBuffer();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="waymark-extension.zip"');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Length', String(zipBuffer.length));
    res.send(zipBuffer);
  });

  // Serve Tampermonkey / Violentmonkey Userscript directly so browsers trigger 1-click install
  const serveUserscript = (req: Request, res: Response) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    const origin = host ? `${protocol}://${host}` : undefined;
    const script = generateUserscriptSource(origin);
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(script);
  };
  app.get('/waymark-bridge.user.js', serveUserscript);
  app.get('/opsdeck-bridge.user.js', serveUserscript);
  app.get('/1panel-bridge.user.js', serveUserscript);

  // Live panel connectivity & credential verification endpoint (Admin-only)
  app.post('/api/probe', requireAdmin, async (req, res) => {
    const body = req.body as {
      baseUrl?: string;
      entrance?: string;
      username?: string;
      password?: string;
      version?: string;
      panelType?: string;
      verifyAuth?: boolean;
    };

    const rawUrl = String(body?.baseUrl || '').trim();
    if (!rawUrl) {
      res.status(400).json({ status: 'unreachable', message: '缺少访问地址' });
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `http://${rawUrl}`);
    } catch {
      res.status(400).json({ status: 'unreachable', message: '访问地址格式无效' });
      return;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      res.status(400).json({ status: 'unreachable', message: '仅支持 HTTP 或 HTTPS 协议' });
      return;
    }

    if (isBlockedMetadataHost(parsed.hostname)) {
      res.status(400).json({
        status: 'unreachable',
        message: '本地回环或保留地址无法从云端探测，请直接在浏览器点击跳转',
      });
      return;
    }

    if (isLikelyPrivateLanIp(parsed.hostname)) {
      res.json({
        status: 'unreachable',
        message: '检测到内网私有 IP，云端无法直连，请使用本地浏览器直连跳转',
        checkedAt: new Date().toISOString(),
      });
      return;
    }

    const entranceRaw = String(body?.entrance || '').trim().replace(/^\/+|\/+$/g, '');
    const entrancePath = entranceRaw ? `/${entranceRaw}` : '';
    const entranceBase64 = entranceRaw ? Buffer.from(entranceRaw, 'utf8').toString('base64') : '';
    const startedAt = Date.now();

    try {
      // Step 1: Test panel entrance page HTTP reachability
      const targetUrl = `${parsed.origin}${entrancePath}`;
      const pageResp = await fetch(targetUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(6000),
      });
      const latencyMs = Date.now() - startedAt;

      if (pageResp.status === 404) {
        res.json({
          status: 'unreachable',
          httpStatus: 404,
          latencyMs,
          message: '返回 404，请核对安全入口路径是否正确',
          checkedAt: new Date().toISOString(),
        });
        return;
      }

      // Step 2: Optional panel-specific API login check if credentials & verifyAuth provided
      const panelType = String(body.panelType || '1panel').toLowerCase();

      if (body.verifyAuth && body.username && body.password) {
        if (panelType === '1panel') {
          const apiPath = body.version === 'v1' ? '/api/v1/auth/login' : '/api/v2/auth/login';
          const fallbackApiPath = body.version === 'v1' ? '/api/v2/auth/login' : '/api/v1/auth/login';

          const attemptLogin = async (endpoint: string) => {
            const headers: Record<string, string> = {
              'Content-Type': 'application/json',
            };
            if (entranceBase64) {
              headers['EntranceCode'] = entranceBase64;
            }
            return fetch(`${parsed.origin}${endpoint}`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                name: body.username,
                password: body.password,
                ignoreCaptcha: true,
                captcha: '',
                captchaID: '',
                authMethod: 'jwt',
                language: 'zh',
              }),
              signal: AbortSignal.timeout(6000),
            });
          };

          let authResp = await attemptLogin(apiPath);
          if (authResp.status === 404) {
            authResp = await attemptLogin(fallbackApiPath);
          }

          const authLatency = Date.now() - startedAt;
          if (authResp.ok) {
            const data = (await authResp.json().catch(() => ({}))) as { code?: number; message?: string };
            if (data.code === 200 || data.code === undefined) {
              res.json({
                status: 'auth_ok',
                httpStatus: authResp.status,
                latencyMs: authLatency,
                message: `目标连通且凭据校验通过 (${authLatency} ms)`,
                checkedAt: new Date().toISOString(),
              });
              return;
            }
            res.json({
              status: 'auth_failed',
              httpStatus: authResp.status,
              latencyMs: authLatency,
              message: data.message || '账号密码校验未通过或需验证码/MFA',
              checkedAt: new Date().toISOString(),
            });
            return;
          }

          res.json({
            status: 'auth_failed',
            httpStatus: authResp.status,
            latencyMs: authLatency,
            message: `端口可达，但接口校验返回 HTTP ${authResp.status}`,
            checkedAt: new Date().toISOString(),
          });
          return;
        }

        if (panelType === 'grafana') {
          const prefix = entrancePath === '/login' ? '' : entrancePath;
          const basicToken = Buffer.from(`${body.username}:${body.password}`, 'utf8').toString('base64');
          const authResp = await fetch(`${parsed.origin}${prefix}/api/org`, {
            method: 'GET',
            headers: {
              Authorization: `Basic ${basicToken}`,
              Accept: 'application/json',
            },
            signal: AbortSignal.timeout(6000),
          });
          const authLatency = Date.now() - startedAt;
          if (authResp.ok) {
            res.json({
              status: 'auth_ok',
              httpStatus: authResp.status,
              latencyMs: authLatency,
              message: `Grafana 连通且凭据有效 (${authLatency} ms)`,
              checkedAt: new Date().toISOString(),
            });
            return;
          }
          if (authResp.status === 401 || authResp.status === 403) {
            res.json({
              status: 'auth_failed',
              httpStatus: authResp.status,
              latencyMs: authLatency,
              message: `Grafana 可达，但账号或密码未通过校验 (HTTP ${authResp.status})`,
              checkedAt: new Date().toISOString(),
            });
            return;
          }
        }

        if (panelType === 'portainer') {
          const prefix = entrancePath === '/login' ? '' : entrancePath;
          const authResp = await fetch(`${parsed.origin}${prefix}/api/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: body.username, password: body.password }),
            signal: AbortSignal.timeout(6000),
          });
          const authLatency = Date.now() - startedAt;
          if (authResp.ok) {
            res.json({
              status: 'auth_ok',
              httpStatus: authResp.status,
              latencyMs: authLatency,
              message: `Portainer 连通且凭据校验通过 (${authLatency} ms)`,
              checkedAt: new Date().toISOString(),
            });
            return;
          }
          if (authResp.status === 422 || authResp.status === 401) {
            res.json({
              status: 'auth_failed',
              httpStatus: authResp.status,
              latencyMs: authLatency,
              message: `Portainer 可达，但凭据校验失败 (HTTP ${authResp.status})`,
              checkedAt: new Date().toISOString(),
            });
            return;
          }
        }

        if (panelType === 'kubesphere') {
          const authResp = await fetch(`${parsed.origin}/kapis/iam.kubesphere.io/v1alpha2/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: body.username, password: body.password }),
            signal: AbortSignal.timeout(6000),
          });
          const authLatency = Date.now() - startedAt;
          if (authResp.ok) {
            res.json({
              status: 'auth_ok',
              httpStatus: authResp.status,
              latencyMs: authLatency,
              message: `KubeSphere 连通且凭据有效 (${authLatency} ms)`,
              checkedAt: new Date().toISOString(),
            });
            return;
          }
          if (authResp.status === 401 || authResp.status === 400) {
            res.json({
              status: 'auth_failed',
              httpStatus: authResp.status,
              latencyMs: authLatency,
              message: `KubeSphere 可达，但账号或密码未通过校验 (HTTP ${authResp.status})`,
              checkedAt: new Date().toISOString(),
            });
            return;
          }
        }
      }

      res.json({
        status: 'reachable',
        httpStatus: pageResp.status,
        latencyMs,
        message: `入口可达 · HTTP ${pageResp.status} (${latencyMs} ms)`,
        checkedAt: new Date().toISOString(),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '连接超时或被拒绝';
      res.json({
        status: 'unreachable',
        latencyMs: Date.now() - startedAt,
        message: msg.includes('abort') || msg.includes('timeout') ? '连接超时 (6s)' : `不可达: ${msg}`,
        checkedAt: new Date().toISOString(),
      });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Not built');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Waymark server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
