import type { ReactNode } from "react";

import { DashboardLayoutClient } from "@/widgets/app-shell/ui/dashboard-layout-client";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <DashboardLayoutClient>{children}</DashboardLayoutClient>;
}
