import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The old Actions page; anything still pointing at it goes to Today (Stage 7).
  async redirects() {
    return [{ source: '/actions', destination: '/today', permanent: false }]
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
