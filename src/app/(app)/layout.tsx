import { SidebarNav } from "@/apps/web/components/mobile/mobile-nav";
import { MobileNavWrapper } from "../mobile-nav-wrapper";
import { OfflineWrapper } from "../offline-wrapper";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
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
    </>
  );
}
