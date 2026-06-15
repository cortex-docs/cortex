'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProjectWatch } from '@/lib/use-project-watch';
import { cn } from '@/lib/utils';
import { DocsBreadcrumb } from '@/components/docs/docs-breadcrumb';

interface SdkPackage {
  language: string;
  languageDisplayName: string;
  packageName: string;
  githubRepository?: string;
  protocols: string[];
}

const LANG_META: Record<string, { icon: string; color: string; bg: string; accent: string }> = {
  typescript: { icon: 'TS', color: 'text-[#3178c6]', bg: 'bg-[#3178c6]/10', accent: 'border-[#3178c6]/30' },
  python:     { icon: 'PY', color: 'text-[#3776ab]', bg: 'bg-[#3776ab]/10', accent: 'border-[#3776ab]/30' },
  go:         { icon: 'GO', color: 'text-[#00add8]', bg: 'bg-[#00add8]/10', accent: 'border-[#00add8]/30' },
  java:       { icon: 'JV', color: 'text-[#f89820]', bg: 'bg-[#f89820]/10', accent: 'border-[#f89820]/30' },
  kotlin:     { icon: 'KT', color: 'text-[#7f52ff]', bg: 'bg-[#7f52ff]/10', accent: 'border-[#7f52ff]/30' },
  ruby:       { icon: 'RB', color: 'text-[#cc342d]', bg: 'bg-[#cc342d]/10', accent: 'border-[#cc342d]/30' },
  php:        { icon: 'PHP', color: 'text-[#777bb4]', bg: 'bg-[#777bb4]/10', accent: 'border-[#777bb4]/30' },
  csharp:     { icon: 'C#', color: 'text-[#68217a]', bg: 'bg-[#68217a]/10', accent: 'border-[#68217a]/30' },
  rust:       { icon: 'RS', color: 'text-[#dea584]', bg: 'bg-[#dea584]/10', accent: 'border-[#dea584]/30' },
  cpp:        { icon: 'C++', color: 'text-[#00599c]', bg: 'bg-[#00599c]/10', accent: 'border-[#00599c]/30' },
  c:          { icon: 'C', color: 'text-[#a8b9cc]', bg: 'bg-[#a8b9cc]/10', accent: 'border-[#a8b9cc]/30' },
};

const INSTALL_HINTS: Record<string, (pkg: string) => string> = {
  typescript: (p) => `npm install ${p}`,
  python:     (p) => `pip install ${p}`,
  go:         (p) => `go get ${p}`,
  java:       () => `Maven / Gradle`,
  kotlin:     () => `Gradle`,
  ruby:       (p) => `gem install ${p}`,
  php:        (p) => `composer require ${p}`,
  csharp:     (p) => `dotnet add package ${p}`,
  rust:       (p) => `cargo add ${p}`,
  cpp:        () => `CMake`,
  c:          () => `Makefile`,
};

