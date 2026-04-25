"use client";

import { Mail, Shield, UserRound } from "lucide-react";

import { useSession } from "@/features/session/model/session-provider";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";

export default function AccountPage() {
  const { signOut, user } = useSession();

  return (
    <div className="grid max-w-3xl gap-4">
      <Card className="bg-white/[0.03]">
        <CardHeader>
          <Badge variant="accent" className="w-fit">
            <UserRound className="mr-2 size-3.5" />
            Активный администратор
          </Badge>
          <CardTitle>{user?.email ?? "—"}</CardTitle>
          <CardDescription>
            Учётная запись используется для действий внутри панели.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Card className="bg-white/[0.03] p-5">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Mail className="size-4 text-primary" />
                Email
              </p>
              <p className="mt-3 text-sm text-muted-foreground">{user?.email ?? "—"}</p>
            </Card>
            <Card className="bg-white/[0.03] p-5">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Shield className="size-4 text-primary" />
                Роль
              </p>
              <p className="mt-3 text-sm text-muted-foreground">{user?.role ?? "ADMIN"}</p>
            </Card>
          </div>

          <Button variant="outline" className="w-fit" onClick={() => void signOut()}>
            Выйти
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
