/** Browser role picker and local mock auth — never on production builds. */
export function previewAuthAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}
