# Security policy

## Reporting a vulnerability

Please report security problems privately through GitHub's
"Report a vulnerability" button on the repository's Security tab, rather than
in a public issue. I aim to reply within a week.

## What the app does and does not do

- It is a static site. There is no server, no account system and no network
  request after the page loads. Puzzles are generated in the browser.
- Game progress and the theme choice are stored in `localStorage` on your
  device only. Saved data is validated cell by cell before it is used, so a
  tampered save is discarded instead of trusted.
- Imported puzzle strings are capped at 1,000 characters, must contain only
  `1-9`, `0` and `.` (whitespace is ignored), and are checked for duplicate
  givens, solvability and a unique solution before they load. Error messages
  never echo raw input back as markup.
- The production build sets a Content Security Policy through a meta tag:
  scripts, styles, workers and images may only come from the site's own
  origin, with no inline scripts or styles, no `eval`, no plugins and no
  form submissions. `frame-ancestors` cannot be set from a meta tag, and
  GitHub Pages does not allow custom headers, so clickjacking protection is
  limited to what the host provides.
- There are no runtime dependencies, trackers, analytics or CDNs.

## Supply chain

- Dependencies are dev-only and pinned with exact versions in
  `package-lock.json`. Dependabot proposes weekly updates for npm packages and
  GitHub Actions.
- CI runs `npm audit --audit-level=high` and CodeQL on every push and pull
  request. Every third-party Action is pinned to a full commit SHA, and
  workflows default to read-only `contents` permission.
