'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, AUTH_EXPIRED_EVENT, ApiError } from '@/lib/api-client';
import { sessionKey, type AuthSession } from './types';
import { Button } from '@/components/ui/button';

export function SessionBoundary({
  initialSession,
  children,
}: {
  initialSession: AuthSession;
  children: ReactNode;
}) {
  const client = useQueryClient();
  const [expired, setExpired] = useState(false);
  const session = useQuery({
    queryKey: sessionKey,
    queryFn: ({ signal }) => apiGet<AuthSession>('/auth/me', signal),
    initialData: initialSession,
    staleTime: 0,
    refetchInterval: 60_000,
    retry: false,
    enabled: !expired,
  });
  const expire = useCallback(() => {
    setExpired(true);
    void client.cancelQueries().then(() => {
      window.location.replace('/login?reason=expired');
    });
  }, [client]);

  useEffect(() => {
    window.addEventListener(AUTH_EXPIRED_EVENT, expire);
    const channel =
      typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel('socialflow-auth')
        : null;
    if (channel)
      channel.onmessage = (event) => {
        if (event.data === 'logout') {
          setExpired(true);
          void client.cancelQueries().then(() => window.location.replace('/login'));
        }
      };
    const revalidate = () => {
      void client.invalidateQueries({ queryKey: sessionKey });
    };
    window.addEventListener('pageshow', revalidate);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, expire);
      window.removeEventListener('pageshow', revalidate);
      channel?.close();
    };
  }, [client, expire]);

  useEffect(() => {
    if (session.error instanceof ApiError && session.error.status === 401) {
      void client.cancelQueries().then(() => {
        window.location.replace('/login?reason=expired');
      });
    }
  }, [session.error, client]);
  if (expired || (session.error instanceof ApiError && session.error.status === 401))
    return (
      <p role="status" className="p-6 text-muted-foreground">
        Phiên đã hết hạn. Đang chuyển đến trang đăng nhập…
      </p>
    );
  if (session.isError)
    return (
      <div role="alert" className="mx-auto max-w-page p-6">
        <p>Không thể kiểm tra phiên đăng nhập. Vui lòng thử lại.</p>
        <Button
          className="mt-4"
          disabled={session.isFetching}
          onClick={() => void session.refetch()}
        >
          Thử lại
        </Button>
      </div>
    );
  return children;
}
