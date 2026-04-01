import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      hmr: env.DISABLE_HMR === 'true' ? false : undefined,
      proxy: {
        '/api': {
          target: 'http://localhost:5200',
          changeOrigin: true,
        },
      },
    },
  };
});
