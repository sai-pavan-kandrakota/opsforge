import type { Metadata } from "next";

import SiteFooter from "@/app/components/SiteFooter";
import SiteHeader from "@/app/components/SiteHeader";

import ClientComponent from "./ClientComponent";

export const metadata: Metadata = {
  title: "JSON Formatter - OpsForge",
  description:
    "Format, validate, pretty-print, and minify JSON directly in your browser, with syntax error detection.",
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
