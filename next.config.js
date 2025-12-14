const { i18n } = require('./next-i18next.config');

/** @type {import('next').NextConfig} */
const nextConfig = {
  i18n,
  reactStrictMode: true,
  assetPrefix: process.env.BASE_PATH || "",
  basePath: process.env.BASE_PATH || "",
  trailingSlash: true,
  publicRuntimeConfig: {
    root: process.env.BASE_PATH || "",
  },
  optimizeFonts: false,
  transpilePackages: ['@charcoal-ui/icons'],
};

module.exports = nextConfig;
