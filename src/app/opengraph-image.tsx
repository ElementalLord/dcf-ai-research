import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { siteHost } from "@/lib/site-url";

// Link-preview card (iMessage, WhatsApp, Slack, X, LinkedIn). Without it, apps pick the
// first large photo on the page. Drawn in the brand palette (see brand.css).
export const alt = "DCF Inspiring Personalities — evidence-grounded profiles of remarkable lives";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ground = "#f7f2ea";
const ink = "#2f2722";
const muted = "#6f6258";
const line = "#d2c4af";
const accent = "#a8513a";
const categories = ["#6b58a6", "#9e6223", "#36698b", "#a2465d", "#467a59"];

const font = (file: string) => readFile(join(process.cwd(), "assets/og-fonts", file));

export default async function OpengraphImage() {
  const [serif, serifItalic, sans] = await Promise.all([
    font("newsreader-latin-500-normal.woff"),
    font("newsreader-latin-400-italic.woff"),
    font("geist-sans-latin-500-normal.woff"),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: ground,
          padding: 36,
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            border: `1.5px solid ${line}`,
            borderRadius: 6,
            padding: "56px 72px",
          }}
        >
          {/* Masthead */}
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <svg width="52" height="52" viewBox="0 0 40 40">
              <rect width="40" height="40" rx="9" fill={accent} />
              <g
                fill="none"
                stroke={ground}
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                transform="translate(2 1.5) scale(0.9)"
              >
                <path d="M20 5.5C24.6 10.6 26.4 15.6 25 20.4 24.1 23.4 22.3 25.8 20 27.6 17.7 25.8 15.9 23.4 15 20.4 13.6 15.6 15.4 10.6 20 5.5Z" />
                <path d="M18.2 28.4C11.6 28.2 6.6 24.2 4.6 16.8 10.4 16.6 15 19.4 17.2 24" />
                <path d="M21.8 28.4C28.4 28.2 33.4 24.2 35.4 16.8 29.6 16.6 25 19.4 22.8 24" />
                <path d="M8 35H32" />
              </g>
              <circle cx="20" cy="18.24" r="2" fill={ground} />
            </svg>
            <div
              style={{
                fontFamily: "Geist",
                fontSize: 22,
                letterSpacing: 5,
                color: muted,
                textTransform: "uppercase",
              }}
            >
              DCF · The Collection
            </div>
          </div>

          {/* Title */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontFamily: "Newsreader",
                fontSize: 104,
                lineHeight: 1.0,
                letterSpacing: -2.5,
                color: ink,
              }}
            >
              Inspiring Personalities
            </div>
            <div
              style={{
                marginTop: 22,
                fontFamily: "Newsreader Italic",
                fontSize: 38,
                lineHeight: 1.3,
                color: muted,
                maxWidth: 860,
              }}
            >
              Sages, scientists, rulers and artists — profiles grounded in the sources behind them.
            </div>
          </div>

          {/* Footer rule */}
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <div style={{ display: "flex", gap: 10 }}>
              {categories.map((c) => (
                <div key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c }} />
              ))}
            </div>
            <div style={{ flex: 1, height: 1.5, background: line }} />
            <div style={{ fontFamily: "Geist", fontSize: 22, letterSpacing: 1, color: accent }}>
              {siteHost}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Newsreader", data: serif, weight: 500, style: "normal" },
        { name: "Newsreader Italic", data: serifItalic, weight: 400, style: "italic" },
        { name: "Geist", data: sans, weight: 500, style: "normal" },
      ],
    },
  );
}
