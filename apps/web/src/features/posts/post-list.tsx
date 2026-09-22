'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileText,
  ImageIcon,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { sessionKey, type AuthSession } from '@/features/auth/types';
import { dashboardKey } from '@/features/dashboard/types';
import { ApiError, apiGet, apiRequest } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { surfaceVariants } from '@/styles/variants';
import { postsKey, type PostFilters, type PostItem, type PostListData } from './types';

const statusLabels = {
  DRAFT: 'Bản nháp',
  SCHEDULED: 'Đã lên lịch',
  PUBLISHING: 'Đang đăng',
  PUBLISHED: 'Đã đăng',
  FAILED: 'Thất bại',
} as const;

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function StatusBadge({ status }: { status: PostItem['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
        status === 'FAILED'
          ? 'bg-danger-subtle text-danger'
          : status === 'PUBLISHED'
            ? 'bg-success-subtle text-success'
            : status === 'SCHEDULED' || status === 'PUBLISHING'
              ? 'bg-info-subtle text-info'
              : 'bg-muted text-muted-foreground',
      )}
    >
      {statusLabels[status]}
    </span>
  );
}

export function PostList({
  initialFilters,
  channels,
}: {
  initialFilters: PostFilters;
  channels: AuthSession['workspace']['channels'];
}) {
  const router = useRouter();
  const client = useQueryClient();
  const [search, setSearch] = useState(initialFilters.q);
  const [deleting, setDeleting] = useState<PostItem | null>(null);
  const params = useMemo(() => {
    const value = new URLSearchParams();
    if (initialFilters.q) value.set('q', initialFilters.q);
    if (initialFilters.status) value.set('status', initialFilters.status);
    if (initialFilters.channel) value.set('channel', initialFilters.channel);
    if (initialFilters.sort !== 'updatedAt') value.set('sort', initialFilters.sort);
    if (initialFilters.order !== 'desc') value.set('order', initialFilters.order);
    if (initialFilters.page > 1) value.set('page', String(initialFilters.page));
    return value;
  }, [initialFilters]);
  const queryString = params.toString();
  const posts = useQuery({
    queryKey: [...postsKey, queryString],
    queryFn: ({ signal }) =>
      apiGet<PostListData>('/posts' + (queryString ? '?' + queryString : ''), signal),
    retry: false,
  });

  const update = useCallback(
    (filters: Partial<PostFilters>) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(filters)) {
        if (
          !value ||
          value === 1 ||
          (key === 'sort' && value === 'updatedAt') ||
          (key === 'order' && value === 'desc')
        )
          next.delete(key);
        else next.set(key, String(value));
      }
      router.replace('/posts' + (next.size ? '?' + next.toString() : ''), {
        scroll: false,
      });
    },
    [params, router],
  );

  useEffect(() => {
    if (search.trim() === initialFilters.q) return;
    const timer = window.setTimeout(() => update({ q: search.trim(), page: 1 }), 300);
    return () => window.clearTimeout(timer);
  }, [search, initialFilters.q, update]);

  const remove = useMutation({
    mutationFn: async (post: PostItem) => {
      const session = client.getQueryData<AuthSession>(sessionKey);
      return apiRequest<void>('/posts/' + post.id, {
        method: 'DELETE',
        headers: {
          'If-Match': String(post.version),
          'X-CSRF-Token': session?.csrfToken ?? '',
        },
      });
    },
    onSuccess: async () => {
      setDeleting(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: postsKey }),
        client.invalidateQueries({ queryKey: dashboardKey }),
      ]);
      if (posts.data?.items.length === 1 && initialFilters.page > 1)
        update({ page: initialFilters.page - 1 });
    },
  });

  const totalPages = Math.max(1, Math.ceil((posts.data?.total ?? 0) / 20));
  const hasFilters = Boolean(
    initialFilters.q || initialFilters.status || initialFilters.channel,
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            Tìm kiếm, lọc và quản lý bản nháp của workspace.
          </p>
          {posts.data && (
            <p className="mt-1 text-xs text-muted-foreground">
              {posts.data.total} bài viết
            </p>
          )}
        </div>
        <Link href="/posts/new" className={buttonVariants()}>
          <Plus aria-hidden="true" />
          Tạo bài viết
        </Link>
      </div>

      <section
        className={cn(surfaceVariants({ padding: 'sm' }), 'mt-6')}
        aria-label="Bộ lọc bài viết"
      >
        <div className="grid gap-3 md:grid-cols-[minmax(12rem,1fr)_auto_auto_auto]">
          <Label className="relative block">
            <span className="sr-only">Tìm bài viết</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm tiêu đề hoặc nội dung…"
              className="h-control bg-card pl-9"
            />
          </Label>
          <div>
            <Label id="status-filter-label" className="sr-only">
              Lọc trạng thái
            </Label>
            <Select
              value={initialFilters.status || 'all'}
              onValueChange={(value) =>
                update({ status: value === 'all' ? '' : value, page: 1 })
              }
            >
              <SelectTrigger
                aria-labelledby="status-filter-label"
                className="h-control w-full bg-card md:w-40"
              >
                <SelectValue placeholder="Mọi trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Mọi trạng thái</SelectItem>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value.toLowerCase()}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label id="channel-filter-label" className="sr-only">
              Lọc kênh
            </Label>
            <Select
              value={initialFilters.channel || 'all'}
              onValueChange={(value) =>
                update({ channel: value === 'all' ? '' : value, page: 1 })
              }
            >
              <SelectTrigger
                aria-labelledby="channel-filter-label"
                className="h-control w-full bg-card md:w-44"
              >
                <SelectValue placeholder="Mọi kênh" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Mọi kênh</SelectItem>
                {channels.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>
                    {channel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label id="sort-filter-label" className="sr-only">
              Sắp xếp
            </Label>
            <Select
              value={`${initialFilters.sort}:${initialFilters.order}`}
              onValueChange={(value) => {
                const [sort, order] = value.split(':') as [
                  PostFilters['sort'],
                  PostFilters['order'],
                ];
                update({ sort, order, page: 1 });
              }}
            >
              <SelectTrigger
                aria-labelledby="sort-filter-label"
                className="h-control w-full bg-card md:w-44"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updatedAt:desc">Mới cập nhật</SelectItem>
                <SelectItem value="updatedAt:asc">Cũ cập nhật</SelectItem>
                <SelectItem value="scheduledAt:asc">Lịch đăng gần nhất</SelectItem>
                <SelectItem value="scheduledAt:desc">Lịch đăng xa nhất</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {posts.isPending ? (
        <div aria-busy="true" aria-label="Đang tải bài viết" className="mt-4 space-y-2">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-20 animate-pulse rounded-xl border border-border bg-card motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : posts.isError ? (
        <section className={cn(surfaceVariants(), 'mt-4')}>
          <AlertTriangle className="text-danger" aria-hidden="true" />
          <h2 className="mt-3 font-semibold">Chưa tải được danh sách bài viết</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Hãy kiểm tra kết nối và thử lại.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => void posts.refetch()}>
            Thử lại
          </Button>
        </section>
      ) : posts.data.items.length === 0 ? (
        <section className={cn(surfaceVariants(), 'mt-4 py-12 text-center')}>
          <FileText className="mx-auto text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-4 font-semibold">
            {hasFilters ? 'Không tìm thấy bài phù hợp' : 'Chưa có bài viết'}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {hasFilters
              ? 'Thử thay đổi từ khóa hoặc bộ lọc hiện tại.'
              : 'Tạo bản nháp đầu tiên để bắt đầu chuẩn bị lịch nội dung.'}
          </p>
          {hasFilters ? (
            <Button
              variant="outline"
              className="mt-5"
              onClick={() => router.replace('/posts')}
            >
              Xóa bộ lọc
            </Button>
          ) : (
            <Link href="/posts/new" className={cn(buttonVariants(), 'mt-5')}>
              Tạo bài viết
            </Link>
          )}
        </section>
      ) : (
        <>
          <div className="mt-4 hidden overflow-hidden rounded-xl border border-border bg-card md:block">
            <Table>
              <TableHeader className="bg-muted text-xs text-muted-foreground">
                <TableRow>
                  <TableHead className="px-4 py-3">Bài viết</TableHead>
                  <TableHead className="px-4 py-3">Kênh</TableHead>
                  <TableHead className="px-4 py-3">Trạng thái</TableHead>
                  <TableHead className="px-4 py-3">Lịch đăng</TableHead>
                  <TableHead className="px-4 py-3">Cập nhật</TableHead>
                  <TableHead className="w-24 px-4 py-3">
                    <span className="sr-only">Thao tác</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.data.items.map((post) => (
                  <TableRow key={post.id}>
                    <TableCell className="max-w-xs px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          <ImageIcon aria-hidden="true" />
                        </span>
                        <Link
                          href={`/posts/${post.id}`}
                          className="truncate font-medium hover:text-primary hover:underline"
                        >
                          {post.title}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">
                      {post.channel.name}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <StatusBadge status={post.status} />
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">
                      {formatDate(post.scheduledAt)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">
                      {formatDate(post.updatedAt)}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Link
                          href={`/posts/${post.id}`}
                          aria-label={`Sửa ${post.title}`}
                          className={buttonVariants({ variant: 'ghost', size: 'icon' })}
                        >
                          <Pencil aria-hidden="true" />
                        </Link>
                        {post.status === 'DRAFT' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Xóa ${post.title}`}
                            onClick={() => setDeleting(post)}
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="mt-4 space-y-3 md:hidden">
            {posts.data.items.map((post) => (
              <li key={post.id} className={surfaceVariants({ padding: 'sm' })}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/posts/${post.id}`}
                      className="block truncate font-medium hover:text-primary"
                    >
                      {post.title}
                    </Link>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {post.channel.name}
                    </p>
                  </div>
                  <StatusBadge status={post.status} />
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                  <p className="text-xs text-muted-foreground">
                    Cập nhật {formatDate(post.updatedAt)}
                  </p>
                  {post.status === 'DRAFT' && (
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(post)}>
                      <Trash2 aria-hidden="true" /> Xóa
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <nav
            className="mt-5 flex items-center justify-between gap-4"
            aria-label="Phân trang bài viết"
          >
            <p className="text-sm text-muted-foreground">
              Trang {posts.data.page} / {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={posts.data.page <= 1}
                onClick={() => update({ page: posts.data.page - 1 })}
              >
                <ChevronLeft aria-hidden="true" /> Trước
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={posts.data.page >= totalPages}
                onClick={() => update({ page: posts.data.page + 1 })}
              >
                Sau <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          </nav>
        </>
      )}

      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setDeleting(null);
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={!remove.isPending}>
          <DialogHeader>
            <DialogTitle>Xóa bản nháp?</DialogTitle>
            <DialogDescription>
              “{deleting?.title}” sẽ bị xóa vĩnh viễn. Thao tác này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          {remove.error && (
            <p role="alert" className="text-sm text-danger">
              {remove.error instanceof ApiError
                ? remove.error.message
                : 'Không thể xóa bài viết.'}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={remove.isPending}>
                Hủy
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => deleting && remove.mutate(deleting)}
            >
              {remove.isPending ? 'Đang xóa…' : 'Xóa bản nháp'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
