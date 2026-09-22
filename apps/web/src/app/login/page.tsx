import { redirect } from 'next/navigation';
import { AuthForm } from '@/features/auth/auth-form';
import { getServerSession } from '@/features/auth/server-session';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reason?: string }>;
}) {
  // A stale cookie or unavailable API must not prevent retrying sign-in.
  const session = await getServerSession().catch(() => null);
  if (session) redirect('/dashboard');
  const params = await searchParams;
  return (
    <AuthForm mode="login" error={params.error} expired={params.reason === 'expired'} />
  );
}
