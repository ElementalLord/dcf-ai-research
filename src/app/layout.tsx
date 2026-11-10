import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import "./resources-hub.css";
import "./site.css";
import { SiteNav } from "@/components/site-nav";

// One easy-to-read body face (designed for low-vision readers) and one display face for headings.
const body = Atkinson_Hyperlegible({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DCF Research AI",
  description: "Ask questions about historical and textual figures, then inspect the sources behind each answer.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col" suppressHydrationWarning><SiteNav />{children}</body>
    </html>
  );
}
