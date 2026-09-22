'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  FileText,
  Plus,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import type { AuthSession } from '@/features/auth/types';
import { apiGet } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { surfaceVariants, typographyVariants } from '@/styles/variants';
import { dashboardKey, type DashboardData } from './types';

const stats = [
  { key: 'DRAFT', label: 'Bản nháp', hint: 'Đang biên soạn', icon: FileText },
  { key: 'SCHEDULED', label: 'Đã lên lịch', hint: 'Chờ xuất bản', icon: CalendarClock },
  { key: 'PUBLISHED', label: 'Đã đăng', hint: 'Xuất bản thành công', icon: CheckCircle2 },
  { key: 'FAILED', label: 'Thất bại', hint: 'Cần xử lý', icon: AlertTriangle },
] as const;

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Đang tải dữ liệu dashboard" className="space-y-6">
      <span className="sr-only">Đang tải dữ liệu dashboard…</span>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ key }) => (
          <div
            key={key}
            className="h-32 animate-pulse rounded-xl border border-border bg-card motion-reduce:animate-none"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-border bg-card motion-reduce:animate-none" />
    </div>
  );
}

function formatSchedule(value: string, timezone: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(value));
}

export function DashboardOverview({ session }: { session: AuthSession }) {
  const dashboard = useQuery({
    queryKey: dashboardKey,
    queryFn: ({ signal }) => apiGet<DashboardData>('/dashboard', signal),
    retry: false,
    refetchInterval: 60_000,
  });

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            Xin chào, {session.user.name}. Đây là tình hình nội dung của workspace.
          </p>
        </div>
        <Button asChild>
          <Link href="/posts/new">
            <Plus aria-hidden="true" />
            Tạo bài viết
          </Link>
        </Button>
      </div>

      {dashboard.isPending ? (
        <DashboardSkeleton />
      ) : dashboard.isError ? (
        <section className={surfaceVariants()} aria-labelledby="dashboard-error-title">
          <div className="flex size-10 items-center justify-center rounded-full bg-danger-subtle text-danger">
            <AlertTriangle aria-hidden="true" />
          </div>
          <h2
            id="dashboard-error-title"
            className={cn(typographyVariants({ variant: 'sectionTitle' }), 'mt-4')}
          >
            Chưa tải được dashboard
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Kết nối có thể đang gián đoạn. Dữ liệu hiện tại chưa bị thay đổi.
          </p>
          <Button
            variant="outline"
            className="mt-5"
            disabled={dashboard.isFetching}
            onClick={() => void dashboard.refetch()}
          >
            {dashboard.isFetching ? 'Đang tải lại…' : 'Thử lại'}
          </Button>
        </section>
      ) : (
        <div className="space-y-6">
          <section aria-labelledby="status-title">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2
                  id="status-title"
                  className={typographyVariants({ variant: 'sectionTitle' })}
                >
                  Trạng thái bài viết
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Số liệu từ workspace hiện tại.
                </p>
              </div>
              <Link
                href="/posts"
                className={cn(buttonVariants({ variant: 'link', size: 'sm' }), 'px-0')}
              >
                Xem tất cả
                <ChevronRight aria-hidden="true" />
              </Link>
            </div>
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {stats.map(({ key, label, hint, icon: Icon }) => (
                <div
                  key={key}
                  className={cn(surfaceVariants({ padding: 'sm' }), 'min-w-0')}
                >
                  <div
                    className={cn(
                      'mb-5 flex size-9 items-center justify-center rounded-lg',
                      key === 'FAILED'
                        ? 'bg-danger-subtle text-danger'
                        : 'bg-accent text-accent-foreground',
                    )}
                  >
                    <Icon aria-hidden="true" />
                  </div>
                  <dd className="text-2xl font-semibold tabular-nums">
                    {dashboard.data.counts[key]}
                  </dd>
                  <dt className="mt-1 text-sm font-medium">{label}</dt>
                  <p className="mt-1 hidden text-xs text-muted-foreground sm:block">
                    {hint}
                  </p>
                </div>
              ))}
            </dl>
          </section>

          <section
            className={surfaceVariants({ padding: 'none' })}
            aria-labelledby="upcoming-title"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
              <div>
                <h2
                  id="upcoming-title"
                  className={typographyVariants({ variant: 'sectionTitle' })}
                >
                  Sắp đăng
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  5 bài gần nhất theo lịch.
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/posts?status=scheduled">Xem lịch đăng</Link>
              </Button>
            </div>
            {dashboard.data.upcoming.length === 0 ? (
              <div className="flex flex-col items-center px-5 py-10 text-center sm:px-6">
                <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <CircleDashed aria-hidden="true" />
                </div>
                <h3 className="mt-4 font-medium">Chưa có bài nào được lên lịch</h3>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                  Tạo nội dung đầu tiên rồi chọn thời gian đăng để bài xuất hiện tại đây.
                </p>
                <Button asChild className="mt-5" size="sm">
                  <Link href="/posts/new">Tạo bài viết</Link>
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {dashboard.data.upcoming.map((post) => (
                  <li key={post.id}>
                    <Link
                      href={`/posts/${post.id}`}
                      className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-ring sm:px-6"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{post.title}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {post.channel.name} ·{' '}
                          {post.channel.platform === 'FACEBOOK'
                            ? 'Facebook'
                            : 'Instagram'}
                        </p>
                      </div>
                      <time
                        dateTime={post.scheduledAt}
                        className="shrink-0 text-right text-xs text-muted-foreground"
                      >
                        {formatSchedule(post.scheduledAt, session.workspace.timezone)}
                      </time>
                      <ChevronRight
                        className="shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="channels-title">
            <h2
              id="channels-title"
              className={typographyVariants({ variant: 'sectionTitle' })}
            >
              Kênh đang quản lý
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {session.workspace.channels.map((channel) => (
                <li key={channel.id} className={surfaceVariants({ padding: 'sm' })}>
                  <p className="font-medium">{channel.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {channel.platform === 'FACEBOOK' ? 'Facebook' : 'Instagram'} · Kênh mô
                    phỏng
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
