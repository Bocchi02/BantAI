import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "BantAI — Decision support for safer browsing",
  description:
    "Review privacy-minimized website and email checks from your BantAI companion.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "BantAI — Private by design. Clear when it matters.",
    description: "Privacy-first local detection with clear, minimized shared insights.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "BantAI privacy-first decision support" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "BantAI — Private by design. Clear when it matters.",
    description: "Privacy-first local detection with clear, minimized shared insights.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
