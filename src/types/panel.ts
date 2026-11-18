export type PanelVersion = 'v1' | 'v2';

export type PanelType = '1panel' | 'grafana' | 'kubesphere' | 'portainer' | 'proxmox' | 'custom';

export type ProbeStatus = 'untested' | 'checking' | 'reachable' | 'auth_ok' | 'auth_failed' | 'unreachable';

export interface PanelProbeResult {
  status: ProbeStatus;
  httpStatus?: number;
  latencyMs?: number;
  message: string;
  checkedAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  panelType?: PanelType;
  groups: string[];
  isPublic?: boolean;
  publicRoute?: string;
  publicDomain?: string;
  publicProtocol?: 'http' | 'https';
  createdAt: string;
  updatedAt: string;
}

export interface PublicNodeItem {
  id: string;
  name: string;
  targetUrl: string;
  group: string;
  provider?: string;
  region?: string;
  notes?: string;
  pinned?: boolean;
}

export interface PublicWorkspaceViewData {
  id: string;
  name: string;
  description?: string;
  publicRoute: string;
  publicDomain?: string;
  publicProtocol?: 'http' | 'https';
  updatedAt: string;
  nodes: PublicNodeItem[];
}

export interface PanelNode {
  id: string;
  workspaceId?: string;
  name: string;
  baseUrl: string;
  entrance: string;
  username: string;
  password: string;
  group: string;
  provider: string;
  region: string;
  version: PanelVersion;
  autoSubmit: boolean;
  totpSecret?: string;
  notes?: string;
  pinned?: boolean;
  lastAccessedAt?: string;
  createdAt: string;
  updatedAt: string;
  probe?: PanelProbeResult;
}

export type NavSection = 'directory' | 'groups' | 'bridge' | 'security';

export type ViewMode = 'table' | 'grid';

export type SortOption = 'pinned' | 'recent' | 'name' | 'group';

export interface BridgeLaunchPayload {
  id: string;
  name: string;
  panelType?: PanelType;
  origin: string;
  targetUrl: string;
  entrance: string;
  username: string;
  password: string;
  version: PanelVersion;
  autoSubmit: boolean;
  ts: number;
}

export interface EncryptedVaultEnvelope {
  format: 'paneldeck-vault-v1' | 'opsdeck-vault-v2';
  encrypted: boolean;
  salt?: string;
  iv?: string;
  ciphertext?: string;
  nodes?: PanelNode[];
  workspaces?: Workspace[];
  updatedAt: string;
}
