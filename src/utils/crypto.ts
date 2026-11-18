import type { EncryptedVaultEnvelope, PanelNode, Workspace } from '../types/panel';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback to execCommand below
    }
  }
  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function assertSubtleCryptoAvailable(): SubtleCrypto {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('当前为非 HTTPS 访问环境，浏览器禁用了 Web Crypto 加密接口，请在 HTTPS 或 localhost 下使用主密码加密。');
  }
  return crypto.subtle;
}

export function encodeBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = assertSubtleCryptoAvailable();
  const enc = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: 120000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptVaultNodes(
  nodes: PanelNode[],
  passphrase: string,
  workspaces?: Workspace[]
): Promise<EncryptedVaultEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const payload = workspaces ? { nodes, workspaces } : nodes;
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const subtle = assertSubtleCryptoAvailable();
  const encryptedBuffer = await subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    encoded
  );

  return {
    format: workspaces ? 'opsdeck-vault-v2' : 'paneldeck-vault-v1',
    encrypted: true,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encryptedBuffer)),
    updatedAt: new Date().toISOString(),
  };
}

export async function decryptVaultBundle(
  envelope: EncryptedVaultEnvelope,
  passphrase: string
): Promise<{ nodes: PanelNode[]; workspaces?: Workspace[] }> {
  if (!envelope.encrypted) {
    return {
      nodes: Array.isArray(envelope.nodes) ? envelope.nodes : [],
      workspaces: Array.isArray(envelope.workspaces) ? envelope.workspaces : undefined,
    };
  }
  if (!envelope.salt || !envelope.iv || !envelope.ciphertext) {
    throw new Error('Invalid encrypted vault format');
  }
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  const key = await deriveKey(passphrase, salt);
  const subtle = assertSubtleCryptoAvailable();
  const decrypted = await subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    ciphertext.buffer as ArrayBuffer
  );
  const json = new TextDecoder().decode(decrypted);
  const parsed = JSON.parse(json) as
    | PanelNode[]
    | { nodes?: PanelNode[]; workspaces?: Workspace[] };

  if (Array.isArray(parsed)) {
    return { nodes: parsed };
  }
  if (parsed && Array.isArray(parsed.nodes)) {
    return {
      nodes: parsed.nodes,
      workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : undefined,
    };
  }
  throw new Error('Decrypted vault payload is invalid');
}

export async function decryptVaultNodes(
  envelope: EncryptedVaultEnvelope,
  passphrase: string
): Promise<PanelNode[]> {
  const bundle = await decryptVaultBundle(envelope, passphrase);
  return bundle.nodes;
}
