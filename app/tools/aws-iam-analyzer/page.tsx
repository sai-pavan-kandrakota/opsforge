import type { Metadata } from "next";

import ClientComponent from "./ClientComponent";

export const metadata: Metadata = {
  title: "AWS IAM Policy Analyzer - OpsForge",
  description: "Analyze AWS IAM policies for excessive permissions, wildcard access, security risks, and least-privilege issues."
};

export default function Page() {
  return <ClientComponent />;
}
