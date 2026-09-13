import type { NextConfig } from "next";
import deploymentProfile from "./deployment-profile.json";
import { getBuildModuleEnvironment } from "./src/lib/client-release/build-policy";

const nextConfig: NextConfig = {
  output: "standalone",
  // Bake one policy into server, middleware, and client bundles.
  env: getBuildModuleEnvironment(deploymentProfile.profile),
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ]
  },
};

export default nextConfig;
