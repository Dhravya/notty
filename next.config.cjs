const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  register: true,
  skipWaiting: true,
//   disable: process.env.NODE_ENV === 'development',
});

const nextConfig = {};

module.exports = withPWA(nextConfig);
