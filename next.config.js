/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['draco3dgltf', 'sharp'],
  experimental: {
    outputFileTracingIncludes: {
      '/api/draco-compress': ['./node_modules/**/*.wasm', './node_modules/**/*.proto'],
    },
  },
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
    };
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    return config;
  },
}

export default nextConfig
