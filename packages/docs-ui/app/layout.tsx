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
import { GoogleAnalytics } from '@/components/docs/google-analytics';
import { sanitizeSvg } from '@/lib/sanitize-svg';
import { primaryThemeCss } from '@/lib/primary-theme';

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
    const analyticsValue = raw?.analytics as Record<string, unknown> | undefined;
    const googleAnalyticsId = analyticsValue?.google_analytics_id;
    const enabledHostsValue = analyticsValue?.enabled_hosts;
    const privacyUrlValue = analyticsValue?.privacy_url;
    const analytics =
      typeof googleAnalyticsId === 'string'
        ? {
            googleAnalyticsId,
            enabledHosts: Array.isArray(enabledHostsValue)
              ? enabledHostsValue.filter((host): host is string => typeof host === 'string')
              : [],
            privacyUrl:
              typeof privacyUrlValue === 'string'
                ? privacyUrlValue
                : 'https://cortexdocs.dev/privacy#cookies-and-analytics',
          }
        : undefined;
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
      hasMcp:
        !!process.env.CORTEX_HOSTED_REPOSITORY ||
        !!mcp ||
        (Array.isArray(sources) && sources.length > 0),
      analytics,
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

  const primaryCss = primaryThemeCss(siteConfig.primaryColor ?? '');

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
            <GoogleAnalytics config={siteConfig.analytics} />
          </ThemeProvider>
        </SiteConfigProvider>
      </body>
    </html>
  );
}
