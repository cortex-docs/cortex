'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { DocsHeader } from '@/components/docs/docs-header';
import { useSiteConfig, type HomeSection, type HomeConfig } from '@/components/docs/site-config-provider';
import { useProjectWatch } from '@/lib/use-project-watch';

const COLS = 45;
const ROWS = 16;
const SX = 10;
const SY = 9;

function CortexGrid() {
  return (
    <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>{`
          .cg-line { stroke: rgba(255,255,255,0.14); stroke-width: 0.5; stroke-dasharray: 2 3; }
          .cg-node { fill: rgba(255,255,255,0.03); }
          .group:hover .cg-line { animation: cgLine var(--dur) ease-in-out var(--delay) infinite; }
          .group:hover .cg-node { animation: cgNode var(--dur) ease-in-out var(--delay) infinite; }
          @keyframes cgLine { 0%,100% { stroke: rgba(255,255,255,0.14); } 50% { stroke: rgba(255,255,255,0.28); } }
          @keyframes cgNode { 0%,100% { fill: rgba(255,255,255,0.03); } 50% { fill: rgba(255,255,255,0.1); } }
        `}</style>
      </defs>
      {Array.from({ length: ROWS }, (_, r) => (
        <line key={`h${r}`} className="cg-line" x1={0} y1={r * SY + 6} x2="100%" y2={r * SY + 6}
          style={{ '--delay': `${r * 0.1}s`, '--dur': '3s' } as React.CSSProperties} />
      ))}
      {Array.from({ length: COLS }, (_, c) => (
        <line key={`v${c}`} className="cg-line" x1={c * SX + 7} y1={0} x2={c * SX + 7} y2="100%"
          style={{ '--delay': `${c * 0.06}s`, '--dur': '3s' } as React.CSSProperties} />
      ))}
      {Array.from({ length: ROWS * COLS }, (_, i) => {
        const c = i % COLS, r = Math.floor(i / COLS);
        return (
          <circle key={`n${i}`} className="cg-node" cx={c * SX + 7} cy={r * SY + 6} r={0.4}
            style={{ '--delay': `${((i * 7 + 3) % (ROWS * COLS)) * 0.06}s`, '--dur': `${2.5 + (i % 5) * 0.4}s` } as React.CSSProperties} />
        );
      })}
    </svg>
  );
}

const DEFAULT_SECTION_ICONS = [
  '/assets/icons/cortex-pathways.svg',
  '/assets/icons/cortex-layers.svg',
  '/assets/icons/cortex-network.svg',
];

const DEFAULT_SECTIONS: HomeSection[] = [
  {
    title: 'API Reference',
    description: 'Try endpoints, visualize schema, and check out code samples.',
    href: '/api-reference',
    badge: 'Reference',
  },
  {
    title: 'SDKs',
    description: 'Typed client libraries for every major language.',
    href: '/sdks',
    badge: 'Libraries',
  },
  {
    title: 'MCP',
    description: 'Hook up AI coding agents via our MCP in seconds.',
    href: '/mcp',
    badge: 'AI Agents',
  },
];

