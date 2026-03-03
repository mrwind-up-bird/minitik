"use client";

import { useRouter } from "next/navigation";
import { ContentLibrary } from "@/apps/web/components/content/content-library";

export default function ContentPage() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-nyx-text">
          Content Library
        </h1>
        <p className="mt-1 text-sm text-nyx-muted">
          Manage your video content across all platforms.
        </p>
      </div>

      <ContentLibrary
        onUploadClick={() => router.push("/upload")}
      />
    </div>
  );
}
