import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Newsreader, Source_Sans_3, Tiro_Devanagari_Sanskrit } from "next/font/google";
import "./globals.css";
import "./public-experience.css";
import "./resources-hub.css";
import "./brand.css";
import "./resources-flat.css";
import { SiteNav } from "@/components/site-nav";
import { themeInitScript } from "@/lib/theme";

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

const geist = Geist({
  variable: "--font-body",
  subsets: ["latin"],
});

const deva = Tiro_Devanagari_Sanskrit({
  variable: "--font-deva",
  weight: "400",
  subsets: ["devanagari", "latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://dcf-ai-research.vercel.app"),
  title: "DCF Research AI",
  description: "Ask questions about historical and textual figures, then inspect the sources behind each answer.",
  openGraph: { siteName: "DCF Inspiring Personalities", type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sourceSans.variable} ${newsreader.variable} ${bricolage.variable} ${geist.variable} ${deva.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head><script dangerouslySetInnerHTML={{ __html: themeInitScript }} /></head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning><SiteNav />{children}</body>
    </html>
  );
}
