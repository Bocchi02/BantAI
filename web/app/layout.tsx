import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "BantAI — Clear warnings. Private by design.",
  description:
    "Privacy-first local website and email detection with minimized shared insights and clear decision support.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "BantAI — Private by design. Clear when it matters.",
    description: "Privacy-first local detection with clear, minimized shared insights.",
    type: "website",
    images: [{ url: "/og-landing.png", width: 1536, height: 1024, alt: "BantAI — Clear warnings. Private by design." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "BantAI — Private by design. Clear when it matters.",
    description: "Privacy-first local detection with clear, minimized shared insights.",
    images: ["/og-landing.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
