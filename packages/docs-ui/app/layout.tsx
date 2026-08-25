import './styles.css';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/docs/theme-provider';
import {
  SiteConfigProvider,
  type HomeSection,
  type SiteConfig,
} from '@/components/docs/site-config-provider';
import { SearchProvider } from '@/components/docs/search-provider';
import { sanitizeSvg } from '@/lib/sanitize-svg';

interface LoadedSiteConfig extends SiteConfig {
  customHeadHtml?: string;
}

function emptySiteConfig(): LoadedSiteConfig {
  return {
    title: '',
    project: '',
    hasLogo: false,
    customHeadHtml: undefined,
  };
}

function adj(r: number, g: number, b: number, mul: number) {
  return `rgb(${Math.min(255, Math.round(r * mul))},${Math.min(255, Math.round(g * mul))},${Math.min(255, Math.round(b * mul))})`;
}

function parsePrimary(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const lightBgMul = lum < 0.15 ? 1.8 : lum < 0.3 ? 1.3 : 1;
  const darkBgMul = lum < 0.15 ? 4 : lum < 0.3 ? 2.2 : lum < 0.4 ? 1.4 : 1;
  const textMul =
    lum > 0.9 ? 0.45 : lum > 0.7 ? 0.88 : lum > 0.5 ? 0.92 : lum < 0.15 ? 3.5 : lum < 0.3 ? 2 : 1;
  const lightColor = adj(r, g, b, lightBgMul);
  const darkColor = adj(r, g, b, darkBgMul);
  const lightText = adj(r, g, b, textMul);
  const darkText = adj(r, g, b, darkBgMul);
  const lightLum = lum * lightBgMul;
  const darkLum = Math.min(1, lum * darkBgMul);
  const lightFg = lightLum > 0.5 ? '#0a0a0a' : '#fafafa';
  const darkFg = darkLum > 0.5 ? '#0a0a0a' : '#fafafa';
  const targetTintLum = 0.45;
  const tintMul = lum > 0 ? Math.max(1, targetTintLum / lum) : 6;
  const cardTint = adj(r, g, b, Math.min(tintMul, 10));
  return { lightColor, darkColor, lightFg, darkFg, lightText, darkText, cardTint };
}

function createThemeInitializationScript(defaultTheme: 'light' | 'dark' | 'system'): string {
  return `(()=>{try{const e=document.documentElement,p=new URLSearchParams(location.search).get("appearance");let t=p==="light"||p==="dark"?p:"";if(!t){try{const s=localStorage.getItem("theme");if(s==="light"||s==="dark"||s==="system")t=s}catch{}}if(!t)t="${defaultTheme}";const r=t==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t;e.classList.remove("light","dark");e.classList.add(r);e.style.colorScheme=r}catch{}})();`;
}

