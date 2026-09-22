export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
export const AUTH_EXPIRED_EVENT = 'socialflow:auth-expired';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(API_URL + endpoint, {
    ...options,
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json', ...options.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: unknown;
      code?: string;
    } | null;
    const message =
      typeof body?.message === 'string'
        ? body.message
        : Array.isArray(body?.message)
          ? body.message.join('. ')
          : 'Yêu cầu không thành công (' + response.status + ').';
    if (
      response.status === 401 &&
      !['/auth/login', '/auth/register'].includes(endpoint) &&
      typeof window !== 'undefined'
    )
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    throw new ApiError(response.status, message, body?.code);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function apiGet<T>(endpoint: string, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(endpoint, { signal });
}
