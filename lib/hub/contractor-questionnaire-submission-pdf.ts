import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { CleanerProfile } from "../domain/types.ts";
import type { ContractorQuestionnaireSubmissionRecord } from "../domain/contractor-questionnaire-submission.ts";
import {
  formatTeamMemberForAdmin,
  generalLiabilityInsuranceStatusLabel,
  helperPaymentArrangementLabel,
  insuranceOregonCoverageStatusLabel,
  oregonServiceStatusLabel,
  registrationStatusLabel,
  workersCompNoReasonLabel,
  workersCompStatusLabel,
} from "../domain/contractor-questionnaire.ts";

function wrapLines(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function addSection(lines: string[], title: string, body: string[]): string[] {
  lines.push(title);
  lines.push(...body);
  lines.push("");
  return lines;
}

export async function buildQuestionnaireSubmissionPdf(input: {
  cleaner: CleanerProfile;
  submission: ContractorQuestionnaireSubmissionRecord;
}): Promise<Uint8Array> {
  const q = input.submission.questionnaireSnapshot;
  const contentLines: string[] = [];
  addSection(contentLines, "Contractor", [
    `${input.cleaner.firstName} ${input.cleaner.lastName}`,
    `Cleaner ID: ${input.cleaner.cleanerId}`,
  ]);
  addSection(contentLines, "Submission", [
    `Submission ID: ${input.submission.submissionId}`,
    `Submission version: ${input.submission.submissionVersion}`,
    `Questionnaire version: ${input.submission.questionnaireVersion}`,
    `Submitted at (UTC): ${input.submission.submittedAt}`,
    `Submitted by: ${input.submission.electronicSignature}`,
    `Cognito user: ${input.submission.submittedByCognitoSub}`,
  ]);
  addSection(contentLines, "Business information", [
    `Business name: ${q.businessDisplayName}`,
    `Owner legal name: ${q.ownerLegalName}`,
    `Structure: ${registrationStatusLabel(q.registrationStatus)}`,
    `Address: ${q.businessStreetAddress}, ${q.businessCity}, ${q.businessState} ${q.businessZip}`,
    `Phone: ${q.businessPhone}`,
    `Email: ${q.businessEmail}`,
    `Oregon jobs: ${oregonServiceStatusLabel(q.oregonServiceStatus)}`,
  ]);
  if (q.hasAdditionalWorkers && q.teamMembers?.length) {
    contentLines.push("Team members:");
    for (const member of q.teamMembers) {
      contentLines.push(`- ${formatTeamMemberForAdmin(member)}`);
    }
    contentLines.push("");
  } else {
    addSection(contentLines, "Team", ["Owner performs cleaning alone"]);
  }
  if (q.workersCompStatus) {
    addSection(contentLines, "Workers' compensation", [
      workersCompStatusLabel(q.workersCompStatus),
      q.workersCompNoReason ? workersCompNoReasonLabel(q.workersCompNoReason) : "",
      q.workersCompCarrierName ? `Carrier: ${q.workersCompCarrierName}` : "",
      q.workersCompPolicyNumber ? `Policy: ${q.workersCompPolicyNumber}` : "",
      q.workersCompExpirationDate ? `Expires: ${q.workersCompExpirationDate}` : "",
      q.workersCompComplianceStatus
        ? `Admin compliance: ${q.workersCompComplianceStatus.replaceAll("_", " ").toLowerCase()}`
        : "",
    ].filter(Boolean));
  }
  if (q.generalLiabilityStatus) {
    addSection(contentLines, "General liability insurance", [
      generalLiabilityInsuranceStatusLabel(q.generalLiabilityStatus),
      q.insuranceProviderName ? `Provider: ${q.insuranceProviderName}` : "",
      q.insuranceExpirationDate ? `Expires: ${q.insuranceExpirationDate}` : "",
      q.insuranceOregonCoverage ? `Oregon coverage: ${insuranceOregonCoverageStatusLabel(q.insuranceOregonCoverage)}` : "",
    ].filter(Boolean));
  }
  addSection(contentLines, "Acknowledgment", [
    `Version: ${input.submission.acknowledgmentVersion}`,
    input.submission.acknowledgmentText,
  ]);
  addSection(contentLines, "Electronic signature", [
    input.submission.electronicSignatureConsentText,
    `Signed name: ${input.submission.electronicSignature}`,
  ]);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([612, 792]);
  let y = 740;
  const margin = 48;
  const lineHeight = 14;

  page.drawText("Golden Hour Cleaning Co.", { x: margin, y, size: 16, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y -= 22;
  page.drawText("Business information questionnaire submission", { x: margin, y, size: 12, font, color: rgb(0.2, 0.2, 0.2) });
  y -= 24;

  for (const rawLine of contentLines) {
    const wrapped = wrapLines(rawLine, 90);
    for (const line of wrapped) {
      if (y < 48) {
        page = pdf.addPage([612, 792]);
        y = 740;
      }
      const isHeading = !line.startsWith(" ") && !line.startsWith("-") && line.endsWith(":") === false && wrapped.length === 1 && line === rawLine && line.length < 40 && contentLines.indexOf(rawLine) > 0;
      page.drawText(line, {
        x: margin,
        y,
        size: isHeading ? 11 : 10,
        font: isHeading ? bold : font,
        color: rgb(0.15, 0.15, 0.15),
      });
      y -= lineHeight;
    }
  }

  return pdf.save();
}
