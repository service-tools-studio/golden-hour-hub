import { cognitoConfigured } from "@/lib/auth/config";
import { getServerSession } from "@/lib/auth/session";
import { fetchPlaceAddress, googlePlacesConfigured } from "@/lib/google-places-api";

export async function GET(request: Request) {
  if (cognitoConfigured()) {
    const session = await getServerSession();
    if (!session) {
      return Response.json({ error: "Sign in required." }, { status: 401 });
    }
  }
  if (!googlePlacesConfigured()) {
    return Response.json({ error: "Places API is not configured." }, { status: 503 });
  }

  const placeId = new URL(request.url).searchParams.get("placeId")?.trim() ?? "";
  const sessionToken = new URL(request.url).searchParams.get("sessionToken")?.trim() ?? undefined;
  if (!placeId) {
    return Response.json({ error: "Missing placeId." }, { status: 400 });
  }

  const address = await fetchPlaceAddress(placeId, sessionToken);
  if (!address) {
    return Response.json({ error: "Could not load that address." }, { status: 404 });
  }

  return Response.json({ address });
}
