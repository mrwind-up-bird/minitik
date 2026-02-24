import { NextRequest } from "next/server";
import { handlePlatformHealth } from "@/apps/api/routes/platforms";

export async function GET(request: NextRequest) {
  return handlePlatformHealth(request);
}
