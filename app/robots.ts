import type { MetadataRoute } from "next";

// TODO: Replace with your production domain before deployment.
const BASE_URL = "https://YOUR-DOMAIN-HERE.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
