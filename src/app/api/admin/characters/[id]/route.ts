import { deleteCharacterCompletely } from "@/lib/server/character-deletion";
import { requireAdminIdentity } from "@/lib/server/auth";
import {
  assertRequestBodySize,
  securityErrorStatus,
} from "@/lib/server/request-security";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertRequestBodySize(request, 8 * 1024);
    const identity = await requireAdminIdentity(request);
    const { id } = await context.params;
    const body = await request.json() as { confirmation?: unknown };
    const confirmation = typeof body.confirmation === "string" ? body.confirmation : "";
    const report = await deleteCharacterCompletely({
      characterId: id,
      confirmation,
      deletedBy: identity.id,
    });
    return Response.json({
      deleted: true,
      report,
      message: `${report.characterName} and ${report.deletedVoiceIds.length} custom voice${report.deletedVoiceIds.length === 1 ? "" : "s"} were permanently deleted.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete this AI actor.";
    return Response.json(
      { error: message },
      {
        status: securityErrorStatus(
          error,
          message === "Sign in to continue." ? 401 : /no longer exists/i.test(message) ? 404 : 400,
        ),
      },
    );
  }
}
