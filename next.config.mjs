/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // The football dataset is read from disk at runtime; make sure it ships with the
  // serverless functions and that nothing else gets dragged in with it.
  outputFileTracingIncludes: {
    '/api/**': ['./data/dist/**'],
    '/room/**': ['./data/dist/**'],
  },
};
export default nextConfig;
