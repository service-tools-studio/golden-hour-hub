import { cognitoConfigured } from "@/lib/auth/config";
import { getServerSession } from "@/lib/auth/session";
import { fetchPlaceSuggestions, googlePlacesConfigured } from "@/lib/google-places-api";

export async function GET(request: Request) {
  if (cognitoConfigured()) {
    const session = await getServerSession();
    if (!session) {
      return Response.json({ suggestions: [], error: "Sign in required." }, { status: 401 });
    }
  }
  if (!googlePlacesConfigured()) {
    return Response.json({ suggestions: [], error: "Places API is not configured." }, { status: 503 });
  }

  const input = new URL(request.url).searchParams.get("input")?.trim() ?? "";
  if (input.length < 3) {
    return Response.json({ suggestions: [] });
  }

  const suggestions = await fetchPlaceSuggestions(input);
  return Response.json({ suggestions });
}
