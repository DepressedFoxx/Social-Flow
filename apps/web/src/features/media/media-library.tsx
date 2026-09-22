'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  FileImage,
  HardDrive,
  ImagePlus,
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
import { sessionKey, type AuthSession } from '@/features/auth/types';
import { API_URL, ApiError, apiGet, apiRequest } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { surfaceVariants } from '@/styles/variants';
import {
  mediaKey,
  type MediaFilters,
  type MediaLibraryData,
  type MediaLibraryItem,
} from './types';

function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

export function MediaLibrary({ initialFilters }: { initialFilters: MediaFilters }) {
  const router = useRouter();
  const client = useQueryClient();
  const [search, setSearch] = useState(initialFilters.q);
  const [deleting, setDeleting] = useState<MediaLibraryItem | null>(null);
  const params = useMemo(() => {
    const result = new URLSearchParams();
    if (initialFilters.q) result.set('q', initialFilters.q);
    if (initialFilters.page > 1) result.set('page', String(initialFilters.page));
    return result;
  }, [initialFilters]);
  const queryString = params.toString();
  const media = useQuery({
    queryKey: [...mediaKey, queryString],
    queryFn: ({ signal }) =>
      apiGet<MediaLibraryData>(`/media${queryString ? `?${queryString}` : ''}`, signal),
    retry: false,
  });
  const update = useCallback(
    (filters: Partial<MediaFilters>) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(filters)) {
        if (!value || value === 1) next.delete(key);
        else next.set(key, String(value));
      }
      router.replace(`/media${next.size ? `?${next}` : ''}`, { scroll: false });
    },
    [params, router],
  );

  useEffect(() => {
    if (search.trim() === initialFilters.q) return;
    const timer = window.setTimeout(() => update({ q: search.trim(), page: 1 }), 300);
    return () => window.clearTimeout(timer);
  }, [initialFilters.q, search, update]);

  const remove = useMutation({
    mutationFn: async (item: MediaLibraryItem) => {
      const session = client.getQueryData<AuthSession>(sessionKey);
      return apiRequest<void>(`/media/${item.id}`, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': session?.csrfToken ?? '' },
      });
    },
    onSuccess: async () => {
      setDeleting(null);
      await client.invalidateQueries({ queryKey: mediaKey });
      if (media.data?.items.length === 1 && initialFilters.page > 1)
        update({ page: initialFilters.page - 1 });
    },
  });

  const allocated = (media.data?.usedBytes ?? 0) + (media.data?.reservedBytes ?? 0);
  const percent = media.data
    ? Math.min(100, (allocated / media.data.quotaBytes) * 100)
    : 0;
  const pages = Math.max(1, Math.ceil((media.data?.total ?? 0) / 20));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Theo dõi dung lượng và quản lý ảnh đã upload trong workspace.
        </p>
        <Link href="/posts/new" className={buttonVariants()}>
          <ImagePlus aria-hidden="true" /> Upload qua bài viết
        </Link>
      </div>

      {media.data && (
        <section className={cn(surfaceVariants(), 'mt-6')} aria-labelledby="quota-title">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-label text-primary">
                Gói{' '}
                {media.data.planCode === 'PERSONAL' ? 'Personal' : media.data.planCode}
              </p>
              <h2 id="quota-title" className="mt-2 text-lg font-semibold">
                Dung lượng media
              </h2>
            </div>
            <HardDrive className="text-primary" aria-hidden="true" />
          </div>
          <div className="mt-5 h-3 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="mt-3 flex flex-wrap justify-between gap-2 text-sm">
            <span>
              Đã dùng <strong>{bytes(media.data.usedBytes)}</strong>
            </span>
            <span className="text-muted-foreground">
              Còn {bytes(media.data.remainingBytes)} / {bytes(media.data.quotaBytes)}
            </span>
          </div>
          {media.data.reservedBytes > 0 && (
            <p className="mt-2 text-xs text-warning">
              {bytes(media.data.reservedBytes)} đang được giữ chỗ cho upload chưa hoàn
              tất.
            </p>
          )}
        </section>
      )}

      <section className={cn(surfaceVariants({ padding: 'sm' }), 'mt-6')}>
        <label className="relative block">
          <span className="sr-only">Tìm media</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            className="h-control pl-9"
            value={search}
            placeholder="Tìm theo tên file…"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </section>

      {media.isPending ? (
        <div
          aria-busy="true"
          aria-label="Đang tải media"
          className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-64 animate-pulse rounded-xl bg-card" />
          ))}
        </div>
      ) : media.isError ? (
        <section className={cn(surfaceVariants(), 'mt-4')}>
          <h2 className="font-semibold">Chưa tải được thư viện media</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Hãy kiểm tra kết nối và thử lại.
          </p>
          <Button className="mt-4" variant="outline" onClick={() => void media.refetch()}>
            Thử lại
          </Button>
        </section>
      ) : media.data.items.length === 0 ? (
        <section className={cn(surfaceVariants(), 'mt-4 py-12 text-center')}>
          <FileImage className="mx-auto text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-4 font-semibold">
            {initialFilters.q ? 'Không tìm thấy media' : 'Chưa có media'}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {initialFilters.q
              ? 'Thử thay đổi tên file cần tìm.'
              : 'Ảnh upload trong trình soạn bài sẽ xuất hiện tại đây.'}
          </p>
        </section>
      ) : (
        <>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {media.data.items.map((item) => (
              <li key={item.id} className="overflow-hidden rounded-xl border bg-card">
                <div className="relative aspect-video bg-muted">
                  {item.contentPath ? (
                    <Image
                      src={`${API_URL}${item.contentPath}?v=${encodeURIComponent(item.id)}`}
                      alt={item.filename}
                      fill
                      sizes="(max-width: 640px) 100vw, 33vw"
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center text-muted-foreground">
                      <FileImage aria-hidden="true" />
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <p className="truncate text-sm font-medium" title={item.filename}>
                    {item.filename}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {bytes(item.size)} ·{' '}
                    {new Date(item.createdAt).toLocaleString('vi-VN')}
                  </p>
                  <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3">
                    {item.post ? (
                      <Link
                        href={`/posts/${item.post.id}`}
                        className="truncate text-xs text-primary hover:underline"
                      >
                        Đang dùng trong {item.post.title}
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Chưa gắn vào bài
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Xóa ${item.filename}`}
                      disabled={Boolean(item.post)}
                      title={item.post ? 'Bỏ ảnh khỏi bài viết trước khi xóa' : undefined}
                      onClick={() => setDeleting(item)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <nav
            className="mt-5 flex items-center justify-between gap-4"
            aria-label="Phân trang media"
          >
            <p className="text-sm text-muted-foreground">
              Trang {media.data.page} / {pages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={media.data.page <= 1}
                onClick={() => update({ page: media.data.page - 1 })}
              >
                <ChevronLeft aria-hidden="true" /> Trước
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={media.data.page >= pages}
                onClick={() => update({ page: media.data.page + 1 })}
              >
                Sau <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          </nav>
        </>
      )}

      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xóa media?</DialogTitle>
            <DialogDescription>
              “{deleting?.filename}” sẽ bị xóa vĩnh viễn và giải phóng dung lượng.
            </DialogDescription>
          </DialogHeader>
          {remove.error && (
            <p role="alert" className="text-sm text-danger">
              {remove.error instanceof ApiError
                ? remove.error.message
                : 'Không thể xóa media.'}
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
              {remove.isPending ? 'Đang xóa…' : 'Xóa media'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
