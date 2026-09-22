'use client';
import { Button } from '@/components/ui/button';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-page p-6">
      <h1 className="text-xl font-semibold">Chưa thể tải trang</h1>
      <p role="alert" className="mt-3 text-muted-foreground">
        Không thể xác minh dữ liệu lúc này. Vui lòng kiểm tra kết nối và thử lại.
      </p>
      <Button className="mt-4" onClick={reset}>
        Thử lại
      </Button>
    </main>
  );
}
