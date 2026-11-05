import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { resolve } from 'path';

const root = resolve(import.meta.dirname, '..');
export default defineConfig({
  root,
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'fake-rayfin',
      enforce: 'pre',
      resolveId(id) {
        if (id === '@/lib/rayfin-client' || id.endsWith('/lib/rayfin-client')) return resolve(import.meta.dirname, 'fake-client.ts');
        return null;
      },
    },
  ],
  resolve: { alias: { '@': resolve(root, 'src') } },
  server: { port: 5199 },
});
