import { NextRequest } from "next/server";
import { refreshHandler } from "@/apps/api/routes/analytics";

export async function POST(request: NextRequest) {
  return refreshHandler(request);
}
