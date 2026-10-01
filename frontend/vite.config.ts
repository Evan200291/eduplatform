import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { cpSync, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import type { Plugin } from 'vite';

// The clickable design prototype (docs/design/kids) is plain static files. It is
// published under /prototype/ — served by the dev server, and copied into the
// build output so nginx serves it next to the app with no extra config.
const PROTOTYPE_DIR = fileURLToPath(new URL('../docs/design/kids', import.meta.url));
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

function prototypePlugin(): Plugin {
  return {
    name: 'midas-prototype',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (url === '/prototype') {
          res.statusCode = 301;
          res.setHeader('Location', '/prototype/');
          res.end();
          return;
        }
        if (!url.startsWith('/prototype/')) return next();
        const rel = normalize(decodeURIComponent(url.slice('/prototype/'.length)) || 'index.html');
        const file = join(PROTOTYPE_DIR, rel);
        // Stay inside the prototype folder.
        if (rel.startsWith('..') || !file.startsWith(PROTOTYPE_DIR)) return next();
        const target = existsSync(file) && statSync(file).isDirectory() ? join(file, 'index.html') : file;
        if (!existsSync(target)) return next();
        res.setHeader('Content-Type', MIME[extname(target)] ?? 'application/octet-stream');
        res.end(readFileSync(target));
      });
    },
    writeBundle(options) {
      if (!options.dir || !existsSync(PROTOTYPE_DIR)) return;
      cpSync(PROTOTYPE_DIR, join(options.dir, 'prototype'), { recursive: true });
    },
  };
}

// The SPA serves three route groups (student / teacher / admin) from one build.
// In dev we proxy /api and /media to the Express backend so cookies (the
// httpOnly refresh token scoped to /api/v1/auth) are same-origin and flow
// without CORS preflight surprises.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_DEV_API_TARGET || 'http://localhost:4000';

  return {
    plugins: [react(), prototypePlugin()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
        '/media': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    test: {
      // jsdom rather than node: the preference store writes to document and
      // localStorage on construction, so a bare node environment cannot load it.
      environment: 'jsdom',
      globals: false,
      include: ['src/**/*.test.{ts,tsx}'],
      restoreMocks: true,
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      target: 'es2022',
    },
  };
});
