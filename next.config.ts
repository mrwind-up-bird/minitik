import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel serverless: externalize native Node.js packages
  serverExternalPackages: [
    "@prisma/client",
    "prisma",
    "ioredis",
    "bullmq",
    "mongodb",
    "web-push",
  ],

  // PWA headers
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
