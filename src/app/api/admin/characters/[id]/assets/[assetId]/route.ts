import { deleteCharacterAsset } from "@/lib/server/admin-character-assets";
import { requireAdminIdentity } from "@/lib/server/auth";
import {
  assertRequestBodySize,
  securityErrorStatus,
} from "@/lib/server/request-security";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; assetId: string }> },
) {
  try {
    assertRequestBodySize(request, 8 * 1024);
    const identity = await requireAdminIdentity(request);
    const { id, assetId } = await context.params;
    const body = await request.json() as { confirmation?: unknown };
    const confirmation = typeof body.confirmation === "string" ? body.confirmation : "";
    const report = await deleteCharacterAsset({
      characterId: id,
      assetId,
      confirmation,
      deletedBy: identity.id,
    });
    return Response.json({
      deleted: true,
      report,
      message: `${report.kind} file was permanently deleted from ${report.characterName}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete this character file.";
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
