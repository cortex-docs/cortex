'use client';

import { use } from 'react';
import { SdkReference } from '@/components/docs/sdk-reference';

export default function ApiReferenceDeepPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = use(params);
  return <SdkReference scrollTarget={slug} />;
}
