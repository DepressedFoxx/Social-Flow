import { requireSession } from '@/features/auth/server-session';
import { DashboardOverview } from '@/features/dashboard/dashboard-overview';

export default async function DashboardPage() {
  return <DashboardOverview session={await requireSession()} />;
}
