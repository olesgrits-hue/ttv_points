import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
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
