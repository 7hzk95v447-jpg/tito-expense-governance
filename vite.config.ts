import vinext from "vinext";
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
export default defineConfig({
 server: {host: "0.0.0.0"},
 plugins: [vinext(), cloudflare({viteEnvironment: {name: "rsc", childEnvironments: ["ssr"]}, inspectorPort: false})],
});
