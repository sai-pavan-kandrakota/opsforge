import type { Metadata } from "next";

import ClientComponent from "./ClientComponent";

export const metadata: Metadata = {
  title: "Dockerfile Analyzer - OpsForge",
  description: "Analyze Dockerfiles for security, image hygiene, reliability, and production-readiness issues."
};

export default function Page() {
  return <ClientComponent />;
}
