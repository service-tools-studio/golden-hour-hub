import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Golden Hour Hub — scheduling for Golden Hour Cleaning Co.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "#fffbea",
          color: "#333333",
        }}
      >
        <p style={{ fontSize: 28, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.55 }}>
          Golden Hour Cleaning Co.
        </p>
        <p style={{ fontSize: 72, fontWeight: 700, marginTop: 16, lineHeight: 1.05 }}>Golden Hour Hub</p>
        <p style={{ fontSize: 32, marginTop: 24, maxWidth: 900, lineHeight: 1.35, opacity: 0.85 }}>
          View cleaning jobs, respond to invitations, and keep your availability up to date.
        </p>
      </div>
    ),
    { ...size },
  );
}
