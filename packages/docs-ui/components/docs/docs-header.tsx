'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useProjectWatch } from '@/lib/use-project-watch';
import { type SearchDocument, searchIndex } from '@/lib/search-index';
import { useSearchIndex } from './search-provider';
import { getRecentSearches, addRecentSearch, toSearchDocument } from '@/lib/recent-searches';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from '@/components/ui/command';
import { SearchIcon, ArrowLeftIcon, ChevronDownIcon, XIcon } from 'lucide-react';
import { useSiteConfig } from './site-config-provider';

function FilterDropdown({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: string | null;
  options: string[];
  onSelect: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (options.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors',
          value
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/50',
        )}
      >
        {value ? (
          <>
            <span>{value}</span>
            <XIcon
              className="size-3 opacity-60 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(null);
              }}
            />
          </>
        ) : (
          <>
            <span>{label}</span>
            <ChevronDownIcon className="size-3 opacity-50" />
          </>
        )}
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-44 rounded-lg border border-border/60 bg-popover p-1 shadow-lg">
          {value && (
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                setOpen(false);
              }}
              className="flex w-full items-center rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            >
              All {label}s
            </button>
          )}
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onSelect(opt);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center rounded-md px-2.5 py-1.5 text-xs hover:bg-muted',
                value === opt && 'bg-muted font-medium',
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DocsHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const ssrConfig = useSiteConfig();
  const [liveConfig, setLiveConfig] = useState<Partial<typeof ssrConfig>>({});

  const {
    title: siteTitle,
    project,
    hasLogo: hasCustomLogo,
    logoSvg,
    logoDarkSvg,
    logoLightSvg,
    logoHeight,
    showLogoDocsLabel,
    hasSources,
    hasDocs,
    hasMcp,
  } = useMemo(
    () => ({
      ...ssrConfig,
      ...liveConfig,
    }),
    [ssrConfig, liveConfig],
  );

  const fetchConfig = useCallback(() => {
    fetch(`/api/config?t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setLiveConfig({
          hasLogo: data.hasLogo ?? ssrConfig.hasLogo,
          logoSvg: data.logoSvg ?? ssrConfig.logoSvg,
          logoDarkSvg: data.logoDarkSvg ?? ssrConfig.logoDarkSvg,
          logoLightSvg: data.logoLightSvg ?? ssrConfig.logoLightSvg,
          logoHeight: data.logoHeight ?? ssrConfig.logoHeight,
          showLogoDocsLabel: data.showLogoDocsLabel ?? ssrConfig.showLogoDocsLabel,
          hasSources: data.hasSources ?? ssrConfig.hasSources,
          hasDocs: data.hasDocs ?? ssrConfig.hasDocs,
          hasMcp: data.hasMcp ?? ssrConfig.hasMcp,
        });
      })
      .catch(() => {});
  }, [ssrConfig]);

  const { allDocuments, indexRef } = useSearchIndex();

  const [mounted, setMounted] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentItems, setRecentItems] = useState<SearchDocument[]>([]);

  useProjectWatch(fetchConfig);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [methodFilter, setMethodFilter] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);

  useEffect(() => {
    if (searchOpen) {
      setRecentItems(getRecentSearches().map(toSearchDocument));
    } else {
      setSearchQuery('');
      setTypeFilter(null);
      setMethodFilter(null);
      setSourceFilter(null);
    }
  }, [searchOpen]);

  const filterOptions = useMemo(() => {
    const types = new Set<string>();
    const methods = new Set<string>();
    const sources = new Set<string>();
    for (const doc of allDocuments) {
      if (doc.resultType) types.add(doc.resultType);
      if (doc.method) methods.add(doc.method);
      if (doc.source) sources.add(doc.source);
    }
    return {
      types: Array.from(types).sort(),
      methods: Array.from(methods).sort(),
      sources: Array.from(sources).sort(),
    };
  }, [allDocuments]);

  const isShowingRecent = !searchQuery.trim() && !typeFilter && !methodFilter && !sourceFilter;

  const displayItems = useMemo(() => {
    let items: SearchDocument[];
    if (!searchQuery.trim() && !typeFilter && !methodFilter && !sourceFilter) {
      return recentItems;
    } else if (!searchQuery.trim()) {
      items = allDocuments;
    } else if (!indexRef.current) {
      items = [];
    } else {
      const start = performance.now();
      items = searchIndex(indexRef.current, searchQuery);
      if (typeof window !== 'undefined') {
        (window as any).__lastSearchDuration = performance.now() - start;
      }
    }
    if (typeFilter) items = items.filter((i) => i.resultType === typeFilter);
    if (methodFilter) items = items.filter((i) => i.method === methodFilter);
    if (sourceFilter) items = items.filter((i) => i.source === sourceFilter);
    return items;
  }, [searchQuery, allDocuments, recentItems, typeFilter, methodFilter, sourceFilter]);

  const handleSelect = useCallback(
    (id: string) => {
      const selectedDoc = displayItems.find((d) => d.id === id);
      if (selectedDoc) addRecentSearch(selectedDoc);
      setSearchOpen(false);

      if (id.startsWith('docs-')) {
        const slug = id.replace('docs-', '');
        router.push(`/docs/${slug}`);
        return;
      }

      if (id.startsWith('mcp-')) {
        const toolName = id.replace('mcp-', '');
        router.push(`/mcp/${toolName}`);
        return;
      }

      let opSlug = '';
      let sourcePrefix = '';
      if (id.startsWith('rest-')) {
        opSlug = id.replace('rest-', '');
        sourcePrefix = 'rest';
      } else if (id.startsWith('gql-q-')) {
        opSlug = id.replace('gql-q-', '');
        sourcePrefix = 'graphql';
      } else if (id.startsWith('gql-m-')) {
        opSlug = id.replace('gql-m-', '');
        sourcePrefix = 'graphql';
      } else if (id.startsWith('gql-s-')) {
        opSlug = id.replace('gql-s-', '');
        sourcePrefix = 'graphql';
      } else if (id.startsWith('ws-')) {
        opSlug = id.replace('ws-', '');
        sourcePrefix = 'websocket';
      } else if (id.startsWith('openrpc-')) {
        opSlug = id.replace('openrpc-', '');
        sourcePrefix = 'openrpc';
      }

      const sourceSlugs: Record<string, string> = {};
      for (const doc of allDocuments) {
        if (doc.source === 'REST' && !sourceSlugs['rest'])
          sourceSlugs['rest'] =
            doc.breadcrumb
              .split(' › ')[1]
              ?.toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '') || 'rest';
        if (doc.source === 'GraphQL' && !sourceSlugs['graphql']) sourceSlugs['graphql'] = 'graphql';
        if (doc.source === 'WebSocket' && !sourceSlugs['websocket'])
          sourceSlugs['websocket'] = 'websocket';
        if (doc.source === 'OpenRPC' && !sourceSlugs['openrpc']) sourceSlugs['openrpc'] = 'openrpc';
      }

      const sSlug = sourceSlugs[sourcePrefix] || sourcePrefix;
      router.push(`/api-reference/${sSlug}/${opSlug}`);
    },
    [pathname, router, allDocuments, displayItems],
  );

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl backdrop-saturate-150">
        <div className="flex h-14 items-center px-6">
          {/* Left: logo */}
          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center gap-3">
              {hasCustomLogo && (logoDarkSvg || logoLightSvg) ? (
                <>
                  {logoDarkSvg && (
                    <span
                      className="hidden dark:inline-flex w-auto text-foreground [&>svg]:h-full [&>svg]:w-auto [&>svg]:overflow-visible"
                      style={{ height: logoHeight ?? 24 }}
                      dangerouslySetInnerHTML={{ __html: logoDarkSvg }}
                    />
                  )}
                  {logoLightSvg && (
                    <span
                      className="inline-flex dark:hidden w-auto text-foreground [&>svg]:h-full [&>svg]:w-auto [&>svg]:overflow-visible"
                      style={{ height: logoHeight ?? 24 }}
                      dangerouslySetInnerHTML={{ __html: logoLightSvg }}
                    />
                  )}
                  {!logoLightSvg && logoDarkSvg && (
                    <span
                      className="inline-flex dark:hidden w-auto text-foreground [&>svg]:h-full [&>svg]:w-auto [&>svg]:overflow-visible"
                      style={{ height: logoHeight ?? 24 }}
                      dangerouslySetInnerHTML={{ __html: logoDarkSvg }}
                    />
                  )}
                  {!logoDarkSvg && logoLightSvg && (
                    <span
                      className="hidden dark:inline-flex w-auto text-foreground [&>svg]:h-full [&>svg]:w-auto [&>svg]:overflow-visible"
                      style={{ height: logoHeight ?? 24 }}
                      dangerouslySetInnerHTML={{ __html: logoLightSvg }}
                    />
                  )}
                </>
              ) : hasCustomLogo && logoSvg ? (
                <span
                  className="w-auto text-foreground [&>svg]:h-full [&>svg]:w-auto [&>svg]:overflow-visible"
                  style={{ height: logoHeight ?? 24 }}
                  dangerouslySetInnerHTML={{ __html: logoSvg }}
                />
              ) : hasCustomLogo ? (
                <img
                  src="/api/logo"
                  alt="Logo"
                  style={{ height: logoHeight ?? 28 }}
                  className="w-auto"
                />
              ) : (
                <svg
                  className="h-6 w-6 text-primary"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="7.5 4.21 12 6.81 16.5 4.21" />
                  <polyline points="7.5 19.79 7.5 14.6 3 12" />
                  <polyline points="21 12 16.5 14.6 16.5 19.79" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
              )}
              {!hasCustomLogo && (
                <span className="text-lg font-semibold tracking-tight">
                  {project || siteTitle || 'Cortex'}
                </span>
              )}
            </Link>
            {showLogoDocsLabel !== false && (
              <span className="text-md text-muted-foreground">Docs</span>
            )}
          </div>

          {/* Center: search bar */}
          <div className="flex-1 flex justify-center px-8">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex w-full max-w-md items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3.5 py-2 text-sm text-muted-foreground transition-all hover:bg-muted/50 hover:border-border"
            >
              <SearchIcon className="size-4 shrink-0" />
              <span className="flex-1 text-left">Search...</span>
              <Kbd>⌘K</Kbd>
            </button>
          </div>

          {/* Right: theme toggle */}
          <div className="flex items-center gap-2 shrink-0">
            {mounted && (
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                aria-label="Toggle theme"
              >
                {resolvedTheme === 'dark' ? (
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="5" />
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                  </svg>
                ) : (
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Bottom row: nav links */}
        <nav className="flex items-center gap-1 px-6 py-1.5">
          <Link
            href="/"
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1 text-sm transition-colors',
              pathname === '/'
                ? 'bg-accent text-accent-foreground font-medium [&>svg]:text-(--primary-text)'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent',
            )}
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            Home
          </Link>
          {hasDocs !== false && (
            <Link
              href="/docs"
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1 text-sm transition-colors',
                pathname?.startsWith('/docs')
                  ? 'bg-accent text-accent-foreground font-medium [&>svg]:text-(--primary-text)'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              Docs
            </Link>
          )}
          {hasSources && (
            <Link
              href="/api-reference"
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1 text-sm transition-colors',
                pathname?.startsWith('/api-reference')
                  ? 'bg-accent text-accent-foreground font-medium [&>svg]:text-(--primary-text)'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              API Reference
            </Link>
          )}
          {hasSources && (
            <Link
              href="/sdks"
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1 text-sm transition-colors',
                pathname?.startsWith('/sdks')
                  ? 'bg-accent text-accent-foreground font-medium [&>svg]:text-(--primary-text)'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              SDKs
            </Link>
          )}
          {hasMcp && (
            <Link
              href="/mcp"
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1 text-sm transition-colors',
                pathname?.startsWith('/mcp')
                  ? 'bg-accent text-accent-foreground font-medium [&>svg]:text-(--primary-text)'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                <line x1="6" y1="6" x2="6.01" y2="6" />
                <line x1="6" y1="18" x2="6.01" y2="18" />
              </svg>
              MCP
            </Link>
          )}
        </nav>
      </header>

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent
          className="top-[12%] translate-y-0 gap-0 overflow-hidden rounded-xl! p-0 sm:max-w-2xl"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Search</DialogTitle>
          <DialogDescription className="sr-only">
            Search endpoints, tools, and operations
          </DialogDescription>

          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ArrowLeftIcon className="size-4" />
              </button>
              <span className="text-base font-medium">Search</span>
            </div>
            <Kbd>Esc</Kbd>
          </div>

          <Command shouldFilter={false}>
            {/* Search input */}
            <div className="border-b border-border/40 px-4 py-2.5">
              <CommandInput
                placeholder="Search endpoints, tools, operations..."
                onValueChange={setSearchQuery}
                autoFocus
              />
            </div>

            {/* Filter chips */}
            <div className="flex gap-2 border-b border-border/40 px-4 py-2.5">
              <FilterDropdown
                label="Content type"
                value={typeFilter}
                options={filterOptions.types}
                onSelect={setTypeFilter}
              />
              <FilterDropdown
                label="HTTP method"
                value={methodFilter}
                options={filterOptions.methods}
                onSelect={setMethodFilter}
              />
              <FilterDropdown
                label="Source"
                value={sourceFilter}
                options={filterOptions.sources}
                onSelect={setSourceFilter}
              />
            </div>

            {/* Results */}
            <CommandList
              className="max-h-[55vh] px-2 py-2 [&_[cmdk-list-sizer]]:space-y-1"
              data-search-count={displayItems.length}
            >
              <CommandEmpty>
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {allDocuments.length === 0
                    ? 'Loading search index...'
                    : isShowingRecent
                      ? 'Start typing to search...'
                      : 'No results found.'}
                </div>
              </CommandEmpty>
              {isShowingRecent && displayItems.length > 0 && (
                <div className="px-3 pb-1 pt-0.5 text-xs font-medium text-muted-foreground">
                  Recent
                </div>
              )}
              {displayItems.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  onSelect={() => handleSelect(item.id)}
                  className="flex items-center gap-3 rounded-lg! px-3 py-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{item.title}</div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {item.breadcrumb}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{item.resultType}</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
