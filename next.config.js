import CopyPlugin from 'copy-webpack-plugin';

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      '/api/**/*': ['./node_modules/**/*.wasm', './node_modules/**/*.proto'],
    },
  },
  webpack: (config, { isServer }) => {
    config.resolve.alias.canvas = false;

    if (isServer) {
      config.plugins.push(
        new CopyPlugin({
          patterns: [
            {
              from: 'node_modules/draco3dgltf/*.wasm',
              to: '[name][ext]',
            },
            {
              from: 'node_modules/draco3dgltf/*.wasm',
              to: 'vendor-chunks/[name][ext]',
            },
          ],
        })
      );
    }

    return config;
  },
}

export default nextConfig
