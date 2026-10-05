import type { NextConfig } from "next";
import deploymentProfile from "./deployment-profile.json";
import { getBuildModuleEnvironment } from "./src/lib/client-release/build-policy";

const nextConfig: NextConfig = {
  output: "standalone",
  // Bake one policy into server, middleware, and client bundles.
  env: getBuildModuleEnvironment(deploymentProfile.profile),
  async headers() {
    const guestHeaders = [
      { key: 'Cache-Control', value: 'private, no-store' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
    ]
    return [
      { source: '/stay/:path*', headers: guestHeaders },
      { source: '/api/guest-portal/:path*', headers: guestHeaders },
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
