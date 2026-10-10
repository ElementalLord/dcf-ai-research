import type { Metadata } from "next";
import { Newsreader, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import "./public-experience.css";
import "./resources-hub.css";
import { SiteNav } from "@/components/site-nav";

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DCF Research AI",
  description: "Ask questions about historical and textual figures, then inspect the sources behind each answer.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sourceSans.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><SiteNav />{children}</body>
    </html>
  );
}
