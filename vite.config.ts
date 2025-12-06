import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// Check if SSL certificates exist (only in local development)
const certPath = path.resolve(__dirname, 'cert.pem');
const keyPath = path.resolve(__dirname, 'key.pem');
const sslEnabled = fs.existsSync(certPath) && fs.existsSync(keyPath);

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
    include: ['three', '@react-three/fiber', '@react-three/drei'],
    // Force Three.js to be bundled once to prevent multiple instances
    force: true,
  },
  resolve: {
    dedupe: ['three', '@react-three/fiber', '@react-three/drei'],
  },
  server: {
    host: '0.0.0.0', // Enable network access
    port: 5173,
    strictPort: false, // Allow port to change if 5173 is busy
    cors: true, // Enable CORS for cross-origin requests
    // Only enable HTTPS if certificates exist (local development)
    ...(sslEnabled && {
      https: {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      },
    }),
  },
  preview: {
    host: '0.0.0.0', // Enable network access for preview mode
    port: 4173,
    strictPort: false,
    cors: true,
    // Only enable HTTPS if certificates exist (local development)
    ...(sslEnabled && {
      https: {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      },
    }),
  },
  // Define environment variables for development
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode),
    'import.meta.env.DEV': mode === 'development',
  },
}));
