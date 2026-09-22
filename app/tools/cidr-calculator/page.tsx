import type { Metadata } from "next";

import SiteFooter from "@/app/components/SiteFooter";
import SiteHeader from "@/app/components/SiteHeader";

import ClientComponent from "./ClientComponent";

export const metadata: Metadata = {
  title: "CIDR Calculator - OpsForge",
  description:
    "Calculate subnet masks, network ranges, usable hosts, and broadcast addresses from an IPv4 CIDR block, entirely in your browser.",
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
