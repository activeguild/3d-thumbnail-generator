/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['puppeteer', 'sharp', 'sharp-apng'],
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
}

export default nextConfig
