import { ApiStatus } from '@/features/system/api-status';
import { cn } from '@/lib/utils';
import { typographyVariants } from '@/styles/variants';

export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen max-w-page px-5 py-12 sm:px-8">
      <header className="mb-10 border-b border-border pb-6">
        <p className={typographyVariants({ variant: 'eyebrow', tone: 'primary' })}>
          SOCIALFLOW
        </p>
        <h1 className={cn(typographyVariants({ variant: 'pageTitle' }), 'mt-3')}>
          Không gian nội dung
        </h1>
        <p
          className={cn(
            typographyVariants({ variant: 'bodySmall', tone: 'muted' }),
            'mt-3 max-w-xl',
          )}
        >
          Nền tảng đang được chuẩn bị. Các chức năng quản lý bài viết, lịch đăng và kênh
          nội dung sẽ được xây dựng tại đây.
        </p>
      </header>
      <ApiStatus />
    </main>
  );
}