export function SdksReference({ initialLanguage }: { initialLanguage?: string }) {
  const [packages, setPackages] = useState<SdkPackage[]>([]);
  const [readmes, setReadmes] = useState<Record<string, string>>({});
  const [activeLang, setActiveLang] = useState<string | null>(null);
  const [selectedPkg, setSelectedPkg] = useState<SdkPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(() => {
    Promise.all([
      fetch('/api/sdks').then((r) => r.json()),
      fetch('/api/sdk-readme').then((r) => r.json()),
    ]).then(([sdksData, readmeData]) => {
      const pkgs: SdkPackage[] = sdksData.packages ?? [];
      setPackages(pkgs);
      setReadmes(readmeData.readmes ?? {});
      if (pkgs.length > 0) {
        setActiveLang((prev) => prev ?? initialLanguage ?? pkgs[0].language);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useProjectWatch(fetchData);

  const uniqueLangs = Array.from(new Map(packages.map((p) => [p.language, p])).values());
  const activePkgs = packages.filter((p) => p.language === activeLang);

  const router = useRouter();

  function selectLang(lang: string) {
    setActiveLang(lang);
    setSelectedPkg(null);
    setSidebarOpen(false);
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    router.push(`/sdks/${lang}`);
  }

  function selectPackage(pkg: SdkPackage) {
    setSelectedPkg(pkg);
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  return (
    <div className="relative flex h-[calc(100vh-5.5rem)]">
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed bottom-4 left-4 z-50 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg lg:hidden"
        aria-label="Toggle navigation"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {sidebarOpen ? <path d="M18 6 6 18M6 6l12 12" /> : <><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></>}
        </svg>
      </button>

      <aside className={cn(
        'fixed inset-y-22 left-0 z-40 w-56 shrink-0 overflow-y-auto border-r bg-background px-3 py-4 transition-transform lg:relative lg:inset-y-auto lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className="space-y-px">
          {uniqueLangs.map((pkg) => {
            const meta = LANG_META[pkg.language];
            const isActive = activeLang === pkg.language;
            return (
              <button
                key={pkg.language}
                onClick={() => selectLang(pkg.language)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-left text-sm transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >
                <span className={cn(
                  'inline-flex h-6 w-8 items-center justify-center rounded text-[10px] font-bold shrink-0',
                  isActive ? meta?.bg ?? 'bg-primary/15' : 'bg-muted',
                  meta?.color ?? 'text-muted-foreground',
                )}>
                  {meta?.icon ?? pkg.language}
                </span>
                {pkg.languageDisplayName}
              </button>
            );
          })}
        </div>
      </aside>

      <main ref={contentRef} className="flex-1 overflow-y-auto">
        <DocsBreadcrumb segments={[
          { label: 'SDKs', href: '/sdks' },
          ...(activeLang ? [{ label: uniqueLangs.find((p) => p.language === activeLang)?.languageDisplayName ?? activeLang }] : []),
        ]} />
        {selectedPkg ? (
          <>
            <div className="border-b px-6 py-3 lg:px-10">
              <button
                onClick={() => setSelectedPkg(null)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6" />
                </svg>
                Back to {LANG_META[activeLang!]?.icon ?? activeLang} SDKs
              </button>
            </div>
            <div className="mx-auto max-w-4xl px-6 py-8 lg:px-10">
              <div className="docs-content" dangerouslySetInnerHTML={{ __html: readmes[activeLang!] ?? '' }} />
            </div>
          </>
        ) : (
          <div className="mx-auto max-w-5xl px-6 py-10 lg:px-10">
            <div className="mb-8">
              <h1 className="text-3xl font-bold tracking-tight">
                {uniqueLangs.find((p) => p.language === activeLang)?.languageDisplayName} SDKs
              </h1>
              <p className="mt-2 text-muted-foreground">
                Click any package to view full documentation, code samples, and resources.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
              {activePkgs.map((pkg) => {
                const meta = LANG_META[pkg.language];
                const install = INSTALL_HINTS[pkg.language]?.(pkg.packageName) ?? '';
                return (
                  <button
                    key={`${pkg.language}:${pkg.packageName}`}
                    onClick={() => selectPackage(pkg)}
                    className={cn(
                      'group relative flex flex-col rounded-xl border p-5 text-left transition-all',
                      'hover:shadow-md hover:border-border/80 hover:-translate-y-0.5',
                      'bg-card cursor-pointer',
                      meta?.accent ?? 'border-border',
                    )}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <span className={cn(
                        'inline-flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold',
                        meta?.bg ?? 'bg-muted',
                        meta?.color ?? 'text-muted-foreground',
                      )}>
                        {meta?.icon ?? pkg.language}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-foreground">{pkg.packageName}</div>
                        {pkg.githubRepository && (
                          <div className="text-xs text-muted-foreground truncate">{pkg.githubRepository}</div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {pkg.protocols.map((p) => (
                        <span key={p} className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                          {p}
                        </span>
                      ))}
                    </div>

                    {install && (
                      <div className="mt-auto pt-3 border-t border-border/50">
                        <code className="text-[11px] font-mono text-muted-foreground">{install}</code>
                      </div>
                    )}

                    {pkg.githubRepository && (
                      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg className="h-4 w-4 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {activePkgs.length === 0 && (
              <div className="text-center py-20 text-muted-foreground">
                <p>No SDKs configured for this language.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