export default function Home() {
  const { title: siteTitle, home: initialHome } = useSiteConfig();
  const [home, setHome] = useState<HomeConfig | undefined>(initialHome);

  const fetchConfig = useCallback(() => {
    fetch(`/api/config?t=${Date.now()}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        if (data.home) setHome(data.home);
        if (data.primaryColor && /^#[0-9a-fA-F]{6}$/.test(data.primaryColor)) {
          const pc = data.primaryColor;
          const r = parseInt(pc.slice(1, 3), 16);
          const g = parseInt(pc.slice(3, 5), 16);
          const b = parseInt(pc.slice(5, 7), 16);
          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          const a = (m: number) => `rgb(${Math.min(255, Math.round(r * m))},${Math.min(255, Math.round(g * m))},${Math.min(255, Math.round(b * m))})`;
          const lbm = lum < 0.15 ? 1.8 : lum < 0.3 ? 1.3 : 1;
          const dbm = lum < 0.15 ? 4 : lum < 0.3 ? 2.2 : lum < 0.4 ? 1.4 : 1;
          const tm = lum > 0.9 ? 0.45 : lum > 0.7 ? 0.88 : lum > 0.5 ? 0.92 : lum < 0.15 ? 3.5 : lum < 0.3 ? 2 : 1;
          const tintMul = lum > 0 ? Math.max(1, 0.45 / lum) : 6;
          const lightColor = a(lbm), darkColor = a(dbm), lightText = a(tm), darkText = a(dbm), cardTint = a(Math.min(tintMul, 10));
          const lightLum = lum * lbm, darkLum = Math.min(1, lum * dbm);
          const lightFg = lightLum > 0.5 ? '#0a0a0a' : '#fafafa';
          const darkFg = darkLum > 0.5 ? '#0a0a0a' : '#fafafa';
          let s = document.querySelector('style[data-primary]') as HTMLStyleElement;
          if (!s) { s = document.createElement('style'); s.setAttribute('data-primary', ''); document.body.prepend(s); }
          s.textContent = `html{--color-primary:${lightColor}!important;--color-primary-foreground:${lightFg}!important;--primary-text:${lightText};--primary-card-tint:${cardTint}}html.dark{--color-primary:${darkColor}!important;--color-primary-foreground:${darkFg}!important;--primary-text:${darkText};--primary-card-tint:${cardTint}}@media(prefers-color-scheme:dark){html:not(.light){--color-primary:${darkColor}!important;--color-primary-foreground:${darkFg}!important;--primary-text:${darkText};--primary-card-tint:${cardTint}}}`;
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);
  useProjectWatch(fetchConfig);

  const title = home?.title ?? siteTitle ?? 'API Docs';
  const description = home?.description ?? 'Explore the full API surface, grab a client SDK, or wire up AI coding agents via our MCP for faster integration.';
  const cta = home?.cta ?? { label: 'Getting Started', href: '/docs' };
  const sections = home?.sections ?? DEFAULT_SECTIONS;

  return (
    <div className="flex min-h-screen flex-col">
      <DocsHeader />
      <main className="flex-1">
        <div className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-20%,var(--tw-gradient-from)_0%,transparent_70%)] from-primary/8" />

          <div className="relative mx-auto max-w-5xl px-6 py-20">
            <div className="mb-16 text-center">
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
              <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
                {description}
              </p>
              <div className="mt-6">
                <Link
                  href={cta.href}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)] hover:bg-primary/90 hover:shadow-md hover:-translate-y-px"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
                    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
                    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
                    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
                  </svg>
                  {cta.label}
                </Link>
              </div>
            </div>

            <div className={`grid gap-6 sm:grid-cols-2 ${sections.length >= 3 ? 'lg:grid-cols-3' : ''}`}>
              {sections.map((section, idx) => {
                const iconSrc = section.icon ?? DEFAULT_SECTION_ICONS[idx];
                const iconSvg = section.iconSvg;
                return (
                  <Link
                    key={section.title}
                    href={section.href}
                    className="group relative glass-card glass-card-hover rounded-xl overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)] hover:-translate-y-px hover:border-primary/25"
                  >
                    <div className="relative h-32 bg-black overflow-hidden">
                      <div className="absolute inset-0" style={{ backgroundColor: 'var(--primary-card-tint)', opacity: 0.06 }} />
                      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 80% at 50% 50%, var(--primary-card-tint), transparent 70%)', opacity: 0.1 }} />
                      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")' }} />
                      <CortexGrid />
                      {(iconSvg || iconSrc) && (
                        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                          <div className="relative flex items-center justify-center">
                            <div className="absolute w-24 h-24 rounded-full" style={{ background: 'radial-gradient(circle, var(--primary-card-tint), transparent 70%)', opacity: 0.08 }} />
                            <div className="absolute w-20 h-20 rounded-full border border-white/8 transition-all duration-500" />
                            {iconSvg ? (
                              <div
                                className="relative w-12 h-12 opacity-50 group-hover:opacity-80 transition-all duration-500 group-hover:scale-110 [&_svg]:w-full [&_svg]:h-full"
                                dangerouslySetInnerHTML={{ __html: iconSvg }}
                              />
                            ) : (
                              <img
                                src={iconSrc}
                                alt=""
                                className="relative w-12 h-12 opacity-50 group-hover:opacity-80 transition-all duration-500 group-hover:scale-110"
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="p-5">
                      <div className="mb-2 flex items-center justify-between">
                        <h2 className="text-lg font-semibold tracking-tight group-hover:text-(--primary-text) transition-colors">
                          {section.title}
                        </h2>
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          {section.badge}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{section.description}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
