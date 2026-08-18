import type { MetadataRoute } from "next";

// TODO: Replace with your production domain before deployment.
const BASE_URL = "https://YOUR-DOMAIN-HERE.com";

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
