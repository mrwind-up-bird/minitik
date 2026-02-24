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
  themeColor: "#ff0050",
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
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          {children}
          <footer className="w-full py-4 text-center text-xs text-neutral-400 dark:text-neutral-500">
            &copy; 2026 built by{" "}
            <a
              href="https://nyxcore.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
            >
              nyxCore
            </a>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
