import { readString, writeString } from '../game/storage';
import { byId } from './dom';

const KEY = 'sudoku.theme';
const MOON = 'M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9Z';
const SUN =
  'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0-5 1 3h-2l1-3Zm0 20-1-3h2l-1 3ZM2 12l3-1v2l-3-1Zm20 0-3 1v-2l3 1ZM4.9 4.9l2.8 1.4-1.4 1.4-1.4-2.8Zm14.2 14.2-2.8-1.4 1.4-1.4 1.4 2.8Zm0-14.2-1.4 2.8-1.4-1.4 2.8-1.4ZM4.9 19.1l1.4-2.8 1.4 1.4-2.8 1.4Z';

type Theme = 'light' | 'dark';

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * With no stored choice the page follows the system setting through CSS
 * alone; the attribute is only set once the player picks a theme.
 */
export function initTheme(): void {
  const button = byId('theme-toggle', HTMLButtonElement);
  const path = button.querySelector('path');
  const stored = readString(KEY);
  if (stored === 'light' || stored === 'dark') document.documentElement.dataset['theme'] = stored;

  const current = (): Theme => {
    const t = document.documentElement.dataset['theme'];
    return t === 'light' || t === 'dark' ? t : systemTheme();
  };
  const sync = (): void => {
    const dark = current() === 'dark';
    button.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    path?.setAttribute('d', dark ? SUN : MOON);
  };

  button.addEventListener('click', () => {
    const next: Theme = current() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset['theme'] = next;
    writeString(KEY, next);
    sync();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', sync);
  sync();
}
