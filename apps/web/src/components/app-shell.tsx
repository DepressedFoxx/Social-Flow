'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FileText,
  Images,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LogoutButton } from '@/features/auth/logout-button';
import type { AuthSession } from '@/features/auth/types';
import { cn } from '@/lib/utils';

const navigation = [
  { href: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { href: '/posts', label: 'Bài viết', icon: FileText },
  { href: '/media', label: 'Thư viện media', icon: Images },
] as const;

function pageTitle(pathname: string) {
  if (pathname === '/dashboard') return 'Dashboard';
  if (pathname === '/posts/new') return 'Tạo bài viết';
  if (pathname.startsWith('/posts/')) return 'Chi tiết bài viết';
  if (pathname.startsWith('/posts')) return 'Bài viết';
  if (pathname.startsWith('/media')) return 'Thư viện media';
  return 'SocialFlow';
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function AppShell({
  session,
  children,
}: {
  session: AuthSession;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  return (
    <div className="min-h-screen bg-background md:flex">
      {menuOpen && (
        <Button
          variant="ghost"
          className="fixed inset-0 z-40 h-auto w-auto rounded-none bg-foreground/25 p-0 hover:bg-foreground/25 md:hidden"
          aria-label="Đóng menu"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        id="app-sidebar"
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 flex-col border-r border-border bg-card md:sticky md:top-0 md:h-screen md:w-64',
          menuOpen ? 'flex' : 'hidden md:flex',
        )}
        aria-label="Điều hướng chính"
      >
        <div className="flex h-16 items-center justify-between border-b border-border px-5">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onClick={() => setMenuOpen(false)}
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles aria-hidden="true" className="size-5" />
            </span>
            <span className="font-semibold tracking-tight">SocialFlow</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Đóng menu"
            onClick={() => setMenuOpen(false)}
          >
            <PanelLeftClose aria-hidden="true" />
          </Button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-5" aria-label="Menu workspace">
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-label text-muted-foreground">
            Không gian làm việc
          </p>
          {navigation.map(({ href, label, icon: Icon }) => {
            const active =
              href === '/dashboard' ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  active
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon aria-hidden="true" className="size-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-4">
          <p className="truncate text-sm font-medium">{session.workspace.name}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {session.workspace.channels.length} kênh đang quản lý
          </p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-card/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Mở menu"
              aria-controls="app-sidebar"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Menu aria-hidden="true" />
            </Button>
            <h1 className="truncate text-lg font-semibold">{pageTitle(pathname)}</h1>
          </div>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="hidden min-w-0 text-right sm:block">
              <p className="truncate text-sm font-medium">{session.user.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {session.user.email}
              </p>
            </div>
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
              aria-hidden="true"
            >
              {initials(session.user.name) || 'SF'}
            </span>
            <LogoutButton compact />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
