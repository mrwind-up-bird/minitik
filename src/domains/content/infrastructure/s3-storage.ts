import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  },
});

const BUCKET = process.env.AWS_S3_BUCKET ?? "";
const PRESIGN_EXPIRES = 3600; // 1 hour

export interface MultipartUploadInit {
  uploadId: string;
  key: string;
}

export interface PresignedChunkUrl {
  partNumber: number;
  url: string;
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

export async function initiateMultipartUpload(
  key: string,
  mimeType: string
): Promise<MultipartUploadInit> {
  const command = new CreateMultipartUploadCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: mimeType,
    ServerSideEncryption: "AES256",
  });

  const response = await s3.send(command);

  if (!response.UploadId) {
    throw new Error("Failed to initiate multipart upload: no UploadId returned");
  }

  return { uploadId: response.UploadId, key };
}

export async function getPresignedChunkUrl(
  key: string,
  uploadId: string,
  partNumber: number
): Promise<string> {
  const command = new UploadPartCommand({
    Bucket: BUCKET,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });

  return getSignedUrl(s3, command, { expiresIn: PRESIGN_EXPIRES });
}

export async function getPresignedChunkUrls(
  key: string,
  uploadId: string,
  totalParts: number
): Promise<PresignedChunkUrl[]> {
  const urls = await Promise.all(
    Array.from({ length: totalParts }, (_, i) =>
      getPresignedChunkUrl(key, uploadId, i + 1).then((url) => ({
        partNumber: i + 1,
        url,
      }))
    )
  );

  return urls;
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: CompletedPart[]
): Promise<string> {
  const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);

  const command = new CompleteMultipartUploadCommand({
    Bucket: BUCKET,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: sorted.map((p) => ({
        PartNumber: p.partNumber,
        ETag: p.etag,
      })),
    },
  });

  const response = await s3.send(command);

  if (!response.Location) {
    throw new Error("Multipart upload completion returned no location");
  }

  return response.Location;
}

export async function abortMultipartUpload(
  key: string,
  uploadId: string
): Promise<void> {
  const command = new AbortMultipartUploadCommand({
    Bucket: BUCKET,
    Key: key,
    UploadId: uploadId,
  });

  await s3.send(command);
}

export async function deleteObject(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  await s3.send(command);
}

export async function getPresignedDownloadUrl(
  key: string,
  expiresIn = PRESIGN_EXPIRES
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  return getSignedUrl(s3, command, { expiresIn });
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    const command = new HeadObjectCommand({ Bucket: BUCKET, Key: key });
    await s3.send(command);
    return true;
  } catch {
    return false;
  }
}

export function buildContentKey(userId: string, contentId: string, filename: string): string {
  return `content/${userId}/${contentId}/${filename}`;
}

export function buildThumbnailKey(userId: string, contentId: string): string {
  return `thumbnails/${userId}/${contentId}/thumbnail.jpg`;
}
