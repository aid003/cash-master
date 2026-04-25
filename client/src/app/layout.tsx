import type { Metadata } from "next";

import { SessionProvider } from "@/features/session/model/session-provider";
import { TooltipProvider } from "@/shared/ui/tooltip";

import "./globals.css";

export const metadata: Metadata = {
  title: "Cash Master Admin",
  description: "Local admin panel for Undetectable profiles and projects",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="dark h-full antialiased">
      <body className="min-h-full bg-background text-foreground">
        <TooltipProvider>
          <SessionProvider>{children}</SessionProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
