import { env } from "cloudflare:workers";
import { hashPassword, sha256Hex } from "../../../lib/team-auth";
export async function POST(request: Request) {
 const secret = (env as unknown as {SETUP_TOKEN?: string}).SETUP_TOKEN;
 if (!secret || secret.length < 24) return Response.json({error:"لم يتم ضبط رمز التهيئة في Cloudflare"}, {status:503});
 if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({error:"طلب غير مسموح"}, {status:403});
 const body = await request.json().catch(()=>null) as {token?: unknown; username?: unknown; password?: unknown} | null;
 if (!body || typeof body.token !== "string" || await sha256Hex(body.token) !== await sha256Hex(secret)) return Response.json({error:"رمز التهيئة غير صحيح"}, {status:403});
 if (typeof body.username !== "string" || !/^[a-zA-Z0-9_.-]{3,64}$/.test(body.username) || typeof body.password !== "string" || body.password.length < 12 || body.password.length > 128) return Response.json({error:"اسم المستخدم 3–64 حرفاً إنجليزياً، وكلمة المرور 12–128 حرفاً"}, {status:400});
 const hash = await hashPassword(body.password);
 const result = await env.DB.prepare("UPDATE users SET username = ?, password_hash = ?, must_change_password = 0 WHERE id = 'usr-admin-tito' AND password_hash IS NULL AND NOT EXISTS (SELECT 1 FROM users WHERE system_role = 'ADMIN' AND password_hash IS NOT NULL)").bind(body.username.toLowerCase(),hash).run();
 if (!result.meta.changes) return Response.json({error:"تم إعداد مدير النظام سابقاً، أو لم تُنشأ قاعدة البيانات"},{status:409});
 return Response.json({ok:true}, {headers:{"Cache-Control":"no-store"}});
}
