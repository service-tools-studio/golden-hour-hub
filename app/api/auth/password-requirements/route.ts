import { NextResponse } from "next/server";
import { cognitoConfigured } from "@/lib/auth/config";
import { getPasswordRequirementLines, getPasswordRules, passwordRejectedMessage } from "@/lib/auth/password-policy";

export async function GET() {
  if (!cognitoConfigured()) {
    return NextResponse.json({ configured: false, intro: null, requirements: [], rules: [] });
  }
  const rules = await getPasswordRules();
  const requirements = await getPasswordRequirementLines();
  return NextResponse.json({
    configured: true,
    intro: "Your new password must include:",
    requirements,
    rules,
    rejectedIntro: passwordRejectedMessage,
  });
}
