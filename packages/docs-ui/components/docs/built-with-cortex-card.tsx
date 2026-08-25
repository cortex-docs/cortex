import Image from 'next/image';

import { cn } from '@/lib/utils';

const BUILT_WITH_CORTEX_LOGO_URL =
  process.env.NEXT_PUBLIC_CORTEX_BUILT_WITH_LOGO_URL ??
  process.env.NEXT_PUBLIC_CORTEX_BUILT_BY_LOGO_URL ??
  process.env.NEXT_PUBLIC_CORTEX_BUILT_BY_BADGE_URL ??
  'https://static.cortexdocs.dev/images/built-with-cortex.svg';

export function BuiltWithCortexCard({ className }: { className?: string }) {
  return (
    <a
      href="https://cortexdocs.dev"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Built with Cortex"
      className={cn(
        'inline-flex items-center rounded-[10px] border border-black/10 bg-white px-2.5 py-2 shadow-sm',
        'transition-colors hover:border-black/15 hover:bg-zinc-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'dark:border-white/15 dark:bg-zinc-950 dark:hover:border-white/20 dark:hover:bg-zinc-900',
        className,
      )}
    >
      <Image
        src={BUILT_WITH_CORTEX_LOGO_URL}
        alt="Built with Cortex"
        width={128}
        height={20}
        className="h-5 w-32 transition-[filter] dark:invert"
        unoptimized
      />
    </a>
  );
}
