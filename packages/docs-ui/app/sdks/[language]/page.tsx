'use client';

import { use } from 'react';
import { SdksReference } from '@/components/docs/sdks-reference';

export default function SdkLanguagePage({
  params,
}: {
  params: Promise<{ language: string }>;
}) {
  const { language } = use(params);
  return <SdksReference initialLanguage={language} />;
}
