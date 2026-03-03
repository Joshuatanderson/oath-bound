import { config } from "dotenv";
import { resolve } from "path";
import type { NextConfig } from "next";

// Load shared env from repo root (parent of frontend/)
config({ path: resolve(__dirname, "..", ".env") });

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
