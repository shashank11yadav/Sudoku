import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { EASY } from '../tests/fixtures';

const cell = (page: Page, i: number) => page.locator(`#cell-${i}`);

/** Collects CSP violations and uncaught errors so a test fails on either. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

async function importPuzzle(page: Page, puzzle: string): Promise<void> {
  await page.getByRole('button', { name: 'Import / export' }).click();
  await page.getByLabel('Puzzle string').fill(puzzle);
  await page.getByRole('button', { name: 'Load puzzle' }).click();
  await expect(page.locator('#io-dialog')).not.toBeVisible();
  await expect(page.locator('#game-label')).toHaveText('Imported, easy');
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload();
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false');
});

test('generates a puzzle on first visit with no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  await page.reload();
  await expect(page.locator('#game-label')).toHaveText('Medium');
  await expect(page.locator('.cell.given')).not.toHaveCount(0);
  await expect(page.getByRole('grid', { name: 'Sudoku board' }).getByRole('row')).toHaveCount(9);
  expect(errors).toEqual([]);
});

test('plays a full game by keyboard: entry, conflict, undo, hint and win', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard flow runs on desktop; the touch flow is covered below');
  const errors = watchErrors(page);
  await importPuzzle(page, EASY.puzzle);

  // r1c1 is empty in this puzzle; the solution has 4 there.
  await cell(page, 0).click();
  await page.keyboard.press('3'); // 3 is already in row 1
  await expect(cell(page, 0)).toHaveClass(/conflict/);
  await expect(cell(page, 0)).toHaveAttribute('aria-label', /conflict/);
  await expect(page.locator('#announcer')).toContainText('Conflict: row 1 already has a 3.');

  await page.keyboard.press('Control+z');
  await expect(cell(page, 0)).toHaveAttribute('aria-label', 'Row 1, column 1, empty');
  await page.keyboard.press('Control+Shift+z');
  await expect(cell(page, 0)).toHaveText('3');
  await page.keyboard.press('Backspace');

  // Notes with Shift+digit.
  await page.keyboard.press('Shift+Digit4');
  await expect(cell(page, 0)).toHaveAttribute('aria-label', 'Row 1, column 1, empty, notes 4');

  // The hint names a technique and applying it fills a correct digit.
  await page.keyboard.press('h');
  await expect(page.locator('#hint-panel')).toBeVisible();
  await expect(page.locator('#hint-title')).toHaveText(/Naked single|Hidden single|Full house/);
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('#hint-panel')).toBeHidden();

  // Fill the rest from the keyboard. ArrowRight wraps within a row, so the
  // end of each row is Right (back to column 1) then Down.
  await cell(page, 0).click();
  for (let i = 0; i < 81; i++) {
    if (i > 0 && i % 9 === 0) {
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowDown');
    } else if (i > 0) {
      await page.keyboard.press('ArrowRight');
    }
    await expect(cell(page, i)).toBeFocused();
    const want = EASY.solution[i] ?? '';
    const have = (await cell(page, i).locator('.value').textContent()) ?? '';
    if (EASY.puzzle[i] === '0' && have !== want) await page.keyboard.press(want);
  }

  const dialog = page.getByRole('dialog', { name: 'Solved' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('#win-text')).toContainText('You solved Imported, easy in');
  await expect(page.locator('#alert')).toContainText('Puzzle solved');
  expect(errors).toEqual([]);
});

test('touch flow with the on-screen keypad', async ({ page }) => {
  await importPuzzle(page, EASY.puzzle);
  await cell(page, 0).click();
  await page.getByRole('button', { name: 'Enter 4' }).click();
  await expect(cell(page, 0)).toHaveText('4');
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await cell(page, 1).click();
  await page.getByRole('button', { name: 'Note 8' }).click();
  await expect(cell(page, 1)).toHaveAttribute('aria-label', 'Row 1, column 2, empty, notes 8');
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(cell(page, 0)).toHaveAttribute('aria-label', 'Row 1, column 1, empty');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.locator('#announcer')).toContainText('Everything so far is correct');
});

test('rejects bad imports with a clear message', async ({ page }) => {
  await page.getByRole('button', { name: 'Import / export' }).click();
  const input = page.getByLabel('Puzzle string');
  const error = page.locator('#io-error');
  await input.fill('123');
  await page.getByRole('button', { name: 'Load puzzle' }).click();
  await expect(error).toHaveText('Expected 81 cells but found 3.');
  await input.fill('11' + '.'.repeat(79));
  await page.getByRole('button', { name: 'Load puzzle' }).click();
  await expect(error).toHaveText('Row 1 has two 1s (r1c1 and r1c2).');
  await input.fill('.'.repeat(81));
  await page.getByRole('button', { name: 'Load puzzle' }).click();
  await expect(error).toContainText('more than one solution');
  await input.fill('<img src=x onerror=alert(1)>' + '.'.repeat(53));
  await page.getByRole('button', { name: 'Load puzzle' }).click();
  await expect(error).toHaveText(/Unexpected character "<" at position 1/);
});

test('restores progress after a reload', async ({ page }) => {
  await importPuzzle(page, EASY.puzzle);
  await cell(page, 0).click();
  await page.keyboard.press('4');
  await page.reload();
  await expect(cell(page, 0)).toHaveText('4');
  await expect(page.locator('#game-label')).toHaveText('Imported, easy');
});

test('watch the solver runs to completion', async ({ page }) => {
  await page.getByRole('tab', { name: 'Watch the solver' }).click();
  await page.getByLabel('Puzzle', { exact: true }).selectOption('inkala');
  await page.locator('#viz-speed').fill('100');
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.locator('#viz-status')).toHaveText('Solved', { timeout: 20_000 });
  await expect(page.locator('#viz-empty')).toHaveText('0');
  const nodes = Number((await page.locator('#viz-nodes').textContent())?.replace(/,/g, ''));
  expect(nodes).toBeGreaterThan(1000);

  await page.getByLabel('Algorithm').selectOption('logic');
  await page.getByLabel('Puzzle', { exact: true }).selectOption('current');
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.locator('#viz-status')).toHaveText('Solved', { timeout: 20_000 });
});

test('has no detectable accessibility violations', async ({ page }) => {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  await page.getByRole('tab', { name: 'Watch the solver' }).click();
  const watch = await new AxeBuilder({ page }).analyze();
  expect(watch.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test('dark theme passes contrast checks too', async ({ page }) => {
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const results = await new AxeBuilder({ page }).withTags(['wcag2aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test('fits a 375px screen without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
