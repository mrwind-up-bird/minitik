"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// ─── Nav items ────────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  activeIcon: React.ReactNode;
}

function HomeIcon({ filled }: { filled?: boolean }) {
  return filled ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
      <path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" />
      <path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.43z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  );
}

function VideoIcon({ filled }: { filled?: boolean }) {
  return filled ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
      <path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6" aria-hidden="true">
      <path strokeLinecap="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function CalendarIcon({ filled }: { filled?: boolean }) {
  return filled ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
      <path d="M12.75 12.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM7.5 15.75a.75.75 0 100-1.5.75.75 0 000 1.5zM8.25 17.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM9.75 15.75a.75.75 0 100-1.5.75.75 0 000 1.5zM10.5 17.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12 15.75a.75.75 0 100-1.5.75.75 0 000 1.5zM12.75 17.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM14.25 15.75a.75.75 0 100-1.5.75.75 0 000 1.5zM15 17.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM16.5 15.75a.75.75 0 100-1.5.75.75 0 000 1.5zM15 12.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM16.5 13.5a.75.75 0 100-1.5.75.75 0 000 1.5z" />
      <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}

function ChartIcon({ filled }: { filled?: boolean }) {
  return filled ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
      <path d="M18.375 2.25c-1.035 0-1.875.84-1.875 1.875v15.75c0 1.035.84 1.875 1.875 1.875h.75c1.035 0 1.875-.84 1.875-1.875V4.125c0-1.036-.84-1.875-1.875-1.875h-.75zM9.75 8.625c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875h-.75a1.875 1.875 0 01-1.875-1.875V8.625zM3 13.125c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v6.75c0 1.035-.84 1.875-1.875 1.875h-.75A1.875 1.875 0 013 19.875v-6.75z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function UserIcon({ filled }: { filled?: boolean }) {
  return filled ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
      <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}

// ─── Upload FAB ───────────────────────────────────────────────────────────────

function UploadFAB({ active }: { active: boolean }) {
  return (
    <div
      className={[
        "flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all duration-200",
        active
          ? "bg-violet-700 ring-2 ring-violet-400 ring-offset-2 ring-offset-white dark:ring-offset-neutral-950"
          : "bg-violet-600",
      ].join(" ")}
      aria-hidden="true"
    >
      <svg
        className="h-6 w-6 text-white"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    </div>
  );
}

// ─── Bottom tab bar ───────────────────────────────────────────────────────────

/**
 * Mobile-first bottom navigation bar.
 *
 * Touch targets are at least 44×44px per WCAG 2.5.5 and Apple HIG guidelines.
 * The Upload tab is elevated as a FAB (floating action button).
 */
export function MobileNav() {
  const pathname = usePathname();

  const navItems: NavItem[] = [
    {
      label: "Home",
      href: "/",
      icon: <HomeIcon />,
      activeIcon: <HomeIcon filled />,
    },
    {
      label: "Content",
      href: "/content",
      icon: <VideoIcon />,
      activeIcon: <VideoIcon filled />,
    },
    {
      label: "Upload",
      href: "/upload",
      icon: <UploadFAB active={pathname === "/upload"} />,
      activeIcon: <UploadFAB active />,
    },
    {
      label: "Schedule",
      href: "/schedule",
      icon: <CalendarIcon />,
      activeIcon: <CalendarIcon filled />,
    },
    {
      label: "Analytics",
      href: "/analytics",
      icon: <ChartIcon />,
      activeIcon: <ChartIcon filled />,
    },
  ];

  return (
    <nav
      aria-label="Main navigation"
      className={[
        "fixed bottom-0 inset-x-0 z-40",
        "border-t border-neutral-200 dark:border-neutral-800",
        "bg-white/95 dark:bg-neutral-950/95 backdrop-blur-sm",
        // Safe area inset for phones with home indicator
        "pb-safe",
      ].join(" ")}
    >
      <ul
        role="list"
        className="flex items-end justify-around px-2"
        style={{ height: "64px" }}
      >
        {navItems.map((item) => {
          const isUpload = item.href === "/upload";
          const isActive = isUpload
            ? pathname === "/upload"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "flex flex-col items-center justify-center gap-0.5",
                  "w-full transition-colors duration-150",
                  // 44px minimum touch target
                  "min-h-[44px] min-w-[44px]",
                  isUpload ? "-mt-5" : "pt-1",
                  isActive && !isUpload
                    ? "text-violet-600 dark:text-violet-400"
                    : !isUpload
                    ? "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {isActive ? item.activeIcon : item.icon}

                {!isUpload && (
                  <span
                    className={[
                      "text-[10px] font-medium leading-none",
                      isActive
                        ? "text-violet-600 dark:text-violet-400"
                        : "text-neutral-500 dark:text-neutral-400",
                    ].join(" ")}
                  >
                    {item.label}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ─── Desktop sidebar nav ──────────────────────────────────────────────────────

interface SidebarNavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  activeIcon: React.ReactNode;
}

/**
 * Sidebar navigation for tablet/desktop (md+). Shows the same destinations
 * as the mobile bottom bar but in a vertical list.
 */
export function SidebarNav() {
  const pathname = usePathname();

  const items: SidebarNavItem[] = [
    {
      label: "Home",
      href: "/",
      icon: <HomeIcon />,
      activeIcon: <HomeIcon filled />,
    },
    {
      label: "Content",
      href: "/content",
      icon: <VideoIcon />,
      activeIcon: <VideoIcon filled />,
    },
    {
      label: "Upload",
      href: "/upload",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
      ),
      activeIcon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
          <path fillRule="evenodd" d="M11.47 2.47a.75.75 0 011.06 0l4.5 4.5a.75.75 0 01-1.06 1.06l-3.22-3.22V16.5a.75.75 0 01-1.5 0V4.81L8.03 8.03a.75.75 0 01-1.06-1.06l4.5-4.5zM3 15.75a.75.75 0 01.75.75v2.25a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5V16.5a.75.75 0 011.5 0v2.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V16.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
        </svg>
      ),
    },
    {
      label: "Schedule",
      href: "/schedule",
      icon: <CalendarIcon />,
      activeIcon: <CalendarIcon filled />,
    },
    {
      label: "Analytics",
      href: "/analytics",
      icon: <ChartIcon />,
      activeIcon: <ChartIcon filled />,
    },
    {
      label: "Accounts",
      href: "/accounts",
      icon: <UserIcon />,
      activeIcon: <UserIcon filled />,
    },
  ];

  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-1 p-3">
      {items.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={isActive ? "page" : undefined}
            className={[
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              // 44px touch target
              "min-h-[44px]",
              isActive
                ? "bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300"
                : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100",
            ].join(" ")}
          >
            {isActive ? item.activeIcon : item.icon}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
