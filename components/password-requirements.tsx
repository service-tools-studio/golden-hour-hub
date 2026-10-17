import { evaluatePasswordRules, type PasswordRule } from "@/lib/auth/password-rules";

export function PasswordRequirements({
  intro,
  requirements,
  tone = "hint",
}: {
  intro: string;
  requirements: string[];
  tone?: "hint" | "error";
}) {
  if (requirements.length === 0) return null;
  const introClass = tone === "error" ? "text-sm font-semibold text-red-700" : "text-sm text-ink/70";
  const listClass =
    tone === "error" ? "mt-2 list-disc space-y-1 pl-5 text-sm text-red-700" : "mt-2 list-disc space-y-1 pl-5 text-sm text-ink/65";

  return (
    <div className={tone === "error" ? "rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3" : undefined}>
      <p className={introClass}>{intro}</p>
      <ul className={listClass}>
        {requirements.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

export function LivePasswordRequirements({
  intro,
  rules,
  password,
}: {
  intro: string;
  rules: PasswordRule[];
  password: string;
}) {
  if (rules.length === 0) return null;

  const checked = evaluatePasswordRules(password, rules);
  const showStatus = password.length > 0;

  return (
    <div>
      {intro ? <p className="text-sm text-ink/70">{intro}</p> : null}
      <ul className={`${intro ? "mt-2" : ""} list-none space-y-1 pl-0 text-sm`} aria-live="polite">
        {checked.map((rule) => {
          const satisfied = showStatus && rule.satisfied;
          const failed = showStatus && !rule.satisfied;
          const color = satisfied ? "text-green-700" : failed ? "text-red-700" : "text-ink/65";
          const mark = satisfied ? "✓" : failed ? "✕" : "•";
          return (
            <li key={rule.id} className={`flex gap-2 ${color}`}>
              <span className="w-4 shrink-0 font-semibold" aria-hidden="true">{mark}</span>
              <span>{rule.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
