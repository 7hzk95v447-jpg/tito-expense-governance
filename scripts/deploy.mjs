import {execFileSync} from "node:child_process";
import {readFileSync, writeFileSync, mkdirSync, unlinkSync} from "node:fs";
import {resolve} from "node:path";
const wrangler = resolve("node_modules/wrangler/bin/wrangler.js");
const run = (args, options={}) => execFileSync(process.execPath,[wrangler,...args],{stdio:"inherit",...options});
run(["deploy"]);
const config = JSON.parse(readFileSync("wrangler.jsonc","utf8"));
const databases = JSON.parse(run(["d1","list","--json"],{stdio:["ignore","pipe","inherit"]}).toString());
const binding = config.d1_databases[0];
const database = databases.find(d=>d.name===binding.database_name);
if (!database?.uuid) throw new Error("Could not resolve the provisioned D1 database. Check deployment logs.");
mkdirSync(".wrangler",{recursive:true});
const path=resolve(".wrangler/migrations-config.json");
writeFileSync(path,JSON.stringify({name:config.name,compatibility_date:config.compatibility_date,d1_databases:[{...binding,database_id:database.uuid,migrations_dir:resolve("drizzle")}]}));
try {run(["d1","migrations","apply","DB","--remote","--config",path]);} finally {unlinkSync(path);}
