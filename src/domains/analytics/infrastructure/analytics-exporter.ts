import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getRawAnalyticsForExport, type TimeRange, type ExportRow } from "./analytics-repository";

// ─── S3 setup ─────────────────────────────────────────────────────────────────

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  },
});

const BUCKET = process.env.AWS_S3_BUCKET ?? "";
const EXPORT_PRESIGN_TTL = 3600; // 1 hour download link

// ─── CSV serialisation ────────────────────────────────────────────────────────

const CSV_HEADERS = [
  "date",
  "contentId",
  "platform",
  "accountId",
  "views",
  "likes",
  "comments",
  "shares",
  "reach",
  "impressions",
  "engagementRate",
] as const;

function escapeCsvField(value: string | number): string {
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowsToCsv(rows: ExportRow[]): string {
  const header = CSV_HEADERS.join(",");
  const lines = rows.map((row) =>
    CSV_HEADERS.map((col) => escapeCsvField(row[col])).join(",")
  );
  return [header, ...lines].join("\n");
}

// ─── JSON serialisation ───────────────────────────────────────────────────────

function rowsToJson(rows: ExportRow[]): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), rows }, null, 2);
}

// ─── Upload to S3 ─────────────────────────────────────────────────────────────

async function uploadToS3(
  key: string,
  body: string,
  contentType: string
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      ServerSideEncryption: "AES256",
    })
  );

  // Return a pre-signed download URL
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn: EXPORT_PRESIGN_TTL });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type ExportFormat = "csv" | "json";

export interface ExportResult {
  downloadUrl: string;
  rowCount: number;
  format: ExportFormat;
  expiresAt: Date;
}

export async function exportAnalytics(params: {
  userId: string;
  timeRange: TimeRange;
  format: ExportFormat;
  platforms?: string[];
}): Promise<ExportResult> {
  const { userId, timeRange, format, platforms } = params;

  const rows = await getRawAnalyticsForExport(userId, timeRange, platforms);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ext = format === "csv" ? "csv" : "json";
  const key = `exports/${userId}/analytics-${timeRange}-${timestamp}.${ext}`;

  let body: string;
  let contentType: string;

  if (format === "csv") {
    body = rowsToCsv(rows);
    contentType = "text/csv";
  } else {
    body = rowsToJson(rows);
    contentType = "application/json";
  }

  const downloadUrl = await uploadToS3(key, body, contentType);

  const expiresAt = new Date(Date.now() + EXPORT_PRESIGN_TTL * 1000);

  return {
    downloadUrl,
    rowCount: rows.length,
    format,
    expiresAt,
  };
}
