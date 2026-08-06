import { AppShell } from "@/components/AppShell";
import { requireAccessToken } from "@/lib/auth/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAccessToken();

  return <AppShell>{children}</AppShell>;
}
