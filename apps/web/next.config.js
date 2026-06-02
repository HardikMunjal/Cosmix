module.exports = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    domains: ['example.com'],
  },
  env: {
    API_URL: process.env.API_URL || 'http://localhost:3000',
  },
  async rewrites() {
    return [
      {
        source: '/chat-api/chat/:path*',
        destination: 'http://127.0.0.1:3002/chat/:path*',
      },
      {
        source: '/chat-socket/socket.io/:path*',
        destination: 'http://127.0.0.1:3002/socket.io/:path*',
      },
    ];
  },
  webpack: (config) => {
    return config;
  },
};