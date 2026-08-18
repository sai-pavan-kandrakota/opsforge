import type { MetadataRoute } from "next";

// Production site URL configured for the deployed Vercel app.
const BASE_URL = "https://opsforge-mu.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const urls = [
    "",
    "/about",
    "/privacy",
    "/terms",
    "/contact",
    "/tools/cidr-calculator",
    "/tools/json-formatter",
    "/tools/cron-generator",
    "/tools/yaml-validator",
    "/tools/kubernetes-generator",
    "/tools/kubernetes-analyzer",
    "/tools/dockerfile-analyzer",
    "/tools/github-actions-analyzer",
    "/tools/helm-analyzer",
    "/tools/terraform-analyzer",
    "/tools/aws-iam-analyzer",
    "/tools/ai-sre-assistant",
  ];

  return urls.map((url) => ({
    url: `${BASE_URL}${url === "" ? "/" : url}`,
    lastModified: new Date(),
  }));
}
