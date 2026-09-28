import type { Metadata } from "next";
import "./globals.css";
import { AppUpdateBanner } from "@/components/app/AppUpdateBanner";

export const metadata: Metadata = {
  title: "DarkCelestial",
  description: "A private, self-hosted income and expense tracker",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppUpdateBanner />
        {children}
      </body>
    </html>
  );
}
