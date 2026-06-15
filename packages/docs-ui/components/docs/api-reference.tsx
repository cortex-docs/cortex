'use client';

// API reference viewer powered by @scalar/api-reference-react (MIT License)
// https://github.com/scalar/scalar — Copyright (c) Scalar
import { ApiReferenceReact } from '@scalar/api-reference-react';
import '@scalar/api-reference-react/style.css';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

interface SpecViewerProps {
  specUrl: string;
}

export function SpecViewer({ specUrl }: SpecViewerProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  return (
    <div className="cortex-spec-viewer">
      <ApiReferenceReact
        configuration={{
          url: specUrl,
          darkMode: resolvedTheme === 'dark',
          hideModels: false,
          hideDownloadButton: false,
          hideTestRequestButton: false,
          withDefaultFonts: false,
          customCss: `
            .scalar-app {
              font-family: var(--font-geist-sans), system-ui, sans-serif;
            }
            .scalar-app code, .scalar-app pre {
              font-family: var(--font-geist-mono), monospace;
            }
            /* Hide third-party branding */
            a[href*="scalar.com"],
            .scalar-api-client__powered-by,
            [class*="powered-by"],
            .scalar-app footer a[target="_blank"] {
              display: none !important;
            }
          `,
        }}
      />
    </div>
  );
}
