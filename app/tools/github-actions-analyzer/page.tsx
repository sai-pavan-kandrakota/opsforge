import type { Metadata } from "next";

import ClientComponent from "./ClientComponent";

export const metadata: Metadata = {
  title: "GitHub Actions Analyzer - OpsForge",
  description: "Analyze GitHub Actions workflows for CI/CD security, reliability, permissions, and best practices."
};

export default function Page() {
  return <ClientComponent />;
}
