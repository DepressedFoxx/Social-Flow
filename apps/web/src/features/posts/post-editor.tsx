'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, LoaderCircle, Save } from 'lucide-react';
import { z } from 'zod';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { sessionKey, type AuthSession } from '@/features/auth/types';
import { dashboardKey } from '@/features/dashboard/types';
import { ApiError, apiGet, apiRequest } from '@/lib/api-client';
import { surfaceVariants } from '@/styles/variants';
import { existingMedia, MediaUploader, type EditorMedia } from './media-uploader';
import { postsKey, type PostItem } from './types';

const schema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Vui lòng nhập tiêu đề.')
    .max(100, 'Tiêu đề tối đa 100 ký tự.'),
  content: z.string().max(2000, 'Nội dung tối đa 2.000 ký tự.'),
  channelId: z.string().min(1, 'Vui lòng chọn kênh.'),
});
type Fields = z.infer<typeof schema>;

export function PostEditor({
  channels,
  postId,
}: {
  channels: AuthSession['workspace']['channels'];
  postId?: string;
}) {
  const router = useRouter();
  const client = useQueryClient();
  const [clientRequestId] = useState(() => crypto.randomUUID());
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [mediaOverride, setMediaOverride] = useState<EditorMedia[] | null>(null);
  const [mediaDirty, setMediaDirty] = useState(false);
  const detail = useQuery({
    queryKey: [...postsKey, 'detail', postId],
    queryFn: ({ signal }) => apiGet<PostItem>('/posts/' + postId, signal),
    enabled: Boolean(postId),
    retry: false,
  });
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isDirty },
  } = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', content: '', channelId: channels[0]?.id ?? '' },
  });

  useEffect(() => {
    if (!detail.data) return;
    reset({
      title: detail.data.title,
      content: detail.data.content,
      channelId: detail.data.channel.id,
    });
  }, [detail.data, reset]);

  const media = mediaOverride ?? existingMedia(detail.data?.media ?? []);

  const changeMedia: Dispatch<SetStateAction<EditorMedia[]>> = (next) => {
    setMediaOverride((current) => {
      const value = current ?? existingMedia(detail.data?.media ?? []);
      return typeof next === 'function' ? next(value) : next;
    });
    setMediaDirty(true);
  };

  const dirty = isDirty || mediaDirty;
  const mediaPending = media.some((item) => item.status !== 'success');

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = useMutation({
    mutationFn: async (values: Fields) => {
      const session = client.getQueryData<AuthSession>(sessionKey);
      const common = {
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': session?.csrfToken ?? '',
        },
      };
      if (postId) {
        if (!detail.data) throw new Error('Post detail is not ready');
        return apiRequest<PostItem>('/posts/' + postId, {
          ...common,
          method: 'PATCH',
          body: JSON.stringify({
            ...values,
            mediaAssetIds: media.map((item) => item.id),
            expectedVersion: detail.data.version,
          }),
        });
      }
      return apiRequest<PostItem>('/posts', {
        ...common,
        method: 'POST',
        body: JSON.stringify({
          ...values,
          mediaAssetIds: media.map((item) => item.id),
          clientRequestId,
        }),
      });
    },
    onSuccess: async (post) => {
      reset({ title: post.title, content: post.content, channelId: post.channel.id });
      setMediaOverride(existingMedia(post.media));
      setMediaDirty(false);
      setSavedAt(new Date());
      client.setQueryData([...postsKey, 'detail', post.id], post);
      await Promise.all([
        client.invalidateQueries({ queryKey: postsKey }),
        client.invalidateQueries({ queryKey: dashboardKey }),
      ]);
      if (!postId) router.replace('/posts/' + post.id);
    },
  });

  const title = useWatch({ control, name: 'title' });
  const content = useWatch({ control, name: 'content' });
  const channelId = useWatch({ control, name: 'channelId' });
  const channel = channels.find((item) => item.id === channelId);
  const editable = !detail.data || detail.data.status === 'DRAFT';

  if (postId && detail.isPending)
    return (
      <div aria-busy="true" aria-label="Đang tải bài viết" className="space-y-4">
        <div className="h-12 animate-pulse rounded-xl bg-card motion-reduce:animate-none" />
        <div className="h-96 animate-pulse rounded-xl bg-card motion-reduce:animate-none" />
      </div>
    );
  if (postId && detail.isError)
    return (
      <section className={surfaceVariants()}>
        <h2 className="font-semibold">
          {detail.error instanceof ApiError && detail.error.status === 404
            ? 'Không tìm thấy bài viết'
            : 'Chưa tải được bài viết'}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Bài viết có thể đã bị xóa, không thuộc workspace hoặc kết nối đang gián đoạn.
        </p>
        <div className="mt-5 flex gap-2">
          <Link href="/posts" className={buttonVariants({ variant: 'outline' })}>
            Về danh sách
          </Link>
          <Button onClick={() => void detail.refetch()}>Thử lại</Button>
        </div>
      </section>
    );

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/posts"
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          onClick={(event) => {
            if (dirty && !window.confirm('Bạn có thay đổi chưa lưu. Rời khỏi trang?'))
              event.preventDefault();
          }}
        >
          <ArrowLeft aria-hidden="true" /> Danh sách bài viết
        </Link>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {savedAt && (
            <span className="flex items-center gap-1 text-success" role="status">
              <Check aria-hidden="true" className="size-4" />
              Đã lưu lúc{' '}
              {savedAt.toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
          {detail.data && <span>Phiên bản {detail.data.version}</span>}
        </div>
      </div>

      {!editable && (
        <p
          role="status"
          className="mb-5 rounded-lg bg-warning-subtle p-3 text-sm text-warning"
        >
          Chỉ bản nháp mới có thể chỉnh sửa.
        </p>
      )}
      <form onSubmit={handleSubmit((values) => save.mutate(values))} noValidate>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <section className={surfaceVariants()} aria-labelledby="content-title">
            <h2 id="content-title" className="font-semibold">
              Nội dung bài viết
            </h2>
            <div className="mt-5 space-y-5">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="post-title">Tiêu đề nội bộ</Label>
                  <span className="text-xs text-muted-foreground">
                    {title.length}/100
                  </span>
                </div>
                <Input
                  id="post-title"
                  maxLength={100}
                  disabled={!editable || save.isPending}
                  className="mt-2 h-control bg-card"
                  aria-invalid={Boolean(errors.title)}
                  aria-describedby={errors.title ? 'title-error' : undefined}
                  {...register('title')}
                />
                {errors.title && (
                  <p id="title-error" role="alert" className="mt-2 text-sm text-danger">
                    {errors.title.message}
                  </p>
                )}
              </div>
              <div>
                <Label id="post-channel-label">Kênh đăng</Label>
                <Controller
                  control={control}
                  name="channelId"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={!editable || save.isPending}
                    >
                      <SelectTrigger
                        id="post-channel"
                        aria-labelledby="post-channel-label"
                        aria-invalid={Boolean(errors.channelId)}
                        className="mt-2 h-control w-full bg-card"
                      >
                        <SelectValue placeholder="Chọn kênh" />
                      </SelectTrigger>
                      <SelectContent>
                        {channels.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name} ·{' '}
                            {item.platform === 'FACEBOOK' ? 'Facebook' : 'Instagram'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.channelId && (
                  <p role="alert" className="mt-2 text-sm text-danger">
                    {errors.channelId.message}
                  </p>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="post-content">Nội dung</Label>
                  <span className="text-xs text-muted-foreground">
                    {content.length}/2.000
                  </span>
                </div>
                <Textarea
                  id="post-content"
                  rows={12}
                  maxLength={2000}
                  disabled={!editable || save.isPending}
                  placeholder="Viết nội dung bạn muốn chia sẻ…"
                  className="mt-2 resize-y bg-card py-3 leading-relaxed"
                  aria-invalid={Boolean(errors.content)}
                  {...register('content')}
                />
                {errors.content && (
                  <p role="alert" className="mt-2 text-sm text-danger">
                    {errors.content.message}
                  </p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Bản nháp có thể để trống nội dung.
                </p>
              </div>
              <MediaUploader
                value={media}
                onChange={changeMedia}
                disabled={!editable || save.isPending}
              />
            </div>
          </section>

          <aside className="space-y-4" aria-label="Xem trước và lưu">
            <section className={surfaceVariants()}>
              <h2 className="font-semibold">Xem trước</h2>
              <div className="mt-4 rounded-xl border border-border bg-background p-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                    SF
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {channel?.name ?? 'Chưa chọn kênh'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Bản xem trước mô phỏng
                    </p>
                  </div>
                </div>
                <p className="mt-4 whitespace-pre-wrap wrap-break-word text-sm leading-relaxed text-foreground">
                  {content || 'Nội dung bài viết sẽ hiển thị tại đây.'}
                </p>
                {media.length > 0 && (
                  <div className="mt-4 grid grid-cols-2 gap-1 overflow-hidden rounded-lg">
                    {media.map((item, index) => (
                      <div key={item.localId} className="relative aspect-square bg-muted">
                        <Image
                          src={item.previewUrl}
                          alt={`Xem trước ảnh ${index + 1}`}
                          fill
                          sizes="11rem"
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
            <section className={surfaceVariants()}>
              <h2 className="font-semibold">Lưu bản nháp</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Dữ liệu chỉ được lưu khi bạn nhấn nút bên dưới.
              </p>
              {save.error && (
                <p
                  role="alert"
                  className="mt-3 rounded-md bg-danger-subtle p-3 text-sm text-danger"
                >
                  {save.error instanceof ApiError
                    ? save.error.message
                    : 'Không thể lưu bài viết. Vui lòng thử lại.'}
                </p>
              )}
              <Button
                type="submit"
                className="mt-5 w-full"
                disabled={!editable || save.isPending || !dirty || mediaPending}
              >
                {save.isPending ? (
                  <LoaderCircle
                    className="animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  <Save aria-hidden="true" />
                )}
                {save.isPending ? 'Đang lưu…' : postId ? 'Lưu thay đổi' : 'Lưu bản nháp'}
              </Button>
              {mediaPending && (
                <p className="mt-3 text-xs text-warning" role="status">
                  Hãy đợi ảnh upload xong hoặc xóa ảnh bị lỗi trước khi lưu.
                </p>
              )}
            </section>
          </aside>
        </div>
      </form>
    </div>
  );
}
