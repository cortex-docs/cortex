'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ReferenceRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/api-reference');
  }, [router]);
  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
    </div>
  );
}
