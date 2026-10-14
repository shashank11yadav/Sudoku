import { defineConfig, type Plugin } from 'vite';

/**
 * Strict Content Security Policy for the production build. It is injected
 * only at build time because the dev server relies on inline styles for hot
 * reloading. Everything ships from the same origin, so 'self' is enough.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function cspMeta(): Plugin {
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
    },
  };
}

export default defineConfig({
  base: '/Sudoku/',
  plugins: [cspMeta()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: false,
    modulePreload: { polyfill: false },
  },
  server: { port: 5400, strictPort: true },
  preview: { port: 5401, strictPort: true },
});
