import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Accounting OS",
  description: "AI-powered accounting operating system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
