import { NextRequest } from "next/server";
import {
  scheduleHandler,
  listJobsHandler,
} from "@/apps/api/routes/scheduling";

export async function POST(request: NextRequest) {
  return scheduleHandler(request);
}

export async function GET(request: NextRequest) {
  return listJobsHandler(request);
}
