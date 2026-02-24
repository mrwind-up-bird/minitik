import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { OfflineWrapper } from "./offline-wrapper";
import { SidebarNav } from "@/apps/web/components/mobile/mobile-nav";
import { MobileNavWrapper } from "./mobile-nav-wrapper";

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
          <OfflineWrapper />

          <div className="flex min-h-screen">
            {/* Desktop sidebar */}
            <aside className="hidden md:flex md:w-56 md:flex-col md:border-r md:border-neutral-200 dark:md:border-neutral-800 md:bg-white dark:md:bg-neutral-950">
              <div className="flex h-14 items-center px-4">
                <span className="text-lg font-bold tracking-tight text-violet-600">
                  minitik
                </span>
              </div>
              <SidebarNav />
            </aside>

            {/* Main content area */}
            <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
              <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
                {children}
              </div>
            </main>
          </div>

          {/* Mobile bottom nav */}
          <MobileNavWrapper />
        </Providers>
      </body>
    </html>
  );
}
