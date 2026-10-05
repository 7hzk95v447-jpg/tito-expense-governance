import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTeamSessionFromCookieHeader } from "../../lib/team-auth";
import ChangePasswordForm from "./change-password-form";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const requestHeaders = await headers();
  const resolved = await getTeamSessionFromCookieHeader(requestHeaders.get("cookie"));
  if (!resolved) redirect("/login");
  if (!resolved.user.mustChangePassword) redirect("/");
  return <ChangePasswordForm fullName={resolved.user.fullName} />;
}
