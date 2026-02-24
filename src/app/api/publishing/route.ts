import { NextRequest } from "next/server";
import { handlePublish } from "@/apps/api/routes/publishing";

export async function POST(request: NextRequest) {
  return handlePublish(request);
}
