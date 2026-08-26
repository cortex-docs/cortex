import type { SearchDocument } from './search-index';

const STORAGE_KEY = 'cortex-recent-searches';
const MAX_RECENT = 10;

export interface RecentSearch {
  id: string;
  href?: string;
  title: string;
  breadcrumb: string;
  resultType: string;
  badge?: string;
  group: string;
  source: string;
  method?: string;
}

function toRecentSearch(doc: SearchDocument): RecentSearch {
  return {
    id: doc.id,
    href: doc.href,
    title: doc.title,
    breadcrumb: doc.breadcrumb,
    resultType: doc.resultType,
    badge: doc.badge,
    group: doc.group,
    source: doc.source,
    method: doc.method,
  };
}

export function toSearchDocument(recent: RecentSearch): SearchDocument {
  return {
    ...recent,
    description: '',
    keywords: '',
  };
}

export function getRecentSearches(): RecentSearch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentSearch[];
  } catch {
    return [];
  }
}

export function addRecentSearch(doc: SearchDocument): void {
  try {
    const existing = getRecentSearches();
    const filtered = existing.filter((r) => r.id !== doc.id);
    const updated = [toRecentSearch(doc), ...filtered].slice(0, MAX_RECENT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {}
}
