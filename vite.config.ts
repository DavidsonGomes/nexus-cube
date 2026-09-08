import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { offlinePlugin } from './scripts/pwa';
export default defineConfig({plugins:[react(),offlinePlugin()],worker:{format:'es'},build:{target:'es2022'}});
