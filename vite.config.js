import { defineConfig } from 'vite';

// Static build config for Vercel free-tier deployment.
// Output is a fully static site (no server runtime) => works on Vercel's
// static hosting with zero configuration.
export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    target: 'es2020',
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split three.js into its own chunk so the game code can update
        // without re-downloading the engine (better cache reuse).
        manualChunks: {
          three: ['three']
        }
      }
    },
    chunkSizeWarningLimit: 900
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: false
  },
  // Vite's preview server rejects unknown Host headers (403). Allow the
  // sandbox/proxy hosts so the built site can be smoke-tested behind a proxy.
  // Has no effect on the final static Vercel deploy (no server there).
  preview: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true
  }
});
