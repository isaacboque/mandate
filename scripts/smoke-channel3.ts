// Live check against Channel3. Needs CHANNEL3_API_KEY in your local env file. Read-only; prints no secrets.
import "dotenv/config";
import { Channel3Catalog } from "../src/catalog/Channel3Catalog.js";
import { formatCents } from "../src/core/money.js";

const key = process.env.CHANNEL3_API_KEY;
if (!key) {
  console.error("Set CHANNEL3_API_KEY first.");
  process.exit(1);
}
const query = process.argv[2] ?? "indoor futsal shoes";
const catalog = new Channel3Catalog(key);
const found = await catalog.search(query, { limit: 5 });
console.log(`${found.length} products for "${query}"`);
for (const p of found) {
  console.log(`- ${p.id} | ${p.title.slice(0, 60)} | ${p.merchant} | ${formatCents(p.priceCents, p.currency)} | cat=${p.category} | flag=${p.injectionFlag}`);
}
if (found[0]) {
  const again = await catalog.getProduct(found[0].id);
  console.log(`getProduct(${found[0].id}) ->`, again ? formatCents(again.priceCents, again.currency) : "not found");
}
