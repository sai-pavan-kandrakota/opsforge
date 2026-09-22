import type { Metadata } from "next";

import SiteFooter from "@/app/components/SiteFooter";
import SiteHeader from "@/app/components/SiteHeader";

import ClientComponent from "./ClientComponent";

export const metadata: Metadata = {
  title: "Cron Generator - OpsForge",
  description:
    "Create, validate, and understand cron expressions for Linux, DevOps automation, CI/CD jobs, and scheduled tasks.",
};

export default function Page() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <SiteHeader />
      <ClientComponent />
      <SiteFooter />
    </main>
  );
}
