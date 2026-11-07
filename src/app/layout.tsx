import type { Metadata } from "next";
// Self-hosted Geist (from the `geist` package): no build-time call to Google Fonts.
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ImportDesk", template: "%s · ImportDesk" },
  description: "Import shipment document extraction and cross-checks for customs documentation teams.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
