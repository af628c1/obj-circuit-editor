import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works under a GitHub Pages sub-path.
  base: './',
  // three.js alone is ~600 kB; that's expected for a 3D editor.
  build: { chunkSizeWarningLimit: 1000 },
});
