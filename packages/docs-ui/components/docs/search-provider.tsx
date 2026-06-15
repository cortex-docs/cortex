'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type MiniSearch from 'minisearch';
import {
  type SearchDocument,
  createSearchIndex,
  buildSearchDocuments,
} from '@/lib/search-index';
import { useProjectWatch } from '@/lib/use-project-watch';

interface SearchIndexContextValue {
  allDocuments: SearchDocument[];
  indexRef: React.RefObject<MiniSearch | null>;
  isReady: boolean;
}

const SearchIndexContext = createContext<SearchIndexContextValue>({
  allDocuments: [],
  indexRef: { current: null },
  isReady: false,
});

export function useSearchIndex() {
  return useContext(SearchIndexContext);
}

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [allDocuments, setAllDocuments] = useState<SearchDocument[]>([]);
  const [isReady, setIsReady] = useState(false);
  const indexRef = useRef<MiniSearch | null>(null);

  const loadIndex = useCallback(() => {
    Promise.all([
      fetch('/api/sdk-snippets').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/docs').then((r) => (r.ok ? r.json() : null)),
    ]).then(([sdkData, docsData]) => {
      const docs = buildSearchDocuments(sdkData, null, docsData);
      setAllDocuments(docs);
      indexRef.current = createSearchIndex(docs);
      setIsReady(true);
      if (typeof window !== 'undefined') {
        (window as any).__searchIndexReady = true;
        (window as any).__searchDocCount = docs.length;
      }
    });
  }, []);

  useEffect(() => {
    loadIndex();
  }, [loadIndex]);

  useProjectWatch(loadIndex);

  return (
    <SearchIndexContext.Provider value={{ allDocuments, indexRef, isReady }}>
      {children}
    </SearchIndexContext.Provider>
  );
}
