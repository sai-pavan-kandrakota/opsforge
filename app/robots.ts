import type { MetadataRoute } from "next";

// Production site URL configured for the deployed Vercel app.
const BASE_URL = "https://opsforge-mu.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
