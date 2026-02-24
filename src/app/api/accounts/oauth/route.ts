import { NextRequest } from "next/server";
import { handleInitiateOAuth } from "@/apps/api/routes/accounts";

export async function POST(request: NextRequest) {
  return handleInitiateOAuth(request);
}
