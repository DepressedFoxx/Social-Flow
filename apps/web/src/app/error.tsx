'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ErrorPage({ reset }: { reset: () => void }) {
  const retryKey = 'socialflow:last-route-retry';
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const lastRetry = Number(window.sessionStorage.getItem(retryKey) ?? 0);
    if (Date.now() - lastRetry < 10_000) return;
    const start = window.setTimeout(() => setRetrying(true), 0);
    const timeout = window.setTimeout(() => {
      window.sessionStorage.setItem(retryKey, String(Date.now()));
      reset();
      setRetrying(false);
    }, 1_000);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(timeout);
    };
  }, [reset]);

  return (
    <main className="mx-auto max-w-page p-6">
      <h1 className="text-xl font-semibold">Chưa thể tải trang</h1>
      <p role="alert" className="mt-3 text-muted-foreground">
        Kết nối API đang gián đoạn. SocialFlow sẽ tự thử lại, bạn không cần tải lại toàn
        bộ trang.
      </p>
      <Button
        className="mt-4"
        disabled={retrying}
        onClick={() => {
          setRetrying(true);
          window.sessionStorage.setItem(retryKey, String(Date.now()));
          reset();
        }}
      >
        {retrying && <RefreshCw className="animate-spin" aria-hidden="true" />}
        {retrying ? 'Đang kết nối lại…' : 'Thử lại'}
      </Button>
    </main>
  );
}
