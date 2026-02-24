import { NextRequest } from "next/server";
import { bulkScheduleHandler } from "@/apps/api/routes/scheduling";

export async function POST(request: NextRequest) {
  return bulkScheduleHandler(request);
}
