import { requireAdminIdentity } from "@/lib/server/auth";
import { listDirectorQuarantineAssessments } from "@/lib/server/director-quarantine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminIdentity(request);
    return Response.json(await listDirectorQuarantineAssessments());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quarantine ledger request failed.";
    return Response.json({ error: message }, { status: /sign in/i.test(message) ? 401 : /Super Admin/i.test(message) ? 403 : 400 });
  }
}

