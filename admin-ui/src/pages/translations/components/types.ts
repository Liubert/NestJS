// ─── Shared Types ─────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  slug: string;
  name: string;
}

export interface LocaleInfo {
  code: string;
  isDefault: boolean;
}

export interface NamespaceInfo {
  slug: string;
  avgScore: number | null;
}

export interface ProjectDetails {
  slug: string;
  name: string;
  locales: LocaleInfo[];
  namespaces: NamespaceInfo[];
}

export interface QualityInfo {
  reviewState:
    | 'not_checked'
    | 'queued'
    | 'processing'
    | 'checked'
    | 'expected'
    | 'failed'
    | 'skipped';
  score: number | null;
  level: 'green' | 'yellow' | 'red' | 'expected' | null;
  comment: string | null;
  checkedAt: string | null;
}

export interface Entry {
  key: string;
  createdAt: string;
  context: string | null;
  contextNeed: 'required' | 'useful' | 'none' | null;
  contextReason: string | null;
  values: Record<string, string>;
  quality: Record<string, QualityInfo | null>;
}

export interface PaginatedEntries {
  data: Entry[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface SandboxStatus {
  initialized: boolean;
  initializedAt: string | null;
  hasChanges: boolean;
  snapshotCount: number;
}

export interface DiffEntry {
  namespace: string;
  key: string;
  locale: string;
  status: 'added' | 'changed' | 'deleted';
  productionValue: string | null;
  sandboxValue: string | null;
  quality?: { score: number | null; level: string | null; comment: string | null };
}

export interface DiffResult {
  total: number;
  added: number;
  changed: number;
  deleted: number;
  entries: DiffEntry[];
}

export interface Snapshot {
  id: string;
  label: string | null;
  createdAt: string;
  entryCount: number;
}

export interface QualityResult {
  score: number;
  level: 'green' | 'yellow' | 'red' | 'expected';
  comment: string;
  contextNeed?: 'required' | 'useful' | 'none';
  contextReason?: string | null;
}

// Key-level diff (multiple locale diffs collapsed into one)
export interface KeyDiff {
  namespace: string;
  key: string;
  status: 'added' | 'changed' | 'deleted';
  locales: string[];
}

// Key-level diff row for the review modal — one row per key, carries all locale entries
export interface KeyDiffRow {
  id: string;
  namespace: string;
  key: string;
  status: 'added' | 'changed' | 'deleted';
  localeEntries: DiffEntry[];
  minQualityScore: number | null;
  worstQualityLevel: string | null;
}

export interface QualityBadgeProps {
  info: QualityInfo | null | undefined;
  slug?: string;
  namespace?: string;
  entryKey?: string;
  locale?: string;
  isSandbox?: boolean;
  onUpdate?: () => void;
}

export interface EditModalProps {
  open: boolean;
  entry: Entry | null;
  locales: string[];
  defaultLocale?: string;
  isNew: boolean;
  onClose: () => void;
  onSave: (
    key: string,
    values: Record<string, string>,
    context?: string,
  ) => void;
  saving: boolean;
  projectSlug?: string;
  namespace?: string;
  isSandbox?: boolean;
  onQualityUpdate?: () => void;
}

export type SettingsMenuItem =
  | { key: string; label: string; icon?: React.ReactNode; danger?: boolean }
  | { type: 'divider' };

export interface FilterBarProps {
  namespace: string;
  namespaces: NamespaceInfo[];
  onNamespaceChange: (ns: string) => void;
  searchInput: string;
  onSearchInputChange: (val: string) => void;
  onSearch: () => void;
  onAddKey?: () => void;
  disabled: boolean;
  extraControls?: React.ReactNode;
  settingsItems?: SettingsMenuItem[];
  onSettingsClick?: (key: string) => void;
  changedNamespaces?: Set<string>;
}

export interface EntriesTableProps {
  projectSlug: string;
  queryKeyPrefix: string;
  fetchFn: (
    slug: string,
    ns: string,
    page: number,
    limit: number,
    search: string,
    sortBy: string,
    sortOrder: string,
    qualityLevel?: string,
    reviewState?: string,
  ) => Promise<PaginatedEntries>;
  createFn?: (
    slug: string,
    ns: string,
    payload: { key: string; values: Record<string, string>; context?: string },
  ) => Promise<unknown>;
  updateFn?: (
    slug: string,
    ns: string,
    key: string,
    values: Record<string, string>,
    context?: string,
  ) => Promise<unknown>;
  deleteFn?: (slug: string, ns: string, key: string) => Promise<void>;
  enabled?: boolean;
  onMutationSuccess?: () => void;
  onNamespaceChange?: (ns: string) => void;
  changedNamespaces?: Set<string>;
  // Sandbox customization
  getRowProps?: (
    record: Entry,
    namespace: string,
  ) => React.HTMLAttributes<HTMLElement>;
  renderKeyExtra?: (key: string, namespace: string) => React.ReactNode;
  clientFilter?: (record: Entry, namespace: string) => boolean;
  isSandbox?: boolean;
  deleteConfirmTitle?: string;
  deleteConfirmDescription?: string;
  extraControls?: React.ReactNode;
}
