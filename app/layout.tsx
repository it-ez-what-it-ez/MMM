import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const socialImage = `${protocol}://${host}/growthos-social-preview.png`;

  return {
    title: "GrowthOS — Marketing, orchestrated",
    description:
      "Plan, create, approve, activate, and learn across every marketing channel from one AI marketing control plane.",
    openGraph: {
      title: "GrowthOS — Marketing, orchestrated",
      description:
        "The AI marketing control plane for coordinated, brand-aware campaigns.",
      type: "website",
      images: [
        {
          url: socialImage,
          width: 1731,
          height: 909,
          alt: "GrowthOS marketing orchestration workflow",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "GrowthOS — Marketing, orchestrated",
      description:
        "The AI marketing control plane for coordinated, brand-aware campaigns.",
      images: [socialImage],
    },
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