function readSiteConfig(): LoadedSiteConfig {
  let configFile: string | null = null;
  let dir: string | null = null;

  const explicitConfig = process.env.CORTEX_CONFIG_PATH;
  if (explicitConfig && fs.existsSync(explicitConfig)) {
    configFile = explicitConfig;
    dir = path.dirname(explicitConfig);
  }

  if (!configFile) {
    const specPath = process.env.CORTEX_SPEC_PATH;
    if (!specPath) return emptySiteConfig();
    dir = path.dirname(specPath);
    for (const name of ['cortex.config.yml', 'cortex.config.yaml', 'cortex.yml']) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) {
        configFile = candidate;
        break;
      }
    }
  }

  if (!configFile || !dir) return emptySiteConfig();

  try {
    const yaml = require('js-yaml');
    const raw = yaml.load(fs.readFileSync(configFile, 'utf-8')) as Record<string, unknown>;
    const readSvg = (p: string): string | undefined => {
      if (p && p.endsWith('.svg') && fs.existsSync(p)) {
        try {
          return sanitizeSvg(fs.readFileSync(p, 'utf-8'));
        } catch {}
      }
      return undefined;
    };

    const logoPath =
      process.env.CORTEX_LOGO_PATH ?? (raw?.logo ? path.resolve(dir, raw.logo as string) : '');
    const hasLogo = !!logoPath && fs.existsSync(logoPath);
    const logoSvg = readSvg(logoPath);

    const logoDarkPath = raw?.logo_dark ? path.resolve(dir, raw.logo_dark as string) : '';
    const logoDarkSvg = readSvg(logoDarkPath);
    const logoLightPath = raw?.logo_light ? path.resolve(dir, raw.logo_light as string) : '';
    const logoLightSvg = readSvg(logoLightPath);

    const faviconPath = raw?.favicon ? path.resolve(dir, raw.favicon as string) : '';
    const favicon = faviconPath && fs.existsSync(faviconPath) ? `/api/favicon` : undefined;
    const home = raw?.home as Record<string, unknown> | undefined;
    let homeSections = home?.sections as HomeSection[] | undefined;
    if (homeSections && configFile) {
      const cfgDir = path.dirname(configFile);
      homeSections = homeSections.map((s: HomeSection) => {
        if (s.icon && typeof s.icon === 'string' && !s.icon.startsWith('<')) {
          const iconPath = path.resolve(cfgDir, s.icon);
          if (fs.existsSync(iconPath)) {
            return { ...s, iconSvg: sanitizeSvg(fs.readFileSync(iconPath, 'utf-8')) };
          }
        }
        return s;
      });
    }
    const primaryColor = (raw?.primaryColor as string) ?? undefined;
    const theme = (raw?.theme as 'light' | 'dark' | 'system') ?? 'system';
    const sources = raw?.sources as Array<unknown> | undefined;
    const docs = raw?.docs as Array<unknown> | undefined;
    const mcp = raw?.mcp as Record<string, unknown> | undefined;
    const customHeadHtmlValue = raw?.custom_head_html;
    const customHeadHtml =
      typeof customHeadHtmlValue === 'string' && customHeadHtmlValue.trim()
        ? customHeadHtmlValue
        : undefined;
    return {
      title: (raw?.title as string) ?? '',
      project: (raw?.project as string) ?? '',
      hasLogo: hasLogo || !!logoDarkSvg || !!logoLightSvg,
      logoSvg,
      logoDarkSvg,
      logoLightSvg,
      logoHeight: (raw?.logoHeight as number) ?? undefined,
      showLogoDocsLabel: (raw?.showLogoDocsLabel as boolean) ?? true,
      favicon,
      customHeadHtml,
      primaryColor,
      theme,
      hasSources: Array.isArray(sources) && sources.length > 0,
      hasDocs: Array.isArray(docs) && docs.length > 0,
      hasMcp: !!mcp || (Array.isArray(sources) && sources.length > 0),
      home: home
        ? {
            title: home.title as string | undefined,
            description: home.description as string | undefined,
            cta: home.cta as { label: string; href: string } | undefined,
            sections: homeSections,
          }
        : undefined,
    };
  } catch {
    return emptySiteConfig();
  }
}

export function generateMetadata(): Metadata {
  const siteConfig = readSiteConfig();
  const title = siteConfig.title || siteConfig.project || 'Cortex Docs';
  return {
    title,
    description: siteConfig.home?.description || `API documentation for ${title}`,
    icons: siteConfig.favicon ? { icon: siteConfig.favicon } : undefined,
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { customHeadHtml, ...siteConfig } = readSiteConfig();
  const defaultTheme = siteConfig.theme ?? 'system';

  const pc = siteConfig.primaryColor;
  const primaryCss = pc
    ? (() => {
        const p = parsePrimary(pc);
        return `html{--color-primary:${p.lightColor}!important;--color-primary-foreground:${p.lightFg}!important;--primary-text:${p.lightText};--primary-card-tint:${p.cardTint}}html.dark{--color-primary:${p.darkColor}!important;--color-primary-foreground:${p.darkFg}!important;--primary-text:${p.darkText};--primary-card-tint:${p.cardTint}}@media(prefers-color-scheme:dark){html:not(.light){--color-primary:${p.darkColor}!important;--color-primary-foreground:${p.darkFg}!important;--primary-text:${p.darkText};--primary-card-tint:${p.cardTint}}}`;
      })()
    : '';

  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      {customHeadHtml && (
        <head suppressHydrationWarning dangerouslySetInnerHTML={{ __html: customHeadHtml }} />
      )}
      <body suppressHydrationWarning>
        <script
          data-cortex-theme-init=""
          dangerouslySetInnerHTML={{ __html: createThemeInitializationScript(defaultTheme) }}
        />
        {primaryCss && <style data-primary="" dangerouslySetInnerHTML={{ __html: primaryCss }} />}
        <SiteConfigProvider config={siteConfig}>
          <ThemeProvider defaultTheme={defaultTheme} disableTransitionOnChange>
            <SearchProvider>{children}</SearchProvider>
          </ThemeProvider>
        </SiteConfigProvider>
      </body>
    </html>
  );
}
