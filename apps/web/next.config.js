module.exports = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    domains: ['example.com'], // Add your allowed image domains here
  },
  env: {
    API_URL: process.env.API_URL || 'http://localhost:3000', // Set your API URL
  },
  webpack: (config) => {
    // Custom webpack configuration can go here
    return config;
  },
};