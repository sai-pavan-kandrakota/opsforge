import type { Metadata } from "next";

import ClientComponent from "./ClientComponent";

export const metadata: Metadata = {
  title: "Helm Analyzer - OpsForge",
  description: "Analyze Helm charts and Kubernetes templates for security, reliability, resources, probes, and production-readiness issues."
};

export default function Page() {
  return <ClientComponent />;
}
