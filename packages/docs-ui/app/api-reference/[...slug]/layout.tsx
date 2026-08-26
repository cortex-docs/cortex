import { apiReferenceStaticParams } from '@/lib/static-route-params';

export const dynamicParams = false;

export function generateStaticParams(): Promise<Array<{ slug: string[] }>> {
  return apiReferenceStaticParams();
}

export default function ApiReferenceSlugLayout({ children }: { children: React.ReactNode }) {
  return children;
}
