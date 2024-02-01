const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  register: true,
  skipWaiting: true,
});

await import("./src/env.js");

const config = withPWA({});

export default config;  