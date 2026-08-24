import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "VirtualAsset Compliance MVP",
  description: "Internal virtual asset deposit orchestration MVP",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // className="dark": 统一设计系统(emerald preset)的暗色令牌;字体走共享 Geist
    <html lang="en" className={`dark ${fontSans.variable} ${fontMono.variable}`}>
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
