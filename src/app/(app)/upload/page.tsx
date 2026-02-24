"use client";

import { useCallback, useRef, useState } from "react";
import { UploadZone, UploadZoneFile } from "@/apps/web/components/content/upload-zone";
import { UploadQueue, UploadItem } from "@/apps/web/components/content/upload-progress";

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB

interface UploadEntry {
  id: string;
  file: File;
  title: string;
  status: UploadItem["status"];
  chunks: { completed: number; total: number };
  bytesUploaded: number;
  speedBytesPerSecond: number;
  etaSeconds: number;
  error?: string;
  abortController?: AbortController;
}

export default function UploadPage() {
  const [uploads, setUploads] = useState<UploadEntry[]>([]);
  const nextId = useRef(0);

  const updateUpload = useCallback(
    (id: string, patch: Partial<UploadEntry>) => {
      setUploads((prev) =>
        prev.map((u) => (u.id === id ? { ...u, ...patch } : u))
      );
    },
    []
  );

  const uploadFile = useCallback(
    async (entry: UploadEntry) => {
      const { id, file, title } = entry;
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      const controller = new AbortController();

      updateUpload(id, {
        status: "uploading",
        chunks: { completed: 0, total: totalChunks },
        abortController: controller,
      });

      try {
        // 1. Initiate multipart upload
        const initRes = await fetch("/api/content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            filename: file.name,
            mimeType: file.type,
            fileSize: file.size,
          }),
          signal: controller.signal,
        });

        if (!initRes.ok) {
          const body = await initRes.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? "Upload initiation failed");
        }

        const { contentId, uploadId, presignedUrls } = await initRes.json();
        const startTime = Date.now();

        // 2. Upload chunks
        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const chunk = file.slice(start, end);

          const url = presignedUrls?.[i];
          if (url) {
            await fetch(url, {
              method: "PUT",
              body: chunk,
              signal: controller.signal,
            });
          }

          const bytesUploaded = end;
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = elapsed > 0 ? bytesUploaded / elapsed : 0;
          const remaining = file.size - bytesUploaded;
          const eta = speed > 0 ? Math.ceil(remaining / speed) : 0;

          updateUpload(id, {
            chunks: { completed: i + 1, total: totalChunks },
            bytesUploaded,
            speedBytesPerSecond: Math.round(speed),
            etaSeconds: eta,
          });
        }

        // 3. Mark processing
        updateUpload(id, { status: "processing" });

        // Complete would be called here in full implementation
        updateUpload(id, { status: "complete" });
      } catch (err) {
        if (controller.signal.aborted) {
          updateUpload(id, { status: "aborted" });
        } else {
          updateUpload(id, {
            status: "error",
            error: err instanceof Error ? err.message : "Upload failed",
          });
        }
      }
    },
    [updateUpload]
  );

  const handleFilesSelected = useCallback(
    (files: UploadZoneFile[]) => {
      const newEntries: UploadEntry[] = files.map(({ file, title }) => {
        const id = String(++nextId.current);
        return {
          id,
          file,
          title,
          status: "idle" as const,
          chunks: { completed: 0, total: Math.ceil(file.size / CHUNK_SIZE) },
          bytesUploaded: 0,
          speedBytesPerSecond: 0,
          etaSeconds: 0,
        };
      });

      setUploads((prev) => [...prev, ...newEntries]);
      newEntries.forEach((entry) => uploadFile(entry));
    },
    [uploadFile]
  );

  const handleCancel = useCallback(
    (id: string) => {
      const entry = uploads.find((u) => u.id === id);
      entry?.abortController?.abort();
    },
    [uploads]
  );

  const handleRetry = useCallback(
    (id: string) => {
      const entry = uploads.find((u) => u.id === id);
      if (entry) {
        uploadFile({
          ...entry,
          status: "idle",
          chunks: { completed: 0, total: Math.ceil(entry.file.size / CHUNK_SIZE) },
          bytesUploaded: 0,
          speedBytesPerSecond: 0,
          etaSeconds: 0,
          error: undefined,
        });
      }
    },
    [uploads, uploadFile]
  );

  const queueItems: UploadItem[] = uploads.map((u) => ({
    id: u.id,
    filename: u.file.name,
    status: u.status,
    chunks: u.chunks,
    bytesUploaded: u.bytesUploaded,
    totalBytes: u.file.size,
    speedBytesPerSecond: u.speedBytesPerSecond,
    etaSeconds: u.etaSeconds,
    error: u.error,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
          Upload Video
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Drag and drop videos or browse to upload. Supports MP4, MOV, and WebM up to 1 GB.
        </p>
      </div>

      <UploadZone
        onFilesSelected={handleFilesSelected}
        multiple
        disabled={uploads.some((u) => u.status === "uploading")}
      />

      <UploadQueue
        uploads={queueItems}
        onCancel={handleCancel}
        onRetry={handleRetry}
      />
    </div>
  );
}
