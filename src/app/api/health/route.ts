import { NextResponse } from "next/server";
import { getContainer } from "@/composition/container";

export async function GET(): Promise<Response> {
  const container = getContainer();
  return NextResponse.json({
    ok: true,
    llmMode: container.config.llmMode,
    searchMode: container.config.searchMode
  });
}
