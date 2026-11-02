import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The old Actions page goes to Today (Stage 7). Retired in Stage 10: the old business list,
  // the AI Daily Briefing page, Insights and the Mastersheet import page.
  async redirects() {
    return [
      { source: '/actions', destination: '/today', permanent: false },
      { source: '/dashboard', destination: '/businesses', permanent: false },
      { source: '/daily-briefing', destination: '/today', permanent: false },
      { source: '/insights', destination: '/today', permanent: false },
      { source: '/admin/import', destination: '/businesses', permanent: false },
    ]
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
