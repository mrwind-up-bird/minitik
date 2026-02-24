"use client";

import { MobileNav } from "@/apps/web/components/mobile/mobile-nav";

export function MobileNavWrapper() {
  return (
    <div className="md:hidden">
      <MobileNav />
    </div>
  );
}
