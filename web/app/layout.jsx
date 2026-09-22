import "./globals.css";
export const metadata = {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://app.signalam.invalid"),
    title: "Signalam — Clear warnings. Private by design.",
    description: "Privacy-first server-based website and email detection with minimized shared insights and clear decision support.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
        title: "Signalam — Private by design. Clear when it matters.",
        description: "Privacy-first server-based detection with clear, minimized shared insights.",
        type: "website",
        images: [{ url: "/og-signalam.png", width: 1536, height: 1024, alt: "Signalam — Clear warnings. Private by design." }],
    },
    twitter: {
        card: "summary_large_image",
        title: "Signalam — Private by design. Clear when it matters.",
        description: "Privacy-first server-based detection with clear, minimized shared insights.",
        images: ["/og-signalam.png"],
    },
};
export default function RootLayout({ children }) {
    return (<html lang="en">
      <body>{children}</body>
    </html>);
}
