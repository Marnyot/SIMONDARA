import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STORAGE_KEY,
  readStoredTheme,
  resetThemeForTests,
  resolveTheme,
  revealRadius,
  toggleTheme,
  useTheme,
} from './theme';

/** matchMedia stand-in: the OS colour scheme can be flipped, reduced motion fixed. */
function stubMedia({ dark = false, reducedMotion = false } = {}) {
  const listeners = new Set<() => void>();
  const scheme = {
    matches: dark,
    addEventListener: (_: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      listeners.delete(listener),
  };
  vi.stubGlobal('matchMedia', (query: string) =>
    query.includes('prefers-color-scheme')
      ? scheme
      : { ...scheme, matches: reducedMotion && query.includes('reduced') },
  );
  return {
    setDark(value: boolean) {
      scheme.matches = value;
      listeners.forEach((listener) => listener());
    },
  };
}

/** Fake View Transitions: runs the update and resolves every promise. */
function stubViewTransition() {
  const start = vi.fn((update: () => void) => {
    update();
    return {
      ready: Promise.resolve(),
      finished: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
      skipTransition: vi.fn(),
    };
  });
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value: start,
  });
  document.documentElement.animate = vi.fn();
  return start;
}

beforeEach(() => {
  localStorage.clear();
  resetThemeForTests();
  delete document.documentElement.dataset.theme;
});
afterEach(() => {
  Reflect.deleteProperty(document, 'startViewTransition');
  vi.restoreAllMocks();
});

describe('resolusi tema', () => {
  it('pilihan tersimpan menang, tanpa pilihan mengikuti OS', () => {
    expect(resolveTheme(null, false)).toBe('light');
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
  it('mengabaikan nilai storage yang tidak dikenal atau storage yang diblokir', () => {
    localStorage.setItem(STORAGE_KEY, 'system');
    expect(readStoredTheme()).toBeNull();
    localStorage.setItem(STORAGE_KEY, 'dark');
    expect(readStoredTheme()).toBe('dark');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readStoredTheme()).toBeNull();
  });
  it('mengukur jari-jari reveal sampai sudut layar terjauh', () => {
    expect(revealRadius({ x: 0, y: 0 }, 300, 400)).toBe(500);
    expect(revealRadius({ x: 290, y: 20 }, 300, 400)).toBeCloseTo(
      Math.hypot(290, 380),
    );
  });
});

describe('saklar tema', () => {
  it('mengikuti perubahan OS sampai pengguna menekan saklar', () => {
    const os = stubMedia({ dark: false });
    const { result } = renderHook(() => useTheme());
    expect(result.current).toBe('light');
    act(() => os.setDark(true));
    expect(result.current).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');

    act(() => toggleTheme());
    expect(result.current).toBe('light');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
    act(() => os.setDark(false));
    act(() => os.setDark(true));
    expect(result.current).toBe('light');
  });
  it('klik cepat berturut-turut tidak kehilangan perubahan', () => {
    stubMedia();
    const { result } = renderHook(() => useTheme());
    act(() => {
      toggleTheme();
      toggleTheme();
      toggleTheme();
    });
    expect(result.current).toBe('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
  });
  it('sinkron dengan tab lain tanpa animasi reveal', () => {
    stubMedia();
    const start = stubViewTransition();
    const { result } = renderHook(() => useTheme());
    localStorage.setItem(STORAGE_KEY, 'dark');
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: STORAGE_KEY, newValue: 'dark' }),
      );
    });
    expect(result.current).toBe('dark');
    expect(start).not.toHaveBeenCalled();
  });
  it('memakai circular reveal dari tombol bila didukung', async () => {
    stubMedia();
    const start = stubViewTransition();
    const { result } = renderHook(() => useTheme());
    await act(async () => toggleTheme({ x: 40, y: 20 }));
    expect(start).toHaveBeenCalledOnce();
    expect(result.current).toBe('dark');
    expect(document.documentElement.animate).toHaveBeenCalledWith(
      expect.objectContaining({
        clipPath: [
          'circle(0px at 40px 20px)',
          expect.stringMatching(/^circle\(.+px at 40px 20px\)$/),
        ],
      }),
      expect.objectContaining({
        duration: 320,
        pseudoElement: '::view-transition-new(root)',
      }),
    );
  });
  it('reduced motion mengganti tema langsung tanpa reveal', () => {
    stubMedia({ reducedMotion: true });
    const start = stubViewTransition();
    const { result } = renderHook(() => useTheme());
    act(() => toggleTheme({ x: 40, y: 20 }));
    expect(start).not.toHaveBeenCalled();
    expect(result.current).toBe('dark');
  });
  it('tetap berganti tema bila reveal ditolak', async () => {
    stubMedia();
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (update: () => void) => {
        update();
        return {
          ready: Promise.reject(new Error('skipped')),
          finished: Promise.reject(new Error('skipped')),
          updateCallbackDone: Promise.resolve(),
          skipTransition: vi.fn(),
        };
      },
    });
    const { result } = renderHook(() => useTheme());
    await act(async () => toggleTheme({ x: 0, y: 0 }));
    expect(result.current).toBe('dark');
    expect(document.documentElement.dataset.themeReveal).toBeUndefined();
  });
  it('storage diblokir: pilihan tetap berlaku walau OS berubah', () => {
    const os = stubMedia({ dark: false });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useTheme());
    act(() => toggleTheme());
    expect(result.current).toBe('dark');
    act(() => os.setDark(true));
    act(() => os.setDark(false));
    expect(result.current).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

/** View Transition whose `ready` waits until the test releases it. */
function stubPendingTransition() {
  let release = () => {};
  const ready = new Promise<void>((resolve) => (release = resolve));
  const skipTransition = vi.fn();
  let update = () => {};
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value: (callback: () => void) => {
      update = callback;
      return {
        ready,
        finished: ready,
        updateCallbackDone: Promise.resolve(),
        skipTransition,
      };
    },
  });
  document.documentElement.animate = vi.fn();
  return {
    skipTransition,
    /** The browser runs the update callback, then the reveal is ready. */
    async finish() {
      update();
      release();
      await ready;
    },
  };
}

