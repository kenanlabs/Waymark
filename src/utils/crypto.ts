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

export function encodeBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
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
  const encryptedBuffer = await crypto.subtle.encrypt(
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
  const decrypted = await crypto.subtle.decrypt(
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
