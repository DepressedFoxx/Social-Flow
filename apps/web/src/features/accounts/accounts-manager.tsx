'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { sessionKey, type AuthSession } from '@/features/auth/types';
import { apiGet, apiRequest } from '@/lib/api-client';
import { surfaceVariants } from '@/styles/variants';

export type Account = {
  id: string;
  name: string;
  platform: string;
  externalId: string | null;
  isMock: boolean;
  isActive: boolean;
  connected: boolean;
  expiresAt: string | null;
  _count: { posts: number };
};
type Candidate = {
  key: string;
  id: string;
  name: string;
  platform: string;
  pageId: string;
};
export const accountsKey = ['accounts'] as const;
export function AccountsManager({ result }: { result?: string }) {
  const client = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [disconnect, setDisconnect] = useState<Account | null>(null);
  const accounts = useQuery({
    queryKey: accountsKey,
    queryFn: ({ signal }) => apiGet<Account[]>('/channels', signal),
  });
  const status = useQuery({
    queryKey: ['meta-status'],
    queryFn: ({ signal }) =>
      apiGet<{ configured: boolean; mediaConfigured: boolean }>(
        '/connections/meta/status',
        signal,
      ),
  });
  const pending = useQuery({
    queryKey: ['meta-pending'],
    queryFn: ({ signal }) =>
      apiGet<{ accounts: Candidate[]; expiresAt: string | null }>(
        '/connections/meta/pending',
        signal,
      ),
  });
  const mutation = useMutation({
    mutationFn: async (action: {
      type: 'start' | 'connect' | 'toggle' | 'disconnect';
      account?: Account;
    }) => {
      const session = client.getQueryData<AuthSession>(sessionKey);
      const headers = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': session?.csrfToken ?? '',
      };
      if (action.type === 'start') {
        const { url } = await apiRequest<{ url: string }>('/connections/meta/start', {
          method: 'POST',
          headers,
        });
        window.location.assign(url);
      } else if (action.type === 'connect') {
        await apiRequest('/connections/meta/connect', {
          method: 'POST',
          headers,
          body: JSON.stringify({ keys: selected }),
        });
        setSelected([]);
      } else if (action.type === 'toggle' && action.account) {
        await apiRequest('/channels/' + action.account.id, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ isActive: !action.account.isActive }),
        });
      } else if (action.type === 'disconnect' && action.account) {
        await apiRequest('/connections/meta/' + action.account.id, {
          method: 'DELETE',
          headers,
        });
        setDisconnect(null);
      }
    },
    onSuccess: async () => {
      await Promise.all(
        [accountsKey, sessionKey, ['meta-pending'], ['posts'], ['calendar']].map(
          (queryKey) => client.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
  return (
    <div className="space-y-5">
      <section className={surfaceVariants()}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl space-y-2">
            <h2 className="text-lg font-semibold">Kết nối tài khoản của bạn</h2>
            <p className="text-sm text-muted-foreground">
              Kết nối Facebook để chọn Page bạn quản lý. Bạn có thể đăng bài chữ ngay sau
              khi kết nối; Instagram và ảnh có thể cấu hình sau. Tên và mã Page được lấy
              trực tiếp từ Meta.
            </p>
          </div>
          <Button
            disabled={!status.data?.configured || mutation.isPending}
            onClick={() => mutation.mutate({ type: 'start' })}
          >
            <Link2 className="size-4" />
            Kết nối Meta
          </Button>
        </div>
        {status.isPending && (
          <p role="status" className="mt-4 text-sm">
            Đang kiểm tra kết nối…
          </p>
        )}
        {status.isError && (
          <div role="alert" className="mt-4 text-sm">
            Không thể kiểm tra cấu hình kết nối.{' '}
            <Button variant="outline" onClick={() => void status.refetch()}>
              Thử lại
            </Button>
          </div>
        )}
        {status.data && !status.data.configured && (
          <div className="mt-4 rounded-lg border border-warning bg-warning-subtle p-4 text-sm">
            <h3 className="font-semibold">Kết nối Meta chưa được kích hoạt</h3>
            <p className="mt-2">
              Chủ ứng dụng cần tạo Meta App trước khi kết nối. Có thể thử bài Facebook
              dạng chữ trên localhost nếu Meta cho phép callback local; ảnh cần địa chỉ
              HTTPS công khai. Bạn không cần nhập tên Page hay token vào đây.
            </p>
            <a
              className="mt-3 inline-flex items-center gap-2 underline"
              href="https://developers.facebook.com/apps/"
              target="_blank"
              rel="noreferrer"
            >
              Mở Meta for Developers
              <ExternalLink className="size-3" />
            </a>
          </div>
        )}
        {status.data?.configured && !status.data.mediaConfigured && (
          <p className="mt-4 text-sm text-warning">
            Máy chủ chưa sẵn sàng chia sẻ ảnh với Meta. Hiện chỉ có thể đăng bài Facebook
            không kèm ảnh.
          </p>
        )}
        {result === 'cancelled' && (
          <p role="status" className="mt-4 text-sm">
            Bạn đã hủy cấp quyền. Có thể kết nối lại bất cứ lúc nào.
          </p>
        )}
        {result === 'failed' && (
          <p role="alert" className="mt-4 text-sm text-danger">
            Kết nối chưa thành công hoặc phiên đã hết hạn. Hãy kết nối lại và cấp quyền
            quản lý Page cần dùng.
          </p>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Không hỗ trợ đăng lên trang cá nhân Facebook. Bạn quyết định đăng ngay hoặc lên
          lịch sau khi kết nối.
        </p>
      </section>
      {mutation.error && (
        <p role="alert" className="rounded-lg border p-3 text-sm text-danger">
          {mutation.error.message}
        </p>
      )}
      {pending.isError && (
        <div role="alert">
          Chưa tải được danh sách Meta.{' '}
          <Button variant="outline" onClick={() => void pending.refetch()}>
            Thử lại
          </Button>
        </div>
      )}
      {pending.data?.expiresAt && (
        <section className={surfaceVariants()}>
          <h2 className="font-semibold">Chọn tài khoản được Meta cấp quyền</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Chỉ những tài khoản bạn chọn mới được thêm vào workspace. Danh sách có hiệu
            lực 10 phút.
          </p>
          {pending.data.accounts.length ? (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {pending.data.accounts.map((account) => (
                  <Button
                    key={account.key}
                    variant={selected.includes(account.key) ? 'default' : 'outline'}
                    aria-pressed={selected.includes(account.key)}
                    className="h-auto min-h-16 justify-start whitespace-normal text-left"
                    onClick={() =>
                      setSelected((current) =>
                        current.includes(account.key)
                          ? current.filter((key) => key !== account.key)
                          : [...current, account.key],
                      )
                    }
                  >
                    {selected.includes(account.key) && (
                      <Check className="size-4 shrink-0" />
                    )}
                    <span className="min-w-0 break-words">
                      {account.name}
                      <span className="block text-xs">
                        {account.platform} · ID {account.id}
                      </span>
                    </span>
                  </Button>
                ))}
              </div>
              <Button
                className="mt-4"
                disabled={!selected.length || mutation.isPending}
                onClick={() => mutation.mutate({ type: 'connect' })}
              >
                Kết nối {selected.length} tài khoản
              </Button>
            </>
          ) : (
            <p className="mt-4 text-sm">
              Không có tài khoản đủ quyền đăng bài. Kiểm tra quyền quản lý và xuất bản
              Page trong Meta.
            </p>
          )}
        </section>
      )}
      <section>
        <h2 className="mb-4 font-semibold">Tài khoản đã kết nối</h2>
        {accounts.isPending ? (
          <p role="status">Đang tải tài khoản…</p>
        ) : accounts.isError ? (
          <div role="alert">
            Chưa tải được tài khoản.{' '}
            <Button onClick={() => void accounts.refetch()}>Thử lại</Button>
          </div>
        ) : accounts.data.length === 0 ? (
          <div className={surfaceVariants()}>
            <h3 className="font-medium">Chưa có tài khoản đăng</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Kết nối Meta và chọn tài khoản trước khi tạo bài viết. Tài khoản mẫu cũ
              không được dùng để xuất bản thật; nội dung bài cũ vẫn được giữ lại.
            </p>
          </div>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {accounts.data.map((account) => (
              <li className={surfaceVariants()} key={account.id}>
                <h3 className="font-semibold break-words">{account.name}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {account.platform} ·{' '}
                  {account.connected
                    ? account.isActive
                      ? 'Sẵn sàng'
                      : 'Tạm dừng / cần kết nối lại'
                    : 'Đã ngắt kết nối'}
                </p>
                <p className="mt-2 break-all text-xs text-muted-foreground">
                  ID: {account.externalId}
                </p>
                {account.expiresAt && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Cấp quyền lại trước{' '}
                    {new Date(account.expiresAt).toLocaleDateString('vi-VN')}
                  </p>
                )}
                <Link
                  className="mt-3 block text-sm text-primary underline"
                  href={'/posts?channel=' + account.id}
                >
                  {account._count.posts} bài viết
                </Link>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={!account.connected || mutation.isPending}
                    onClick={() => mutation.mutate({ type: 'toggle', account })}
                  >
                    {account.isActive ? 'Tạm dừng' : 'Bật tài khoản'}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!status.data?.configured || mutation.isPending}
                    onClick={() => mutation.mutate({ type: 'start' })}
                  >
                    Kết nối lại
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!account.connected || mutation.isPending}
                    onClick={() => setDisconnect(account)}
                  >
                    Ngắt kết nối
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Dialog
        open={Boolean(disconnect)}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setDisconnect(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ngắt kết nối {disconnect?.name}?</DialogTitle>
            <DialogDescription>
              Thông tin cấp quyền của tài khoản này sẽ bị xóa khỏi SocialFlow. Bài đang
              lên lịch sẽ trở về nháp; bài đã gửi tới Meta có thể vẫn hoàn tất. Nội dung
              bài được giữ lại.
            </DialogDescription>
          </DialogHeader>
          {mutation.error && (
            <p role="alert" className="text-danger">
              {mutation.error.message}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setDisconnect(null)}
            >
              Giữ kết nối
            </Button>
            <Button
              disabled={mutation.isPending}
              onClick={() => {
                if (disconnect)
                  mutation.mutate({ type: 'disconnect', account: disconnect });
              }}
            >
              Xác nhận ngắt kết nối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
