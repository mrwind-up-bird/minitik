import { NextRequest } from "next/server";
import { contentMetricsHandler } from "@/apps/api/routes/analytics";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  return contentMetricsHandler(request, { params: resolvedParams });
}
