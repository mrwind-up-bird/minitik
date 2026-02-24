import { NextRequest } from "next/server";
import {
  getJobStatusHandler,
  cancelJobHandler,
} from "@/apps/api/routes/scheduling";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  return getJobStatusHandler(request, { params: resolvedParams });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  return cancelJobHandler(request, { params: resolvedParams });
}
