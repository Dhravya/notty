const withPWA = require('next-pwa').default({
  dest: 'public',
  register: true,
  skipWaiting: true,
  //   disable: process.env.NODE_ENV === 'development',
});

const nextConfig = {};

module.exports = withPWA(nextConfig);
