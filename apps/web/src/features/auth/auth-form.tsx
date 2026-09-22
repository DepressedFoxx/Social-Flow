'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LogIn, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { API_URL, ApiError, apiGet, apiRequest } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { surfaceVariants, typographyVariants } from '@/styles/variants';
import type { AuthSession } from './types';

type Fields = { name: string; email: string; password: string; confirmPassword: string };
const errors: Record<string, string> = {
  cancelled: 'Bạn đã hủy đăng nhập Google. Hãy thử lại khi sẵn sàng.',
  invalid_state: 'Yêu cầu đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng thử lại.',
  provider_error: 'Không thể đăng nhập với Google. Vui lòng thử lại.',
  account_exists: 'Email này đã có tài khoản. Hãy đăng nhập bằng phương thức ban đầu.',
  not_configured:
    'Đăng nhập Google chưa sẵn sàng. Bạn vẫn có thể dùng email và mật khẩu.',
  unavailable: 'Dịch vụ đăng nhập tạm thời không khả dụng. Vui lòng thử lại.',
};

export function AuthForm({
  mode,
  error,
  expired = false,
}: {
  mode: 'login' | 'register';
  error?: string;
  expired?: boolean;
}) {
  const registration = mode === 'register';
  const [submitError, setSubmitError] = useState('');
  const [googlePending, setGooglePending] = useState(false);
  const client = useQueryClient();
  const config = useQuery({
    queryKey: ['auth-config'],
    queryFn: ({ signal }) => apiGet<{ googleEnabled: boolean }>('/auth/config', signal),
    retry: false,
  });
  const schema = z
    .object({
      name: registration
        ? z
            .string()
            .trim()
            .min(2, 'Tên cần ít nhất 2 ký tự.')
            .max(80, 'Tên tối đa 80 ký tự.')
        : z.string(),
      email: z.email('Email không hợp lệ.').max(254, 'Email quá dài.'),
      password: z
        .string()
        .min(
          registration ? 8 : 1,
          registration ? 'Mật khẩu cần ít nhất 8 ký tự.' : 'Vui lòng nhập mật khẩu.',
        )
        .max(128, 'Mật khẩu tối đa 128 ký tự.')
        .refine((value) => !registration || /[A-Z]/.test(value), {
          message: 'Mật khẩu cần ít nhất 1 chữ hoa.',
        })
        .refine((value) => !registration || /[^A-Za-z0-9\s]/.test(value), {
          message: 'Mật khẩu cần ít nhất 1 ký tự đặc biệt.',
        }),
      confirmPassword: z.string(),
    })
    .superRefine((value, ctx) => {
      if (registration && value.password !== value.confirmPassword)
        ctx.addIssue({
          code: 'custom',
          path: ['confirmPassword'],
          message: 'Mật khẩu xác nhận không khớp.',
        });
    });
  const {
    register,
    handleSubmit,
    formState: { errors: fields, isSubmitting },
  } = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  });
  useEffect(() => {
    const reset = () => setGooglePending(false);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  async function submit(values: Fields) {
    setSubmitError('');
    try {
      await apiRequest<AuthSession>('/auth/' + mode, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: values.email.trim().toLowerCase(),
          password: values.password,
          ...(registration ? { name: values.name.trim() } : {}),
        }),
      });
      await client.cancelQueries();
      client.clear();
      // A full navigation also discards any previous user's Next.js router cache.
      window.location.replace('/dashboard');
    } catch (failure) {
      setSubmitError(
        failure instanceof ApiError
          ? failure.message
          : 'Không kết nối được máy chủ. Vui lòng thử lại.',
      );
    }
  }

  const busy = isSubmitting || googlePending;
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <section
        className={cn(surfaceVariants({ padding: 'lg' }), 'w-full max-w-md')}
        aria-labelledby="auth-title"
      >
        <p className={typographyVariants({ variant: 'eyebrow', tone: 'primary' })}>
          SOCIALFLOW
        </p>
        <h1
          id="auth-title"
          className={cn(typographyVariants({ variant: 'pageTitle' }), 'mt-3')}
        >
          {registration ? 'Tạo tài khoản' : 'Chào mừng trở lại'}
        </h1>
        <p
          className={cn(
            typographyVariants({ variant: 'bodySmall', tone: 'muted' }),
            'mt-3',
          )}
        >
          {registration
            ? 'Tạo workspace riêng để bắt đầu quản lý nội dung.'
            : 'Đăng nhập để tiếp tục quản lý nội dung của bạn.'}
        </p>
        {expired && (
          <p
            role="status"
            className="mt-4 rounded-md bg-warning-subtle p-3 text-sm text-warning"
          >
            Phiên đã hết hạn. Vui lòng đăng nhập lại.
          </p>
        )}
        {error && errors[error] && (
          <p
            role="alert"
            className="mt-4 rounded-md bg-danger-subtle p-3 text-sm text-danger"
          >
            {errors[error]}
          </p>
        )}
        <form
          onSubmit={handleSubmit(submit)}
          noValidate
          className="mt-6 space-y-4"
          aria-label={registration ? 'Đăng ký' : 'Đăng nhập'}
        >
          {registration && (
            <div className="space-y-2">
              <Label htmlFor="name" className={typographyVariants({ variant: 'label' })}>
                Tên hiển thị
              </Label>
              <Input
                id="name"
                autoComplete="name"
                maxLength={80}
                disabled={busy}
                className="h-control bg-card text-base"
                aria-invalid={!!fields.name}
                aria-describedby={fields.name ? 'name-error' : undefined}
                {...register('name')}
              />
              {fields.name && (
                <p id="name-error" role="alert" className="text-sm text-danger">
                  {fields.name.message}
                </p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email" className={typographyVariants({ variant: 'label' })}>
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              disabled={busy}
              className="h-control bg-card text-base"
              aria-invalid={!!fields.email}
              aria-describedby={fields.email ? 'email-error' : undefined}
              {...register('email', { setValueAs: (value: string) => value.trim() })}
            />
            {fields.email && (
              <p id="email-error" role="alert" className="text-sm text-danger">
                {fields.email.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="password"
              className={typographyVariants({ variant: 'label' })}
            >
              Mật khẩu
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete={registration ? 'new-password' : 'current-password'}
              maxLength={128}
              disabled={busy}
              className="h-control bg-card text-base"
              aria-invalid={!!fields.password}
              aria-describedby={
                fields.password
                  ? 'password-error'
                  : registration
                    ? 'password-hint'
                    : undefined
              }
              {...register('password')}
            />
            {registration && (
              <p id="password-hint" className="text-xs text-muted-foreground">
                Từ 8 đến 128 ký tự, có ít nhất 1 chữ hoa và 1 ký tự đặc biệt.
              </p>
            )}
            {fields.password && (
              <p id="password-error" role="alert" className="text-sm text-danger">
                {fields.password.message}
              </p>
            )}
          </div>
          {registration && (
            <div className="space-y-2">
              <Label
                htmlFor="confirmPassword"
                className={typographyVariants({ variant: 'label' })}
              >
                Xác nhận mật khẩu
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                maxLength={128}
                disabled={busy}
                className="h-control bg-card text-base"
                aria-invalid={!!fields.confirmPassword}
                aria-describedby={fields.confirmPassword ? 'confirm-error' : undefined}
                {...register('confirmPassword')}
              />
              {fields.confirmPassword && (
                <p id="confirm-error" role="alert" className="text-sm text-danger">
                  {fields.confirmPassword.message}
                </p>
              )}
            </div>
          )}
          {submitError && (
            <p
              role="alert"
              className="rounded-md bg-danger-subtle p-3 text-sm text-danger"
            >
              {submitError}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {isSubmitting ? (
              <LoaderCircle
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <LogIn aria-hidden="true" />
            )}
            {isSubmitting ? 'Đang xử lý…' : registration ? 'Tạo tài khoản' : 'Đăng nhập'}
          </Button>
        </form>
        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          hoặc
          <span className="h-px flex-1 bg-border" />
        </div>
        <Button
          variant="outline"
          size="lg"
          className="w-full"
          disabled={busy || !config.data?.googleEnabled}
          onClick={() => {
            setGooglePending(true);
            window.location.assign(API_URL + '/auth/google');
          }}
        >
          {googlePending ? 'Đang chuyển đến Google…' : 'Tiếp tục với Google'}
        </Button>
        {!config.isPending && !config.data?.googleEnabled && (
          <p className="mt-2 text-xs text-muted-foreground">
            {config.isError
              ? 'Chưa kết nối được dịch vụ đăng nhập Google.'
              : 'Đăng nhập Google chưa sẵn sàng.'}
          </p>
        )}
        {config.isError && (
          <Button
            variant="link"
            size="sm"
            disabled={config.isFetching}
            onClick={() => void config.refetch()}
          >
            Thử lại kết nối
          </Button>
        )}
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {registration ? 'Đã có tài khoản? ' : 'Chưa có tài khoản? '}
          <Link
            href={registration ? '/login' : '/register'}
            className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          >
            {registration ? 'Đăng nhập' : 'Tạo tài khoản'}
          </Link>
        </p>
      </section>
    </main>
  );
}
