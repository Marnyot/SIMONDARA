import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

export type Theme = 'light' | 'dark';

// Same key and colours as the boot script in index.html.
export const STORAGE_KEY = 'simondara-theme';
const THEME_COLOR = { light: '#F6F6F3', dark: '#141816' } as const;
const DARK_QUERY = '(prefers-color-scheme: dark)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
/** Circular reveal timing; the switch knob uses the same curve. */
const REVEAL_MS = 320;
const REVEAL_EASING = 'cubic-bezier(0.2, 0, 0, 1)';

const media = (query: string) =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query)
    : null;

/** The theme the user picked with the switch, or `null` while they never have. */
export function readStoredTheme(): Theme | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : null;
  } catch {
    return null;
  }
}

/** A saved choice wins; until there is one, the OS setting decides. */
export function resolveTheme(
  stored: Theme | null,
  prefersDark: boolean,
): Theme {
  return stored ?? (prefersDark ? 'dark' : 'light');
}

/**
 * The user's explicit pick for this visit. Mirrors storage, and stands in for
 * it when storage is blocked, so an OS change never overrides a click.
 */
let chosen: Theme | null = null;

const currentTheme = () =>
  resolveTheme(
    readStoredTheme() ?? chosen,
    media(DARK_QUERY)?.matches ?? false,
  );

/** Points `<html>` and the browser chrome colour at a theme. */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLOR[theme]);
}

const listeners = new Set<() => void>();
let current: Theme | null = null;
/** Latest requested theme, ahead of `current` while a reveal is starting. */
let target: Theme | null = null;
let reveal: ViewTransition | null = null;

const snapshot = () => (current ??= currentTheme());

function commit(theme: Theme) {
  current = theme;
  applyTheme(theme);
  listeners.forEach((listener) => listener());
}

/** Ends a running reveal at once: no animation, no reveal marker left behind. */
function cancelReveal() {
  const running = reveal;
  reveal = null;
  delete document.documentElement.dataset.themeReveal;
  running?.skipTransition();
}

/** Re-reads storage and the OS setting; used for changes the user did not make here. */
function sync() {
  const theme = currentTheme();
  // The reveal in flight already lands on this theme: let it finish.
  if (reveal && theme === target) return;
  // Otherwise a change from elsewhere wins over the half-started reveal.
  cancelReveal();
  target = null;
  if (theme !== current) commit(theme);
  else applyTheme(theme);
}

export interface RevealOrigin {
  x: number;
  y: number;
}

/** Radius from `origin` to the furthest viewport corner. */
export function revealRadius(
  { x, y }: RevealOrigin,
  width: number,
  height: number,
) {
  return Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
}

const canReveal = () =>
  typeof document.startViewTransition === 'function' &&
  document.visibilityState === 'visible' &&
  !media(REDUCED_MOTION_QUERY)?.matches;

/**
 * Saves the user's choice and switches to it. With an `origin` the new theme
 * grows as a circle from that point (View Transitions); without support, under
 * reduced motion, or when the reveal fails, the theme simply changes.
 */
export function setTheme(theme: Theme, origin?: RevealOrigin) {
  chosen = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage blocked (private mode): the choice still holds for this visit.
  }
  target = theme;
  // A new click finishes the running reveal at once instead of queueing behind it.
  reveal?.skipTransition();
  if (!origin || !canReveal()) {
    reveal = null;
    commit(theme);
    return;
  }
  const root = document.documentElement;
  root.dataset.themeReveal = '';
  const transition = document.startViewTransition(() => {
    // A later click may already have asked for the other theme; the newest wins.
    // flushSync renders React's side (the switch) in the same frame as the colours.
    // A sync from the OS or another tab may have cancelled it: land on what holds now.
    flushSync(() => commit(target ?? currentTheme()));
  });
  reveal = transition;
  transition.ready
    .then(() => {
      if (reveal !== transition) return;
      const radius = revealRadius(origin, innerWidth, innerHeight);
      root.animate(
        {
          clipPath: [
            `circle(0px at ${origin.x}px ${origin.y}px)`,
            `circle(${radius}px at ${origin.x}px ${origin.y}px)`,
          ],
        },
        {
          duration: REVEAL_MS,
          easing: REVEAL_EASING,
          pseudoElement: '::view-transition-new(root)',
        },
      );
    })
    // Skipped or aborted: the update callback still ran, the theme is applied.
    .catch(() => undefined);
  void transition.finished
    .catch(() => undefined)
    .finally(() => {
      if (reveal !== transition) return;
      reveal = null;
      delete root.dataset.themeReveal;
    });
  // If the update itself threw, still land on the requested theme.
  transition.updateCallbackDone.catch(() => commit(target ?? currentTheme()));
}

/** Flips from the latest requested theme, so quick repeated clicks never get lost. */
export function toggleTheme(origin?: RevealOrigin) {
  setTheme((target ?? snapshot()) === 'dark' ? 'light' : 'dark', origin);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener('storage', onStorage);
    media(DARK_QUERY)?.addEventListener('change', sync);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    window.removeEventListener('storage', onStorage);
    media(DARK_QUERY)?.removeEventListener('change', sync);
  };
}

/** Another tab switched (or storage was cleared): follow it, without a reveal. */
function onStorage(event: StorageEvent) {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  chosen = readStoredTheme();
  sync();
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, snapshot, () => 'light');
}

/** Test hook: forget cached state so each test starts from storage and the OS. */
export function resetThemeForTests() {
  current = null;
  target = null;
  reveal = null;
  chosen = null;
}
