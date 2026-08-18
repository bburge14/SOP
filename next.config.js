/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Produces .next/standalone/ (a pruned, self-contained server.js) in
  // addition to the normal .next build — the self-hosted `next start` /
  // systemd path is unaffected. This is what the Electron shell spawns as
  // its embedded server; see electron/main.js.
  output: "standalone",
  // Without this, the standalone build was copying the whole .git
  // directory (900KB+ of history) into .next/standalone — almost
  // certainly triggered by lib/update/git.ts's fs.existsSync(".git")
  // check getting swept up by Next's dependency tracer. Nothing runtime
  // needs .git bundled; the self-hosted git-based updater reads it from
  // the real working tree, not from inside a packaged build.
  outputFileTracingExcludes: {
    "*": [".git/**"],
  },
};

module.exports = nextConfig;
