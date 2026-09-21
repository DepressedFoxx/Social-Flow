const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
export async function apiGet<T>(endpoint: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(apiUrl + endpoint, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok)
    throw new ApiError(
      response.status,
      'Yêu cầu không thành công (' + response.status + ').',
    );
  return response.json() as Promise<T>;
}
