import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://opsforge-mu.vercel.app"),
  title: "OpsForge - Free DevOps, Kubernetes, Terraform & SRE Tools",
  description:
    "Free online DevOps and SRE tools for Kubernetes, Terraform, Docker, GitHub Actions, AWS IAM, networking, YAML, JSON, and incident troubleshooting.",
  keywords: [
    "DevOps tools",
    "SRE tools",
    "Kubernetes tools",
    "Terraform tools",
    "Docker tools",
    "AWS tools",
    "CI/CD tools",
    "Kubernetes analyzer",
    "Terraform analyzer",
    "Dockerfile analyzer",
    "GitHub Actions analyzer",
    "IAM policy analyzer",
    "SRE troubleshooting",
  ],
  openGraph: {
    title: "OpsForge - Free DevOps, Kubernetes, Terraform & SRE Tools",
    description:
      "Free online DevOps and SRE tools for Kubernetes, Terraform, Docker, GitHub Actions, AWS IAM, networking, YAML, JSON, and incident troubleshooting.",
    type: "website",
    siteName: "OpsForge",
  },
  twitter: {
    card: "summary_large_image",
  },
  verification: {
    google: "GXVqYct4BpZmXuFq_rnwXjumSFsBWUnXjgxVwKX_wrc",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
