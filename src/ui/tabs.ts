/**
 * WAI-ARIA tabs with automatic activation: arrow keys move between tabs and
 * show the matching panel, and only the selected tab is in the tab order.
 */
export function initTabs(tablist: HTMLElement, onChange: (panelId: string) => void): void {
  const tabs = Array.from(tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]'));

  const activate = (tab: HTMLButtonElement, focus: boolean): void => {
    for (const t of tabs) {
      const selected = t === tab;
      t.setAttribute('aria-selected', String(selected));
      t.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls') ?? '');
      if (panel) panel.hidden = !selected;
    }
    if (focus) tab.focus();
    onChange(tab.getAttribute('aria-controls') ?? '');
  };

  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      activate(tab, false);
    });
    tab.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(tab);
      let next: HTMLButtonElement | undefined;
      if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
      else if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') next = tabs[0];
      else if (e.key === 'End') next = tabs[tabs.length - 1];
      if (next) {
        e.preventDefault();
        activate(next, true);
      }
    });
  }
}
