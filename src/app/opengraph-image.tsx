import { ImageResponse } from "next/og";

export const alt = "DNA Studio — AI Marketing Platform";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#0a0a0a",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Logo mark */}
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 24,
            background: "#6366F1",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 36,
          }}
        >
          <svg width="52" height="52" viewBox="0 0 80 80" fill="none">
            <path
              d="M28 16C28 16 52 24 52 40C52 56 28 64 28 64"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M52 16C52 16 28 24 28 40C28 56 52 64 52 64"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <line x1="32" y1="24" x2="48" y2="24" stroke="white" strokeWidth="2" opacity="0.5" strokeLinecap="round" />
            <line x1="29" y1="32" x2="51" y2="32" stroke="white" strokeWidth="2" opacity="0.5" strokeLinecap="round" />
            <line x1="29" y1="40" x2="51" y2="40" stroke="white" strokeWidth="2" opacity="0.5" strokeLinecap="round" />
            <line x1="29" y1="48" x2="51" y2="48" stroke="white" strokeWidth="2" opacity="0.5" strokeLinecap="round" />
            <line x1="32" y1="56" x2="48" y2="56" stroke="white" strokeWidth="2" opacity="0.5" strokeLinecap="round" />
          </svg>
        </div>

        {/* Title */}
        <div
          style={{
            color: "#ffffff",
            fontSize: 60,
            fontWeight: 700,
            letterSpacing: "-2px",
            marginBottom: 20,
          }}
        >
          DNA Studio
        </div>

        {/* Subtitle */}
        <div
          style={{
            color: "#666666",
            fontSize: 26,
            maxWidth: 720,
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          Self-hosted AI marketing platform. Extract Brand DNA and generate
          on-brand content for every social platform.
        </div>
      </div>
    ),
    { ...size }
  );
}
