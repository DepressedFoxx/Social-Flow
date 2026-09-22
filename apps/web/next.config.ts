import type { NextConfig } from 'next';
import path from 'node:path';
const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  turbopack: { root: path.resolve(process.cwd(), '../..') },
};
export default config;
