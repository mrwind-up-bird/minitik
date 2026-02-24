import { NextRequest } from "next/server";
import {
  handleDisconnectAccount,
  handleRefreshToken,
} from "@/apps/api/routes/accounts";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleDisconnectAccount(request, id);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleRefreshToken(request, id);
}
