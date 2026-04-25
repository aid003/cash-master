import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Cash Master Client",
  description: "Next.js client with App Router, FSD and shadcn/ui",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
