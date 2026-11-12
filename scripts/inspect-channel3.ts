// Prints the raw attribute and variant fields of the first Channel3 results, to see where size/colour live.
// Needs CHANNEL3_API_KEY in your local env file. Read-only; prints no secrets.
import "dotenv/config";

const key = process.env.CHANNEL3_API_KEY;
if (!key) {
  console.error("Set CHANNEL3_API_KEY first.");
  process.exit(1);
}
const query = process.argv[2] ?? "indoor futsal shoes";
const res = await fetch("https://api.trychannel3.com/v1/search", {
  method: "POST",
  headers: { "x-api-key": key, "content-type": "application/json" },
  body: JSON.stringify({ query, limit: 2 }),
});
if (!res.ok) {
  console.error(`HTTP ${res.status}`);
  process.exit(1);
}
const json = (await res.json()) as { products?: Record<string, unknown>[] };
for (const p of json.products ?? []) {
  console.log(JSON.stringify({ title: p.title, category: p.category, structured_attributes: p.structured_attributes, variants: p.variants, key_features: p.key_features, materials: p.materials }, null, 1).slice(0, 2500));
  console.log("-----");
}

// The category tree for the first word of the query: what the mandate form's category lookup receives (one more API call).
const word = query.split(" ").find((w) => w.length > 2) ?? query;
const cats = await fetch("https://api.trychannel3.com/v1/categories/search?query=" + encodeURIComponent(word) + "&limit=5", { headers: { "x-api-key": key } });
console.log("categories for", word, "->", cats.ok ? JSON.stringify(await cats.json(), null, 1).slice(0, 2500) : "HTTP " + cats.status);
