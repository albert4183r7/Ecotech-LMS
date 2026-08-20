import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // pdf-parse bundles pdfjs, which loads pdf.worker.mjs by a path relative to
  // its own module. Bundling it rewrites that path into .next/**/chunks, where
  // the worker does not exist, and every PDF fails with "Setting up fake
  // worker failed". Keeping it external leaves the require in node_modules so
  // the worker resolves.
  serverExternalPackages: ["pdf-parse"],
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: ["preview-chat-0ac48944-a720-492b-b1ae-4e28e23652c2.space-z.ai"],
};

export default nextConfig;
