// next-auth evaluates NEXTAUTH_URL while client pages are prerendered. An empty
// Vercel environment variable is treated differently from an unset variable and
// causes next-auth to call `new URL('')`, which fails every static page build.
// Normalize blank values before Next.js bundles next-auth/react.
if (!process.env.NEXTAUTH_URL?.trim()) {
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
    || process.env.VERCEL_URL?.trim();

  process.env.NEXTAUTH_URL = vercelHost
    ? (/^https?:\/\//i.test(vercelHost) ? vercelHost : `https://${vercelHost}`)
    : 'http://localhost:3000';
}

if (!process.env.NEXTAUTH_URL_INTERNAL?.trim()) {
  delete process.env.NEXTAUTH_URL_INTERNAL;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Trace this independent app, regardless of lockfiles in parent folders.
  outputFileTracingRoot: __dirname,
  // Keep the copied workspace build within this development machine's memory.
  experimental: { cpus: 1, webpackBuildWorker: false },
  // Configure for ngrok
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
        ],
      },
    ];
  },
  trailingSlash: false,
  // Remove output: 'standalone' for development - it's only for production builds
  // and causes static asset 404 errors in dev mode
};

module.exports = nextConfig;
