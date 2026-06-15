'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SdksLandingPage() {
  const router = useRouter();

  useEffect(() => {
    fetch('/api/sdks')
      .then((r) => r.json())
      .then((data) => {
        const firstLang = data?.packages?.[0]?.language;
        if (firstLang) router.replace(`/sdks/${firstLang}`);
      })
      .catch(() => {});
  }, [router]);

  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
    </div>
  );
}
