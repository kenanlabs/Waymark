export type PanelVersion = 'v1' | 'v2';

export type PanelType = '1panel' | 'grafana' | 'kubesphere' | 'portainer' | 'proxmox' | 'custom';

export type AuthMode = 'form' | 'basic';

export type ProbeStatus =
  | 'untested'
  | 'checking'
  | 'reachable'
  | 'auth_ok'
  | 'auth_failed'
  | 'blocked'
  | 'unreachable';

export interface PanelProbeResult {
  status: ProbeStatus;
  httpStatus?: number;
  latencyMs?: number;
  message: string;
  checkedAt: string;
}

export type CustomFieldKey = 'field1' | 'field2' | 'field3';

export type CustomFieldPlacement =
  | 'card_top'
  | 'card_bottom'
  | 'detail_only'
  | 'drawer_only';

export interface WorkspaceCustomFieldDef {
  key: CustomFieldKey;
  label: string;
  placement: CustomFieldPlacement;
}

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  panelType?: PanelType;
  groups: string[];
  customFields?: WorkspaceCustomFieldDef[];
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
  customValues?: Partial<Record<CustomFieldKey, string>>;
  pinned?: boolean;
}

export interface PublicWorkspaceViewData {
  id: string;
  name: string;
  description?: string;
  publicRoute: string;
  publicDomain?: string;
  publicProtocol?: 'http' | 'https';
  customFields?: WorkspaceCustomFieldDef[];
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
  customValues?: Partial<Record<CustomFieldKey, string>>;
  version: PanelVersion;
  autoSubmit: boolean;
  authMode?: AuthMode;
  totpSecret?: string;
  pinned?: boolean;
  lastAccessedAt?: string;
  createdAt: string;
  updatedAt: string;
  probe?: PanelProbeResult;
}

export type NavSection = 'directory' | 'groups' | 'bridge' | 'security';

export type ViewMode = 'table' | 'grid';

export type SortOption = 'default' | 'recent' | 'name' | 'group';

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
  authMode?: AuthMode;
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
