import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'noise-suppressor-worklet': resolve(__dirname, 'src/audio/noise-suppressor-worklet.js')
      },
      output: {
        entryFileNames: (chunkInfo) =>
          chunkInfo.name === 'noise-suppressor-worklet' ? 'assets/noise-suppressor-worklet.js' : 'assets/[name]-[hash].js'
      }
    }
  },
  server: {
    port: 5173,
    // Перенаправляем запросы к API на бэкенд-сервер
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true
      }
    }
  }
});
