import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import * as fs from 'fs';

// Copies alert overlay files as static assets — bypasses Vite HTML processing
// which chokes on large inline <style> blocks in plain-HTML entries.
function copyAlertOverlay(): Plugin {
  return {
    name: 'copy-alert-overlay',
    closeBundle() {
      const srcDir = resolve(__dirname, 'src/overlay/alert');
      const dstDir = resolve(__dirname, 'dist/web/overlay/alert');
      fs.mkdirSync(dstDir, { recursive: true });
      fs.copyFileSync(resolve(srcDir, 'index.html'), resolve(dstDir, 'index.html'));
      fs.copyFileSync(resolve(srcDir, 'alert-engine.js'), resolve(dstDir, 'alert-engine.js'));
    },
  };
}

export default defineConfig({
  plugins: [react(), copyAlertOverlay()],
  root: 'src',
  base: './',
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        renderer: resolve(__dirname, 'src/renderer/index.html'),
        overlay: resolve(__dirname, 'src/overlay/index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@main': resolve(__dirname, 'src/main'),
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@overlay': resolve(__dirname, 'src/overlay'),
    },
  },
  server: {
    port: 5173,
  },
});
