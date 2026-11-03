import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache: the app has no ISR or cached fetches.
export default defineCloudflareConfig();
