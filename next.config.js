/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      '/api/draco-compress': ['./node_modules/**/*.wasm', './node_modules/**/*.proto'],
    },
  },
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
}

export default nextConfig
