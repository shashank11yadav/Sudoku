/**
 * Looks up an element that index.html is known to contain. The type check
 * makes markup drift fail loudly at startup instead of later at a call site.
 */
export function byId(id: string): HTMLElement;
export function byId<T extends HTMLElement>(id: string, type: new () => T): T;
export function byId(id: string, type: new () => HTMLElement = HTMLElement): HTMLElement {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`Missing #${id} in index.html`);
  return el;
}

export function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function spokenTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (m) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  parts.push(`${s} second${s === 1 ? '' : 's'}`);
  return parts.join(' ');
}

/**
 * Screen reader announcements. Clearing first and writing on the next frame
 * makes repeated identical messages ("Conflict in row 1") announce again.
 */
export class Announcer {
  private readonly polite: HTMLElement;
  private readonly assertive: HTMLElement;

  constructor(polite: HTMLElement, assertive: HTMLElement) {
    this.polite = polite;
    this.assertive = assertive;
  }

  say(message: string, urgent = false): void {
    const region = urgent ? this.assertive : this.polite;
    region.textContent = '';
    requestAnimationFrame(() => {
      region.textContent = message;
    });
  }
}
