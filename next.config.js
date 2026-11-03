const { initOpenNextCloudflareForDev } = require("@opennextjs/cloudflare");

/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = nextConfig;

// Makes the Cloudflare bindings (AI, EMBED_CACHE) available to
// `getCloudflareContext()` during `next dev`.
initOpenNextCloudflareForDev();
