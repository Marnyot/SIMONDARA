import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { ProtectedRoute } from './ProtectedRoute';
import { request, ApiError, UNAUTHORIZED_EVENT } from '../api/client';
describe('sesi dan route guard', () => {
  it('401 /auth/me mengarahkan route terlindungi ke login', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MemoryRouter initialEntries={['/kontrol']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<h1>Masuk pengelola</h1>} />
            <Route element={<ProtectedRoute />}>
              <Route path="/kontrol" element={<h1>Kontrol privat</h1>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole('heading', { name: 'Masuk pengelola' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Kontrol privat')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({
        credentials: 'same-origin',
        cache: 'no-store',
      }),
    );
  });
  it('401 API global mengirim invalidasi sesi dan error bertipe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);
    await expect(request('/rooms')).rejects.toBeInstanceOf(ApiError);
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
  });
  it('kata sandi salah tidak mengirim invalidasi sesi global', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);
    await expect(
      request('/auth/login', { method: 'POST' }),
    ).rejects.toMatchObject({ status: 401 });
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
  });
});