describe('reveal yang terpotong sinkronisasi', () => {
  it('event storage sebelum ready membatalkan reveal dan menang', async () => {
    stubMedia();
    const pending = stubPendingTransition();
    const { result } = renderHook(() => useTheme());
    act(() => toggleTheme({ x: 10, y: 10 }));
    expect(document.documentElement.dataset.themeReveal).toBe('');

    localStorage.setItem(STORAGE_KEY, 'light');
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: STORAGE_KEY, newValue: 'light' }),
      );
    });
    expect(pending.skipTransition).toHaveBeenCalled();
    expect(document.documentElement.dataset.themeReveal).toBeUndefined();

    await act(() => pending.finish());
    expect(document.documentElement.animate).not.toHaveBeenCalled();
    expect(result.current).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });
  it('event OS sebelum ready tidak menimpa klik, reveal tetap jalan', async () => {
    const os = stubMedia({ dark: false });
    const pending = stubPendingTransition();
    const { result } = renderHook(() => useTheme());
    act(() => toggleTheme({ x: 10, y: 10 }));
    act(() => os.setDark(false));
    expect(pending.skipTransition).not.toHaveBeenCalled();
    await act(() => pending.finish());
    expect(result.current).toBe('dark');
    expect(document.documentElement.animate).toHaveBeenCalledOnce();
  });
  it('event OS yang berlawanan dengan pilihan tidak membatalkan reveal', async () => {
    const os = stubMedia({ dark: true });
    const pending = stubPendingTransition();
    const { result } = renderHook(() => useTheme());
    act(() => toggleTheme({ x: 10, y: 10 }));
    act(() => os.setDark(false));
    act(() => os.setDark(true));
    expect(pending.skipTransition).not.toHaveBeenCalled();
    await act(() => pending.finish());
    expect(result.current).toBe('light');
  });
});
