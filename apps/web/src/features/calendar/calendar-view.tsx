'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { accountsKey, type Account } from '@/features/accounts/accounts-manager';
import { apiGet } from '@/lib/api-client';
import { surfaceVariants } from '@/styles/variants';

const labels: Record<string, string> = {
  SCHEDULED: 'Chờ đăng',
  PUBLISHING: 'Đang đăng',
  PUBLISHED: 'Đã đăng',
  FAILED: 'Thất bại',
};
type CalendarItem = {
  id: string;
  title: string;
  status: string;
  scheduledAt: string;
  channel: { name: string; platform: string };
};
export function CalendarView({ month, channel }: { month: string; channel: string }) {
  const router = useRouter();
  const [year, number] = month.split('-').map(Number);
  const from = new Date(month + '-01T00:00:00+07:00').toISOString();
  const to = new Date(Date.UTC(year, number, 1) - 7 * 3600000).toISOString();
  const params = new URLSearchParams({ from, to, ...(channel ? { channel } : {}) });
  const calendar = useQuery({
    queryKey: ['calendar', month, channel],
    queryFn: ({ signal }) =>
      apiGet<{ items: CalendarItem[]; total: number }>('/calendar?' + params, signal),
    refetchInterval: (query) =>
      query.state.data?.items.some((p) => ['SCHEDULED', 'PUBLISHING'].includes(p.status))
        ? 5000
        : false,
  });
  const accounts = useQuery({
    queryKey: accountsKey,
    queryFn: ({ signal }) => apiGet<Account[]>('/channels', signal),
  });
  const update = (nextMonth: string, nextChannel: string) =>
    router.push(
      '/calendar?' +
        new URLSearchParams({
          month: nextMonth,
          ...(nextChannel ? { channel: nextChannel } : {}),
        }),
    );
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(year, number - 1, 1)).getUTCDay() + 6) % 7;
  const groups = Array.from({ length: days }, (_, i) => ({
    day: i + 1,
    items: (calendar.data?.items ?? []).filter(
      (p) =>
        Number(
          new Date(new Date(p.scheduledAt).getTime() + 7 * 3600000)
            .toISOString()
            .slice(8, 10),
        ) ===
        i + 1,
    ),
  }));
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Giờ Việt Nam (UTC+7). Mở bài viết để đổi lịch, hủy lịch hoặc xem kết quả. Không có
        bước chờ duyệt.
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label htmlFor="calendar-month">Tháng</Label>
          <Input
            id="calendar-month"
            type="month"
            min="2000-01"
            max="2099-12"
            value={month}
            className="mt-2"
            onChange={(e) => {
              if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(e.target.value))
                update(e.target.value, channel);
            }}
          />
        </div>
        <div>
          <Label id="calendar-account">Tài khoản đăng</Label>
          <Select
            value={channel || 'all'}
            onValueChange={(value) => update(month, value === 'all' ? '' : value)}
          >
            <SelectTrigger aria-labelledby="calendar-account" className="mt-2 min-w-48">
              <SelectValue placeholder="Mọi tài khoản" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Mọi tài khoản</SelectItem>
              {accounts.data?.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} · {a.platform}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            update(new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7), channel)
          }
        >
          Tháng hiện tại
        </Button>
      </div>
      {calendar.isPending ? (
        <p role="status">Đang tải lịch…</p>
      ) : calendar.isError ? (
        <div role="alert">
          Chưa tải được lịch.
          <Button onClick={() => void calendar.refetch()}>Thử lại</Button>
        </div>
      ) : (
        <>
          <p className="text-sm">
            {calendar.data.total} bài trong tháng
            {calendar.data.total > 500
              ? ' · Đang hiển thị 500 bài đầu, lọc tài khoản để thu hẹp kết quả.'
              : ''}
          </p>
          {!calendar.data.total && (
            <p className={surfaceVariants()}>Chưa có lịch đăng trong tháng này.</p>
          )}
          <div className="hidden grid-cols-7 gap-2 lg:grid">
            {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((day) => (
              <p key={day} className="text-center text-sm font-medium">
                {day}
              </p>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-7">
            {Array.from({ length: offset }, (_, i) => (
              <div className="hidden lg:block" key={'blank-' + i} />
            ))}
            {groups.map(({ day, items }) => (
              <section
                key={day}
                className={
                  'min-w-0 rounded-xl border bg-card p-3 lg:min-h-32 ' +
                  (items.length ? '' : 'hidden lg:block')
                }
              >
                <h2 className="text-sm font-semibold">Ngày {day}</h2>
                <ul className="mt-2 space-y-2">
                  {items.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={'/posts/' + p.id}
                        className="block rounded-lg bg-muted p-2 text-xs hover:bg-accent"
                      >
                        <span className="block font-semibold break-words">{p.title}</span>
                        <span className="mt-1 block break-words">
                          {p.channel.name} · {p.channel.platform}
                        </span>
                        <span className="mt-1 block">
                          {new Date(p.scheduledAt).toLocaleTimeString('vi-VN', {
                            timeZone: 'Asia/Ho_Chi_Minh',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          · {labels[p.status] ?? p.status}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
