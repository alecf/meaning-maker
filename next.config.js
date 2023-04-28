/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  webpack: (config) => {
    config.externals = [...config.externals, "level", "tractjs", "nnsplit"];
    return config;
  },
};

module.exports = nextConfig;
