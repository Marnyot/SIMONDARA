import { z } from 'zod';
import {
  notificationsSchema,
  notificationsPatchSchema,
  commandSchema,
  eventSchema,
  historyPointSchema,
  roomSchema,
  roomsPayloadSchema,
  snapshotSchema,
} from './types';
import type { Command, HistoryBucket, NotificationsPatch } from './types';
export const UNAUTHORIZED_EVENT = 'simondara:unauthorized';
const errorBodySchema = z.object({ error: z.string() });
const roomPath = (deviceId: string) => `/rooms/${encodeURIComponent(deviceId)}`;
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public cause?: unknown,
    /** Machine-readable `error` from the response body, e.g. `name_exists`. */
    public code?: string,
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
    const body: unknown = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      response.status === 401
        ? 'Sesi berakhir atau kata sandi salah. Silakan masuk kembali.'
        : `Permintaan gagal (${response.status}). Silakan coba lagi.`,
      undefined,
      errorBodySchema.safeParse(body).data?.error,
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
  notifications: (signal?: AbortSignal) =>
    request('/notifications', { signal }, notificationsSchema),
  updateNotifications: (input: NotificationsPatch) =>
    request(
      '/notifications',
      {
        method: 'PATCH',
        body: JSON.stringify(notificationsPatchSchema.parse(input)),
      },
      notificationsSchema,
    ),
  setRoomNotify: (deviceId: string, notify: boolean) =>
    request(
      roomPath(deviceId),
      {
        method: 'PATCH',
        body: JSON.stringify({ notify }),
      },
      roomSchema,
    ),
  me: (signal?: AbortSignal) =>
    request('/auth/me', { signal }, z.object({ user: z.string() })),
  login: (password: string) =>
    request<void>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  rooms: (signal?: AbortSignal) =>
    request('/rooms', { signal }, roomsPayloadSchema),
  createRoom: (input: { deviceId: string; name: string }) =>
    request(
      '/rooms',
      { method: 'POST', body: JSON.stringify(input) },
      roomSchema,
    ),
  renameRoom: (deviceId: string, name: string) =>
    request(
      roomPath(deviceId),
      { method: 'PATCH', body: JSON.stringify({ name }) },
      roomSchema,
    ),
  deleteRoom: (deviceId: string) =>
    request<void>(roomPath(deviceId), { method: 'DELETE' }),
  roomState: (deviceId: string, signal?: AbortSignal) =>
    request(`${roomPath(deviceId)}/state`, { signal }, snapshotSchema),
  history: (
    deviceId: string,
    from: string,
    to: string,
    bucket: HistoryBucket,
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams({ from, to, bucket });
    return request(
      `${roomPath(deviceId)}/history?${query}`,
      { signal },
      z.object({ points: z.array(historyPointSchema) }),
    );
  },
  events: (deviceId: string, limit = 50, signal?: AbortSignal) =>
    request(
      `${roomPath(deviceId)}/events?limit=${Math.min(100, Math.max(1, Math.trunc(limit)))}`,
      { signal },
      z.object({ events: z.array(eventSchema) }),
    ),
};
export function sendCommand(deviceId: string, command: Command) {
  return request<void>(`${roomPath(deviceId)}/cmd`, {
    method: 'POST',
    body: JSON.stringify(commandSchema.parse(command)),
  });
}
