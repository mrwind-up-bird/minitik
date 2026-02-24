import { NextRequest, NextResponse } from "next/server";
import {
  handleListAccounts,
  handleConnectAccount,
} from "@/apps/api/routes/accounts";

export async function GET(request: NextRequest) {
  return handleListAccounts(request);
}

export async function POST(request: NextRequest) {
  return handleConnectAccount(request);
}
