import { AuthError, requireAdmin } from "@/lib/auth/guards";
import { loadHub } from "@/lib/data/repository";
import { buildQuestionnaireSubmissionPdf } from "@/lib/hub/contractor-questionnaire-submission-pdf";

export async function GET(
  _request: Request,
  context: { params: Promise<{ cleanerId: string; submissionId: string }> },
): Promise<Response> {
  try {
    await requireAdmin();
    const { cleanerId, submissionId } = await context.params;
    const hub = await loadHub();
    const cleaner = hub.cleaners.find((item) => item.cleanerId === cleanerId);
    const submission = hub.contractorQuestionnaireSubmissions.find(
      (item) => item.cleanerId === cleanerId && item.submissionId === submissionId,
    );
    if (!cleaner || !submission) {
      return new Response("Not found.", { status: 404 });
    }
    const pdf = await buildQuestionnaireSubmissionPdf({ cleaner, submission });
    const filename = `business-questionnaire-v${submission.submissionVersion}-${submissionId.slice(0, 8)}.pdf`;
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return new Response(error.message, { status: error.code === "UNAUTHORIZED" ? 401 : 403 });
    }
    console.error("questionnaire submission PDF failed.", error);
    return new Response("Could not generate PDF.", { status: 500 });
  }
}
