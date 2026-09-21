'use client';

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { surfaceVariants, typographyVariants } from '@/styles/variants';

type Health = { status: 'ok'; service: string; timestamp: string };

export function ApiStatus() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => apiGet<Health>('/health', signal),
    retry: false,
  });

  return (
    <section aria-labelledby="connection-title" className={surfaceVariants()}>
      <h2
        id="connection-title"
        className={typographyVariants({ variant: 'sectionTitle' })}
      >
        Kết nối backend
      </h2>
      <p
        role="status"
        className={cn(
          typographyVariants({
            variant: 'bodySmall',
            tone: health.isPending ? 'muted' : health.isError ? 'danger' : 'success',
          }),
          'mt-3',
        )}
      >
        {health.isPending
          ? 'Đang kiểm tra kết nối…'
          : health.isError
            ? 'Chưa kết nối được API. Hãy kiểm tra backend và thử lại.'
            : 'Đã kết nối API SocialFlow.'}
      </p>
      <p
        className={cn(typographyVariants({ variant: 'caption', tone: 'muted' }), 'mt-2')}
      >
        Trạng thái này kiểm tra API; kết nối PostgreSQL được kiểm tra riêng qua
        /api/health/ready.
      </p>
      <Button
        variant="outline"
        className="mt-5"
        disabled={health.isFetching}
        onClick={() => void health.refetch()}
      >
        {health.isFetching ? 'Đang kiểm tra…' : 'Kiểm tra lại'}
      </Button>
    </section>
  );
}
