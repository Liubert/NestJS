import apiClient from '../../../api/client';
import type {
  Project,
  ProjectDetails,
  PaginatedEntries,
  QualityResult,
  QualityInfo,
  SandboxStatus,
  DiffResult,
  Snapshot,
} from './types';

// ─── API Functions ────────────────────────────────────────────────────────────

export const fetchProjects = async (): Promise<Project[]> => {
  const res = await apiClient.get('/translations/projects?limit=200');
  return res.data.data;
};

export const fetchProjectDetails = async (
  slug: string,
): Promise<ProjectDetails> => {
  const res = await apiClient.get(`/translations/projects/${slug}`);
  return res.data;
};

export const fetchEntries = async (
  slug: string,
  ns: string,
  page: number,
  limit: number,
  search: string,
  sortBy: string,
  sortOrder: string,
  qualityLevel?: string,
  reviewState?: string,
): Promise<PaginatedEntries> => {
  const params: Record<string, string | number> = {
    page,
    limit,
    sortBy,
    sortOrder,
  };
  if (search.length >= 2) params.search = search;
  if (qualityLevel) params.qualityLevel = qualityLevel;
  if (reviewState) params.reviewState = reviewState;
  const res = await apiClient.get(
    `/translations/projects/${slug}/namespaces/${ns}/entries`,
    { params },
  );
  return res.data;
};

export const createEntry = async (
  slug: string,
  ns: string,
  payload: { key: string; values: Record<string, string>; context?: string },
) => {
  const res = await apiClient.post(
    `/translations/projects/${slug}/namespaces/${ns}/entries`,
    payload,
  );
  return res.data;
};

export const updateEntry = async (
  slug: string,
  ns: string,
  key: string,
  values: Record<string, string>,
  context?: string,
) => {
  const res = await apiClient.patch(
    `/translations/projects/${slug}/namespaces/${ns}/entries/${encodeURIComponent(key)}`,
    { values, ...(context !== undefined ? { context } : {}) },
  );
  return res.data;
};

export const deleteEntry = async (
  slug: string,
  ns: string,
  key: string,
): Promise<void> => {
  await apiClient.delete(
    `/translations/projects/${slug}/namespaces/${ns}/entries/${encodeURIComponent(key)}`,
  );
};

export const aiTranslate = async (
  text: string,
  projectSlug?: string,
  context?: string,
  targetLocales?: string[],
): Promise<Record<string, string>> => {
  const body: Record<string, unknown> = { text, projectSlug };
  if (context?.trim()) body.context = context.trim();
  if (targetLocales?.length) body.targetLocales = targetLocales;
  const res = await apiClient.post('/translations/ai-translate', body);
  return res.data;
};

export const checkQuality = async (
  source: string,
  translation: string,
  locale: string,
  mode: 'translation_quality' | 'language_quality' = 'translation_quality',
  projectSlug?: string,
): Promise<QualityResult> => {
  const res = await apiClient.post('/translations/ai-quality-check', {
    source,
    translation,
    locale,
    mode,
    projectSlug,
  });
  return res.data;
};

export const fetchSandboxStatus = async (
  slug: string,
): Promise<SandboxStatus> => {
  const res = await apiClient.get(
    `/translations/projects/${slug}/sandbox/status`,
  );
  return res.data;
};

export const fetchSandboxDiff = async (slug: string): Promise<DiffResult> => {
  const res = await apiClient.get(
    `/translations/projects/${slug}/sandbox/diff`,
  );
  return res.data;
};

export const fetchSnapshots = async (slug: string): Promise<Snapshot[]> => {
  const res = await apiClient.get(
    `/translations/projects/${slug}/sandbox/snapshots`,
  );
  return res.data;
};

export const fetchSandboxEntries = async (
  slug: string,
  ns: string,
  page: number,
  limit: number,
  search: string,
  sortBy: string,
  sortOrder: string,
  qualityLevel?: string,
  reviewState?: string,
): Promise<PaginatedEntries> => {
  const params: Record<string, string | number> = {
    page,
    limit,
    sortBy,
    sortOrder,
  };
  if (search.length >= 2) params.search = search;
  if (qualityLevel) params.qualityLevel = qualityLevel;
  if (reviewState) params.reviewState = reviewState;
  const res = await apiClient.get(
    `/translations/projects/${slug}/sandbox/namespaces/${ns}/entries`,
    { params },
  );
  return res.data;
};

export const createSandboxEntry = async (
  slug: string,
  ns: string,
  payload: { key: string; values: Record<string, string>; context?: string },
) => {
  const res = await apiClient.post(
    `/translations/projects/${slug}/sandbox/namespaces/${ns}/entries`,
    payload,
  );
  return res.data;
};

export const updateSandboxEntry = async (
  slug: string,
  ns: string,
  key: string,
  values: Record<string, string>,
  context?: string,
) => {
  const res = await apiClient.patch(
    `/translations/projects/${slug}/sandbox/namespaces/${ns}/entries/${encodeURIComponent(key)}`,
    { values, ...(context !== undefined ? { context } : {}) },
  );
  return res.data;
};

export const deleteSandboxEntry = async (
  slug: string,
  ns: string,
  key: string,
): Promise<void> => {
  await apiClient.delete(
    `/translations/projects/${slug}/sandbox/namespaces/${ns}/entries/${encodeURIComponent(key)}`,
  );
};

export const revertSandboxKey = async (
  slug: string,
  ns: string,
  key: string,
): Promise<void> => {
  await apiClient.post(
    `/translations/projects/${slug}/sandbox/namespaces/${ns}/entries/${encodeURIComponent(key)}/revert`,
  );
};

export const markExpected = async (
  slug: string,
  ns: string,
  key: string,
  locale: string,
): Promise<QualityInfo> => {
  const res = await apiClient.post<QualityInfo>(
    `/translations/projects/${slug}/namespaces/${ns}/entries/${encodeURIComponent(key)}/locales/${locale}/mark-expected`,
  );
  return res.data;
};

export const unmarkExpected = async (
  slug: string,
  ns: string,
  key: string,
  locale: string,
): Promise<void> => {
  await apiClient.delete(
    `/translations/projects/${slug}/namespaces/${ns}/entries/${encodeURIComponent(key)}/locales/${locale}/mark-expected`,
  );
};

export const markSandboxExpected = async (
  slug: string,
  ns: string,
  key: string,
  locale: string,
): Promise<QualityInfo> => {
  const res = await apiClient.post<QualityInfo>(
    `/translations/projects/${slug}/sandbox/namespaces/${ns}/entries/${encodeURIComponent(key)}/locales/${locale}/mark-expected`,
  );
  return res.data;
};

export const unmarkSandboxExpected = async (
  slug: string,
  ns: string,
  key: string,
  locale: string,
): Promise<void> => {
  await apiClient.delete(
    `/translations/projects/${slug}/sandbox/namespaces/${ns}/entries/${encodeURIComponent(key)}/locales/${locale}/mark-expected`,
  );
};

export const promoteSelective = async (
  slug: string,
  keys: { namespace: string; key: string }[],
): Promise<{ snapshotId: string; promoted: number }> => {
  const res = await apiClient.post(
    `/translations/projects/${slug}/sandbox/promote-selective`,
    { keys },
  );
  return res.data;
};
