import { redirect } from 'next/navigation';
import { AuthForm } from '@/features/auth/auth-form';
import { getServerSession } from '@/features/auth/server-session';

export default async function RegisterPage() {
  const session = await getServerSession().catch(() => null);
  if (session) redirect('/dashboard');
  return <AuthForm mode="register" />;
}
