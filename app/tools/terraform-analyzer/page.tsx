import type { Metadata } from "next";

import ClientComponent from "./ClientComponent";

export const metadata: Metadata = {
  title: "Terraform Analyzer - OpsForge",
  description: "Analyze Terraform configuration for security, reliability, maintainability, and infrastructure best practices."
};

export default function Page() {
  return <ClientComponent />;
}
