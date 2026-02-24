import { NextRequest } from "next/server";
import {
  updateContentHandler,
  deleteContentHandler,
} from "@/apps/api/routes/content";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  return updateContentHandler(request, { params: resolvedParams });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  return deleteContentHandler(request, { params: resolvedParams });
}
