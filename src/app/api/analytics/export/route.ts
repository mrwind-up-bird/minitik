import { NextRequest } from "next/server";
import { exportHandler } from "@/apps/api/routes/analytics";

export async function POST(request: NextRequest) {
  return exportHandler(request);
}
