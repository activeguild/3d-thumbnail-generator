/** @type {import('next').NextConfig} */
const nextConfig = {
  // No server-side rendering needed for this fully client-side app
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
}

export default nextConfig
