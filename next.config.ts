import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: {
    // Defaults to bottom-left, where it sits directly on top of the sidebar's
    // bottom buttons and swallows their clicks in development.
    position: "bottom-right",
  },
};

export default nextConfig;
