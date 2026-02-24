import { NextRequest } from "next/server";
import {
  handleGetPublishingStatus,
  handleRollback,
} from "@/apps/api/routes/publishing";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleGetPublishingStatus(request, id);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleRollback(request, id);
}
