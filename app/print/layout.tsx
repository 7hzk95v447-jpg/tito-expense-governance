import { getChatGPTUser } from "../chatgpt-auth";
import { getTeamSessionFromCookieHeader } from "../../lib/team-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const teamSession = await getTeamSessionFromCookieHeader(requestHeaders.get("cookie"));
  const owner = await getChatGPTUser();
  if (!teamSession && !owner) redirect("/login");
  return children;
}
