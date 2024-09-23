/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.externals = [...config.externals, "gpt-3-encoder"];
    return config;
  },
};

module.exports = nextConfig;
