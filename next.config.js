/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    outputFileTracingIncludes: {
      '/api/send-message': [
        './node_modules/ffmpeg-static/ffmpeg*',
      ],
    },
  },
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
