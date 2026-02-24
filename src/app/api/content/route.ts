import { NextRequest } from "next/server";
import {
  listContentHandler,
  uploadInitHandler,
} from "@/apps/api/routes/content";

export async function GET(request: NextRequest) {
  return listContentHandler(request);
}

export async function POST(request: NextRequest) {
  return uploadInitHandler(request);
}
