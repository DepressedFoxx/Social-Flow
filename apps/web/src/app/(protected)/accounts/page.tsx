import { AccountsManager } from '@/features/accounts/accounts-manager';
export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ meta?: string }>;
}) {
  const { meta } = await searchParams;
  return <AccountsManager result={meta} />;
}
