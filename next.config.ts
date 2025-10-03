import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/djar4vpub/**", // restrict to your Cloudinary account
      },
    ],
  },
};

export default nextConfig;
