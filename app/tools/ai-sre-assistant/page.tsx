import type { Metadata } from "next";

import ClientComponent from "./ClientComponent";

export const metadata: Metadata = {
  title: "AI SRE Assistant - OpsForge",
  description: "Troubleshoot Kubernetes, AWS, CI/CD, networking, Docker, and application incidents with structured SRE guidance."
};

export default function Page() {
  return <ClientComponent />;
}
