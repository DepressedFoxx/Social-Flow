'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { sessionKey, type AuthSession } from './types';

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const client = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function logout() {
    setPending(true);
    setError('');
    try {
      const session = client.getQueryData<AuthSession>(sessionKey);
      await apiRequest<void>('/auth/logout', {
        method: 'POST',
        headers: { 'X-CSRF-Token': session?.csrfToken ?? '' },
      });
    } catch (failure) {
      if (!(failure instanceof ApiError && failure.status === 401)) {
        setError('Đăng xuất chưa thành công. Vui lòng thử lại.');
        setPending(false);
        return;
      }
    }
    await client.cancelQueries();
    // Full navigation discards the cache without triggering a session refetch.
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('socialflow-auth');
      channel.postMessage('logout');
      channel.close();
    }
    window.location.replace('/login');
  }
  return (
    <div>
      <Button
        variant={compact ? 'ghost' : 'outline'}
        size={compact ? 'icon' : 'default'}
        disabled={pending}
        aria-label={pending ? 'Đang đăng xuất' : 'Đăng xuất'}
        onClick={() => void logout()}
      >
        {compact ? (
          <LogOut aria-hidden="true" />
        ) : pending ? (
          'Đang đăng xuất…'
        ) : (
          'Đăng xuất'
        )}
      </Button>
      {error && (
        <p role="alert" className="mt-2 max-w-xs text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
