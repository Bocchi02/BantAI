import "./globals.css";
export const metadata = {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://app.bantai.invalid"),
    title: "BantAI — Clear warnings. Private by design.",
    description: "Privacy-first server-based website and email detection with minimized shared insights and clear decision support.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
        title: "BantAI — Private by design. Clear when it matters.",
        description: "Privacy-first server-based detection with clear, minimized shared insights.",
        type: "website",
        images: [{ url: "/og-landing.png", width: 1536, height: 1024, alt: "BantAI — Clear warnings. Private by design." }],
    },
    twitter: {
        card: "summary_large_image",
        title: "BantAI — Private by design. Clear when it matters.",
        description: "Privacy-first server-based detection with clear, minimized shared insights.",
        images: ["/og-landing.png"],
    },
};
export default function RootLayout({ children }) {
    return (<html lang="en">
      <body>{children}</body>
    </html>);
}
