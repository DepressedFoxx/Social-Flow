import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiGet } from './api-client';
afterEach(() => vi.unstubAllGlobals());
describe('apiGet', () => {
  it('rejects HTTP errors instead of treating them as successful data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 503 })),
    );
    await expect(apiGet('/health')).rejects.toMatchObject({
      status: 503,
      name: 'ApiError',
    });
  });
  it('passes cancellation to fetch', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"status":"ok"}'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiGet('/health', controller.signal)).resolves.toEqual({ status: 'ok' });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/health'),
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
