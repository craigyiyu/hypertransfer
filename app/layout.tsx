import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VirtualAsset Compliance MVP",
  description: "Internal virtual asset deposit orchestration MVP",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
