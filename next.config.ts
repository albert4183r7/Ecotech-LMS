import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: ["preview-chat-0ac48944-a720-492b-b1ae-4e28e23652c2.space-z.ai"],
};

export default nextConfig;
