'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { sessionKey, type AuthSession } from '@/features/auth/types';
import { dashboardKey } from '@/features/dashboard/types';
import { apiRequest } from '@/lib/api-client';
import { surfaceVariants } from '@/styles/variants';
import { postsKey, type PostItem } from './types';

function vietnamInput(iso: string) {
  return new Date(new Date(iso).getTime() + 7 * 60 * 60_000).toISOString().slice(0, 16);
}
export function PostSchedule({ post, blocked }: { post?: PostItem; blocked: boolean }) {
  const client = useQueryClient();
  const [date, setDate] = useState(() =>
    post?.scheduledAt ? vietnamInput(post.scheduledAt) : '',
  );
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmUncertain, setConfirmUncertain] = useState(false);
  const uncertain = post?.attempts?.[0]?.errorCode === 'PUBLISH_UNCERTAIN';
  const scheduled = post?.status === 'SCHEDULED';
  const allowed = post && ['DRAFT', 'FAILED', 'SCHEDULED'].includes(post.status);
  const reason = uncertain
    ? 'Kết quả chưa xác định. Kiểm tra tài khoản trước khi thử lại.'
    : post?.channel.isMock
      ? 'Tài khoản mẫu cũ không thể đăng thật. Chọn một tài khoản Meta đã kết nối.'
      : !post
        ? 'Lưu bản nháp trước khi lên lịch.'
        : blocked
          ? 'Lưu các thay đổi và đợi upload hoàn tất trước khi lên lịch.'
          : post && !post.channel.isActive
            ? 'Tài khoản đăng đang tạm dừng.'
            : !allowed
              ? 'Trạng thái hiện tại không cho phép thay đổi lịch.'
              : !post.content.trim()
                ? 'Bổ sung nội dung bài viết trước khi lên lịch.'
                : post.channel.platform === 'INSTAGRAM' && !post.media.length
                  ? 'Bài Instagram cần ít nhất một ảnh.'
                  : '';
  const mutation = useMutation({
    mutationFn: async (action: 'cancel' | 'schedule' | 'now' | 'acknowledge') => {
      const cancel = action === 'cancel';
      if (!post) throw new Error('Hãy lưu bản nháp trước.');
      const at = new Date(date + ':00+07:00');
      if (
        action === 'schedule' &&
        (!date || !Number.isFinite(at.getTime()) || at.getTime() < Date.now() + 300_000)
      )
        throw new Error('Chọn thời gian cách hiện tại ít nhất 5 phút.');
      const session = client.getQueryData<AuthSession>(sessionKey);
      return apiRequest<PostItem>(
        '/posts/' +
          post.id +
          (action === 'acknowledge'
            ? '/acknowledge-uncertain'
            : action === 'now'
              ? '/publish'
              : '/schedule'),
        {
          method: cancel
            ? 'DELETE'
            : action === 'now' || action === 'acknowledge'
              ? 'POST'
              : scheduled
                ? 'PATCH'
                : 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': session?.csrfToken ?? '',
            'If-Match': String(post.version),
          },
          ...(cancel
            ? {}
            : {
                body: JSON.stringify({
                  expectedVersion: post.version,
                  ...(action === 'now' || action === 'acknowledge'
                    ? {}
                    : { scheduledAt: at.toISOString() }),
                }),
              }),
        },
      );
    },
    onSuccess: async (result) => {
      setConfirmUncertain(false);
      setConfirmCancel(false);
      setConfirmPublish(false);
      client.setQueryData([...postsKey, 'detail', result.id], result);
      await Promise.all([
        client.invalidateQueries({ queryKey: postsKey }),
        client.invalidateQueries({ queryKey: dashboardKey }),
        client.invalidateQueries({ queryKey: ['calendar'] }),
      ]);
    },
  });
  return (
    <section className={surfaceVariants()} aria-labelledby="schedule-title">
      <h2 id="schedule-title" className="font-semibold">
        Lịch đăng
      </h2>
      <p className="mt-2 text-xs text-muted-foreground">
        Giờ Việt Nam · Asia/Ho_Chi_Minh (UTC+7)
      </p>
      {post?.scheduledAt && (
        <p className="mt-3 text-sm" role="status">
          Đã lên lịch:{' '}
          {new Date(post.scheduledAt).toLocaleString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
          })}
        </p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Bài viết sẽ được đăng lên tài khoản Meta đã chọn khi bạn xác nhận đăng ngay hoặc
        đến giờ đã lên lịch.
      </p>
      {uncertain && (
        <div className="mt-4 rounded-lg border border-warning p-3 text-sm">
          <p>
            Chưa rõ Meta đã nhận bài hay chưa. Hãy mở tài khoản đích để kiểm tra; gửi lại
            ngay có thể tạo bài trùng.
          </p>
          <Button
            className="mt-3"
            variant="outline"
            onClick={() => setConfirmUncertain(true)}
          >
            Tôi đã kiểm tra tài khoản
          </Button>
        </div>
      )}
      <Dialog open={confirmUncertain} onOpenChange={setConfirmUncertain}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận chưa có bài trên tài khoản?</DialogTitle>
            <DialogDescription>
              Chỉ tiếp tục nếu bạn đã kiểm tra trực tiếp và chắc chắn bài này chưa được
              đăng. Xác nhận sẽ cho phép bạn thử lại, chưa gửi bài ngay.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmUncertain(false)}>
              Quay lại
            </Button>
            <Button
              disabled={mutation.isPending}
              onClick={() => mutation.mutate('acknowledge')}
            >
              Xác nhận bài chưa được đăng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Label htmlFor="schedule-at" className="mt-4 block">
        Ngày và giờ đăng
      </Label>
      <Input
        id="schedule-at"
        type="datetime-local"
        value={date}
        onChange={(event) => setDate(event.target.value)}
        disabled={Boolean(reason) || mutation.isPending}
        className="mt-2 w-full min-w-0"
        aria-describedby="schedule-help"
      />
      <p id="schedule-help" className="mt-2 text-xs text-muted-foreground">
        {reason || 'Lịch đăng cần cách thời gian server ít nhất 5 phút.'}
      </p>
      {mutation.error && (
        <div role="alert" className="mt-3 text-sm text-danger">
          <p>{mutation.error.message}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-2"
            onClick={() => void client.invalidateQueries({ queryKey: postsKey })}
          >
            Tải lại dữ liệu
          </Button>
        </div>
      )}
      <Button
        type="button"
        className="mt-4 w-full"
        disabled={Boolean(reason) || !date || mutation.isPending}
        onClick={() => mutation.mutate('schedule')}
      >
        {mutation.isPending
          ? 'Đang cập nhật…'
          : scheduled
            ? 'Đổi lịch'
            : post?.status === 'FAILED'
              ? 'Lên lịch thử lại'
              : 'Lên lịch'}
      </Button>
      {scheduled && (
        <Button
          type="button"
          variant="outline"
          className="mt-2 w-full"
          disabled={mutation.isPending}
          onClick={() => setConfirmCancel(true)}
        >
          Hủy lịch
        </Button>
      )}
      <Dialog
        open={confirmCancel}
        onOpenChange={(open) => {
          if (!mutation.isPending) setConfirmCancel(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hủy lịch đăng?</DialogTitle>
            <DialogDescription>
              Bài viết sẽ trở về bản nháp để bạn chỉnh sửa. Nội dung và ảnh được giữ
              nguyên.
            </DialogDescription>
          </DialogHeader>
          {mutation.error && (
            <p role="alert" className="text-sm text-danger">
              {mutation.error.message}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setConfirmCancel(false)}
            >
              Giữ lịch
            </Button>
            <Button
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate('cancel')}
            >
              Xác nhận hủy lịch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {post && (
        <p className="mt-3 text-sm font-medium">
          Tài khoản đích: {post.channel.name} · {post.channel.platform}
        </p>
      )}
      {(!post || ['DRAFT', 'FAILED'].includes(post.status)) && (
        <Button
          type="button"
          className="mt-3 w-full"
          variant="outline"
          disabled={Boolean(reason) || mutation.isPending}
          onClick={() => setConfirmPublish(true)}
        >
          Đăng ngay
        </Button>
      )}
      {post?.status === 'PUBLISHING' && (
        <p role="status" className="mt-3 text-sm">
          Đang gửi bài tới Meta… Kết quả sẽ tự cập nhật.
        </p>
      )}
      {post?.status === 'PUBLISHED' && (
        <p role="status" className="mt-3 text-sm text-success">
          Đăng bài thành công.
        </p>
      )}
      <Dialog
        open={confirmPublish}
        onOpenChange={(open) => {
          if (!mutation.isPending) setConfirmPublish(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đăng bài ngay?</DialogTitle>
            <DialogDescription>
              Bài sẽ được gửi tới {post?.channel.name} ({post?.channel.platform}) để đăng
              ngay khi hệ thống xử lý. Đây là thao tác đăng bài thật.
            </DialogDescription>
          </DialogHeader>
          {mutation.error && (
            <p role="alert" className="text-danger">
              {mutation.error.message}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setConfirmPublish(false)}
            >
              Quay lại
            </Button>
            <Button
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate('now')}
            >
              Xác nhận đăng ngay
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {Boolean(post?.attempts?.length) && (
        <div className="mt-5 border-t pt-4">
          <h3 className="text-sm font-semibold">Lịch sử đăng (20 lần gần nhất)</h3>
          <ul className="mt-3 space-y-3">
            {post?.attempts.map((attempt) => (
              <li key={attempt.id} className="rounded-lg bg-muted p-3 text-xs">
                <p>
                  {new Date(attempt.startedAt).toLocaleString('vi-VN', {
                    timeZone: 'Asia/Ho_Chi_Minh',
                  })}{' '}
                  ·{' '}
                  {attempt.status === 'PUBLISHED'
                    ? 'Đã đăng'
                    : attempt.status === 'FAILED'
                      ? 'Thất bại'
                      : 'Đang xử lý'}
                </p>
                {attempt.errorMessage && (
                  <p className="mt-2 text-danger">{attempt.errorMessage}</p>
                )}
                {attempt.externalPostId && (
                  <p className="mt-2 break-all text-muted-foreground">
                    Mã kết quả: {attempt.externalPostId}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
