'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function McpNav() {
  const pathname = usePathname();

  return (
    <div className="border-b px-6 py-2 flex gap-4">
      <Link
        href="/mcp"
        className={cn(
          'text-sm py-1 border-b-2 transition-colors',
          pathname === '/mcp'
            ? 'border-primary text-foreground font-medium'
            : 'border-transparent text-muted-foreground hover:text-foreground',
        )}
      >
        Tools
      </Link>
      <Link
        href="/mcp/setup"
        className={cn(
          'text-sm py-1 border-b-2 transition-colors',
          pathname === '/mcp/setup'
            ? 'border-primary text-foreground font-medium'
            : 'border-transparent text-muted-foreground hover:text-foreground',
        )}
      >
        Client Setup
      </Link>
    </div>
  );
}
