import type { Metadata } from "next";

import ClientComponent from "./ClientComponent";

export const metadata: Metadata = {
  title: "Kubernetes Manifest Analyzer - OpsForge",
  description: "Analyze Kubernetes Deployments for security, reliability, resource, probe, and production-readiness issues."
};

export default function Page() {
  return <ClientComponent />;
}
