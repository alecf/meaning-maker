/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  webpack: (config) => {
    config.externals = [
      ...config.externals,
      "level",
      "tractjs",
      "nnsplit",
      "gpt-3-encoder",
    ];
    return config;
  },
};

module.exports = nextConfig;
