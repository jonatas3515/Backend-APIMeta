/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/webhook',
        destination: '/api/webhook',
      },
    ];
  },
};

module.exports = nextConfig;
