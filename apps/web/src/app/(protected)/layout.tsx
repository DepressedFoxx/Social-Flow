import type { ReactNode } from 'react';
import { requireSession } from '@/features/auth/server-session';
import { SessionBoundary } from '@/features/auth/session-boundary';
import { AppShell } from '@/components/app-shell';

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  return (
    <SessionBoundary initialSession={session}>
      <AppShell session={session}>{children}</AppShell>
    </SessionBoundary>
  );
}
