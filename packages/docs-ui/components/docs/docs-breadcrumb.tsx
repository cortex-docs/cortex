'use client';

import React from 'react';
import Link from 'next/link';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

export interface BreadcrumbSegment {
  label: string;
  href?: string;
}

export function DocsBreadcrumb({ segments }: { segments: BreadcrumbSegment[] }) {
  if (segments.length === 0) return null;

  return (
    <Breadcrumb className="px-6 py-2">
      <BreadcrumbList>
        {segments.flatMap((segment, i) => {
          const isLast = i === segments.length - 1;
          const items: React.ReactNode[] = [];

          if (i > 0) {
            items.push(<BreadcrumbSeparator key={`sep-${i}`} />);
          }

          items.push(
            <BreadcrumbItem key={`item-${i}`}>
              {isLast || !segment.href ? (
                <BreadcrumbPage>{segment.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link href={segment.href}>{segment.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>,
          );

          return items;
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
