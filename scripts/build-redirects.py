import json

RAW_PATH = r"C:\Users\Jorge Cerna\.claude\projects\C--Users-Jorge-Cerna-OneDrive-Desktop-LCB\bf1bca9b-83d9-4096-be05-9ff52e96bc9f\tool-results\mcp-0ceb823f-2607-4b5c-87f7-5e457ab67d4f-data_cms_tool-1785400422333.txt"
OLD_SLUGS_PATH = r"C:\Users\Jorge Cerna\OneDrive\Desktop\LCB\lcb-easybroker-sync\scripts\old-slugs.json"

with open(RAW_PATH, encoding="utf-8") as f:
    entries = json.load(f)

current_by_item_id = {}
for entry in entries:
    parsed = json.loads(entry["text"])
    for item in parsed["result"]["items"]:
        current_by_item_id[item["id"]] = {
            "itemId": item["id"],
            "propertyId": item["fieldData"].get("property-id"),
            "currentSlug": item["fieldData"].get("slug"),
            "isDraft": item.get("isDraft", False),
        }

print(f"Current items loaded: {len(current_by_item_id)}")

with open(OLD_SLUGS_PATH, encoding="utf-8") as f:
    old_rows = json.load(f)

print(f"Old CSV rows: {len(old_rows)}")

redirects = []
missing = []
unchanged = 0
for row in old_rows:
    current = current_by_item_id.get(row["itemId"])
    if not current:
        missing.append(row)
        continue
    if current["currentSlug"] == row["oldSlug"]:
        unchanged += 1
        continue
    redirects.append({
        "propertyId": row["propertyId"],
        "oldSlug": row["oldSlug"],
        "newSlug": current["currentSlug"],
        "isDraft": current["isDraft"],
    })

print(f"Slug changed (needs redirect): {len(redirects)}")
print(f"Slug unchanged: {unchanged}")
print(f"Item ID from CSV not found in current data: {len(missing)}")

with open(r"C:\Users\Jorge Cerna\OneDrive\Desktop\LCB\lcb-easybroker-sync\scripts\redirects.json", "w", encoding="utf-8") as f:
    json.dump(redirects, f, ensure_ascii=False, indent=2)

# Webflow 301 redirect CSV import format: "From URL,To URL" (paths relative to root)
with open(r"C:\Users\Jorge Cerna\OneDrive\Desktop\LCB\lcb-easybroker-sync\scripts\webflow-redirects.csv", "w", encoding="utf-8", newline="") as f:
    f.write("From,To\n")
    for r in redirects:
        f.write(f"/propiedades/{r['oldSlug']},/propiedades/{r['newSlug']}\n")

print("Sample redirects:")
print(json.dumps(redirects[:5], ensure_ascii=False, indent=2))
