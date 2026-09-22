export type DashboardData = {
  generatedAt: string;
  counts: { DRAFT: number; SCHEDULED: number; PUBLISHED: number; FAILED: number };
  upcoming: {
    id: string;
    title: string;
    scheduledAt: string;
    channel: { id: string; name: string; platform: 'FACEBOOK' | 'INSTAGRAM' };
  }[];
};

export const dashboardKey = ['dashboard'] as const;
