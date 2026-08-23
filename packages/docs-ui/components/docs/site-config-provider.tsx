'use client';

import { createContext, useContext } from 'react';

export interface HomeSection {
  title: string;
  description: string;
  badge: string;
  href: string;
  icon?: string;
  iconSvg?: string;
}

export interface HomeConfig {
  title?: string;
  description?: string;
  cta?: { label: string; href: string };
  sections?: HomeSection[];
}

export interface SiteConfig {
  title: string;
  project: string;
  hasLogo: boolean;
  logoSvg?: string;
  logoDarkSvg?: string;
  logoLightSvg?: string;
  logoHeight?: number;
  showLogoDocsLabel?: boolean;
  favicon?: string;
  primaryColor?: string;
  theme?: 'light' | 'dark' | 'system';
  home?: HomeConfig;
  hasSources?: boolean;
  hasDocs?: boolean;
  hasMcp?: boolean;
}

const SiteConfigContext = createContext<SiteConfig>({
  title: '',
  project: '',
  hasLogo: false,
});

export function SiteConfigProvider({
  config,
  children,
}: {
  config: SiteConfig;
  children: React.ReactNode;
}) {
  return <SiteConfigContext.Provider value={config}>{children}</SiteConfigContext.Provider>;
}

export function useSiteConfig(): SiteConfig {
  return useContext(SiteConfigContext);
}
