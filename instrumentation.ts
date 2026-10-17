import { assertProductionAuthConfig } from "@/lib/auth/config";

export async function register() {
  assertProductionAuthConfig();
}
