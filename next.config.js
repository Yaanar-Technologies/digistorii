/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/i,
      issuer: /\.[jt]sx?$/,
      use: ["@svgr/webpack"],
    });
    return config;
  },
  // next.config.js
experimental: {
  optimizePackageImports: ['antd', '@ant-design/icons'],
},
};

module.exports = nextConfig;