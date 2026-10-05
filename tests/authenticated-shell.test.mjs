import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the application shell is login-gated and the login page carries TITO identity", async () => {
  const [home, printLayout, login, loginForm] = await Promise.all([
    read("app/page.tsx"),
    read("app/print/layout.tsx"),
    read("app/login/page.tsx"),
    read("app/login/login-form.tsx"),
  ]);
  assert.match(home, /if \(!teamSession && !owner\) redirect\("\/login"\)/);
  assert.match(
    printLayout,
    /if \(!teamSession && !owner\) redirect\("\/login"\)/,
  );
  assert.match(login, /LoginForm/);
  assert.match(loginForm, /نظام TITO الداخلي/);
  assert.match(loginForm, /حوكمة الصرف بوضوح/);
  assert.match(loginForm, /دخول الفريق/);
  assert.match(loginForm, /لا يحتاج الموظف إلى حساب ChatGPT/);
});

test("team authentication uses hashed passwords, secure sessions, and forced first-login change", async () => {
  const [schema, auth, loginRoute, changeRoute, usersRoute] = await Promise.all(
    [
      read("db/schema.ts"),
      read("lib/team-auth.ts"),
      read("app/api/auth/login/route.ts"),
      read("app/api/auth/change-password/route.ts"),
      read("app/api/users/route.ts"),
    ],
  );
  assert.match(schema, /passwordHash/);
  assert.match(schema, /userSessions/);
  assert.match(auth, /PBKDF2/);
  assert.match(auth, /PASSWORD_ITERATIONS = 100_000/);
  assert.doesNotMatch(auth, /PASSWORD_ITERATIONS = 210_000/);
  assert.match(auth, /HttpOnly; Secure; SameSite=Lax/);
  assert.match(loginRoute, /MAX_FAILED_ATTEMPTS = 5/);
  assert.match(changeRoute, /mustChangePassword: false/);
  assert.match(usersRoute, /temporaryPassword/);
  assert.match(usersRoute, /payload\.temporaryPassword/);
  assert.match(usersRoute, /await sha256\(username\)/);
  assert.match(usersRoute, /UPDATE_USER_CREDENTIALS/);
  assert.match(usersRoute, /تعذر حفظ المستخدم/);
  assert.doesNotMatch(usersRoute, /temporaryPassword\.length/);
  assert.doesNotMatch(usersRoute, /select\(\)\.from\(users\).*orderBy/);
});
