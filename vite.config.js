import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    // For GitHub Pages deployment - change 'hex_wind' to your repo name
    base: '/hex_wind/',
});
