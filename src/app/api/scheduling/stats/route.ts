import { NextRequest } from "next/server";
import { queueStatsHandler } from "@/apps/api/routes/scheduling";

export async function GET(request: NextRequest) {
  return queueStatsHandler(request);
}
