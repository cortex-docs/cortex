'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DocsHeader } from '@/components/docs/docs-header';

export default function DocsLandingPage() {
  const router = useRouter();
  const [fallback, setFallback] = useState(false);

  const redirect = useCallback(() => {
    fetch('/api/docs')
      .then((r) => r.json())
      .then((data) => {
        const firstSlug = data?.sections?.[0]?.documents?.[0]?.slug;
        if (firstSlug) {
          router.replace(`/docs/${firstSlug}`);
        } else {
          setFallback(true);
        }
      })
      .catch(() => setFallback(true));
  }, [router]);

  useEffect(() => {
    redirect();
  }, [redirect]);

  return (
    <div className="min-h-screen bg-background">
      <DocsHeader />
      <div className="fixed inset-0 flex items-center justify-center">
        {fallback
          ? <p className="text-muted-foreground">No documentation sections configured.</p>
          : <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />}
      </div>
    </div>
  );
}
