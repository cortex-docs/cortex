'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDocs } from './docs-shell';

export default function DocsLandingPage() {
  const router = useRouter();
  const { data } = useDocs();
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (!data) return;
    const firstSlug = data.sections[0]?.documents[0]?.slug;
    if (firstSlug) router.replace(`/docs/${firstSlug}`);
    else setFallback(true);
  }, [data, router]);

  return (
    <main className="flex flex-1 items-center justify-center h-[calc(100vh-88px)]">
      {fallback ? (
        <p className="text-muted-foreground">No documentation sections configured.</p>
      ) : (
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      )}
    </main>
  );
}
