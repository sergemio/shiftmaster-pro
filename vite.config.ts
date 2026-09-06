import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(() => {
    return {
      // Prod is served at /shiftmaster-pro/. The `dev` branch is built by the
      // same workflow into /shiftmaster-pro/preview/ so changes can be seen
      // online without touching what the team uses.
      base: process.env.VITE_BASE || '/shiftmaster-pro/',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), tailwindcss()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
