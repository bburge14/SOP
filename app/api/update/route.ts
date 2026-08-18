import { NextRequest, NextResponse } from "next/server";
import { getStatus, performUpdate } from "@/lib/update/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  -> status only (local commit always; remote comparison when
 *         ?remote=1 is passed, since that does a network `git fetch`).
 * POST -> pulls, npm installs, rebuilds, and — only when running under
 *         scripts/supervisor.mjs — restarts the process.
 *
 * Gated by UPDATE_TOKEN when set. This is meant for a self-hosted instance
 * on a machine/network you control; if you expose it beyond localhost, set
 * UPDATE_TOKEN so a stranger on the network can't trigger it.
 */

export async function GET(req: NextRequest) {
  const checkRemote = req.nextUrl.searchParams.get("remote") === "1";
  try {
    const status = await getStatus(checkRemote);
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json({ error: describeError(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denyReason = checkToken(req);
  if (denyReason) return NextResponse.json({ error: denyReason }, { status: 401 });

  try {
    const result = await performUpdate();
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (err) {
    return NextResponse.json({ error: describeError(err) }, { status: 500 });
  }
}

function checkToken(req: NextRequest): string | null {
  const configured = process.env.UPDATE_TOKEN;
  if (!configured) return null;
  const provided = req.headers.get("x-update-token");
  if (provided !== configured) return "Missing or invalid X-Update-Token header.";
  return null;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error checking update status.";
}
