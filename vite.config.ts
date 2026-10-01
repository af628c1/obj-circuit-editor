import { defineConfig } from 'vite';

// Identifies this build, so a running page can tell when a newer one is live.
const BUILD_ID = process.env.GITHUB_SHA?.slice(0, 7) ?? Date.now().toString(36);

export default defineConfig({
  // Relative base so the build works under a GitHub Pages sub-path.
  base: './',
  // three.js alone is ~600 kB; that's expected for a 3D editor.
  build: { chunkSizeWarningLimit: 1000 },
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    {
      name: 'version-file',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
      },
    },
  ],
});
