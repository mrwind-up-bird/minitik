import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Minitik — Short-form Video Scheduler",
  description:
    "Schedule and publish short-form videos to TikTok, Instagram, and YouTube from one place.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Minitik",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ colorScheme: "dark" }}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-nyx-midnight text-nyx-text`}
      >
        <Providers>
          {children}
          <footer className="w-full border-t border-nyx-border py-4 text-center text-xs text-nyx-muted">
            &copy;2026 &mdash;{" "}
            <a
              href="https://nyxcore.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-nyx-cyan/70 hover:text-nyx-cyan transition-colors"
            >
              nyxCore
            </a>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
