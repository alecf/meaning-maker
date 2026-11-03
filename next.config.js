const { PHASE_DEVELOPMENT_SERVER } = require("next/constants");
const { initOpenNextCloudflareForDev } = require("@opennextjs/cloudflare");

/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = (phase) => {
  // Makes the Cloudflare bindings (AI, EMBED_CACHE) available to
  // `getCloudflareContext()` during `next dev`. Only in dev: the AI binding is
  // always remote, so starting the proxy needs Cloudflare credentials, which
  // builds (CI, Workers Builds) shouldn't require.
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    initOpenNextCloudflareForDev();
  }
  return nextConfig;
};
