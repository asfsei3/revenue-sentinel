import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // This project is nested inside a larger monorepo (ai-orchestra) that has
  // its own lockfile; pin the workspace root so Turbopack/webpack don't
  // infer the wrong one.
  turbopack: { root: __dirname },
};

export default nextConfig;
