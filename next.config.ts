import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-only overlay button sits at the bottom-left, directly over the
  // Home tab at phone widths, so every screenshot taken for review showed a
  // control that does not exist in production.
  devIndicators: false,
};

export default nextConfig;
