"use client";

import React, { useCallback, useRef, useState } from "react";

const ALLOWED_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const ALLOWED_EXTENSIONS = [".mp4", ".mov", ".webm"];
const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function validateFile(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `Unsupported format. Please upload MP4, MOV, or WebM files.`;
    }
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File too large (${formatBytes(file.size)}). Maximum size is 1 GB.`;
  }
  if (file.size === 0) {
    return "File appears to be empty.";
  }
  return null;
}

export interface UploadZoneFile {
  file: File;
  title: string;
}

interface UploadZoneProps {
  onFilesSelected: (files: UploadZoneFile[]) => void;
  disabled?: boolean;
  multiple?: boolean;
}

export function UploadZone({ onFilesSelected, disabled = false, multiple = false }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(
    (fileList: FileList) => {
      const valid: UploadZoneFile[] = [];
      const errs: string[] = [];

      Array.from(fileList).forEach((file) => {
        const err = validateFile(file);
        if (err) {
          errs.push(`${file.name}: ${err}`);
        } else {
          const title = file.name.replace(/\.[^.]+$/, "");
          valid.push({ file, title });
        }
      });

      setErrors(errs);
      if (valid.length > 0) {
        onFilesSelected(multiple ? valid : [valid[0]]);
      }
    },
    [onFilesSelected, multiple]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) setIsDragging(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (disabled) return;

      const { files } = e.dataTransfer;
      if (files && files.length > 0) {
        processFiles(files);
      }
    },
    [disabled, processFiles]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { files } = e.target;
      if (files && files.length > 0) {
        processFiles(files);
      }
      // Reset input so the same file can be re-selected
      e.target.value = "";
    },
    [processFiles]
  );

  const handleClick = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div className="w-full">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload video file"
        aria-disabled={disabled}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={[
          "relative flex flex-col items-center justify-center",
          "w-full min-h-48 rounded-2xl border-2 border-dashed",
          "transition-colors duration-200 cursor-pointer select-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
          isDragging
            ? "border-violet-400 bg-violet-50 dark:bg-violet-950/30"
            : "border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 hover:border-violet-400 hover:bg-violet-50/50 dark:hover:bg-violet-950/20",
          disabled ? "opacity-50 cursor-not-allowed" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_EXTENSIONS.join(",")}
          multiple={multiple}
          disabled={disabled}
          onChange={handleInputChange}
          className="sr-only"
          aria-hidden="true"
        />

        {/* Upload icon */}
        <div
          className={[
            "mb-4 rounded-full p-4 transition-colors",
            isDragging
              ? "bg-violet-100 dark:bg-violet-900/50"
              : "bg-neutral-100 dark:bg-neutral-800",
          ].join(" ")}
        >
          <svg
            className={[
              "h-8 w-8",
              isDragging ? "text-violet-500" : "text-neutral-400",
            ].join(" ")}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>
        </div>

        {isDragging ? (
          <p className="text-base font-medium text-violet-600 dark:text-violet-400">
            Drop to upload
          </p>
        ) : (
          <>
            <p className="mb-1 text-base font-medium text-neutral-700 dark:text-neutral-200">
              Drag & drop a video here
            </p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              or{" "}
              <span className="text-violet-600 dark:text-violet-400 underline underline-offset-2">
                browse files
              </span>
            </p>
          </>
        )}

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {["MP4", "MOV", "WebM"].map((fmt) => (
            <span
              key={fmt}
              className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-3 py-0.5 text-xs font-medium text-neutral-600 dark:text-neutral-300"
            >
              {fmt}
            </span>
          ))}
          <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-3 py-0.5 text-xs font-medium text-neutral-600 dark:text-neutral-300">
            Up to 1 GB
          </span>
        </div>
      </div>

      {errors.length > 0 && (
        <ul
          role="alert"
          className="mt-3 space-y-1"
          aria-label="Upload errors"
        >
          {errors.map((err, i) => (
            <li
              key={i}
              className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-400"
            >
              <svg
                className="mt-0.5 h-4 w-4 flex-shrink-0"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
              {err}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
