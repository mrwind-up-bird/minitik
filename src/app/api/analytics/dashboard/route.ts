import { NextRequest } from "next/server";
import { dashboardHandler } from "@/apps/api/routes/analytics";

export async function GET(request: NextRequest) {
  return dashboardHandler(request);
}
