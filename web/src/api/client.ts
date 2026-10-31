import { z } from 'zod';
import {
  commandSchema,
  eventSchema,
  historyPointSchema,
  snapshotSchema,
} from './types';
import type { Command, HistoryBucket } from './types';
export const UNAUTHORIZED_EVENT = 'simondara:unauthorized';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
export async function request<T>(
  path: string,
  options: RequestInit = {},
  schema?: z.ZodType<T>,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      signal: options.signal ?? AbortSignal.timeout(15000),
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw error;
    throw new ApiError(
      0,
      'Server tidak dapat dijangkau. Periksa koneksi lalu coba lagi.',
      error,
    );
  }
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login')
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(
      response.status,
      response.status === 401
        ? 'Sesi berakhir atau kata sandi salah. Silakan masuk kembali.'
        : `Permintaan gagal (${response.status}). Silakan coba lagi.`,
    );
  }
  if (response.status === 204 || response.status === 202) return undefined as T;
  try {
    const body: unknown = await response.json();
    return schema ? schema.parse(body) : (body as T);
  } catch (error) {
    throw new ApiError(
      response.status,
      'Respons server tidak sesuai format.',
      error,
    );
  }
}
export const api = {
  me: (signal?: AbortSignal) =>
    request('/auth/me', { signal }, z.object({ user: z.string() })),
  login: (password: string) =>
    request<void>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  snapshot: (signal?: AbortSignal) =>
    request('/state', { signal }, snapshotSchema),
  history: (
    from: string,
    to: string,
    bucket: HistoryBucket,
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams({ from, to, bucket });
    return request(
      `/history?${query}`,
      { signal },
      z.object({ points: z.array(historyPointSchema) }),
    );
  },
  events: (limit = 50, signal?: AbortSignal) =>
    request(
      `/events?limit=${Math.min(100, Math.max(1, Math.trunc(limit)))}`,
      { signal },
      z.object({ events: z.array(eventSchema) }),
    ),
};
export function sendCommand(command: Command) {
  return request<void>('/cmd', {
    method: 'POST',
    body: JSON.stringify(commandSchema.parse(command)),
  });
}
