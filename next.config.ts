import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        // Allow any https image (for hotel cover images from external sources)
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
