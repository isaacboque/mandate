import "dotenv/config";
import { checkEnv } from "../src/server/envcheck.js";

// `npm run doctor`: is the environment (your .env or the host's variables) ready, and what will answer? Prints whether a secret is set, never its value.
const r = checkEnv();
console.log(r.lines.join("\n"));
process.exit(r.ok ? 0 : 1);
