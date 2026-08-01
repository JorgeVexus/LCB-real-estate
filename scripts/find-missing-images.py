import json

RAW_PATH = r"C:\Users\Jorge Cerna\.claude\projects\C--Users-Jorge-Cerna-OneDrive-Desktop-LCB\bf1bca9b-83d9-4096-be05-9ff52e96bc9f\tool-results\mcp-0ceb823f-2607-4b5c-87f7-5e457ab67d4f-data_cms_tool-1785401623720.txt"

with open(RAW_PATH, encoding="utf-8") as f:
    entries = json.load(f)

items = []
for entry in entries:
    parsed = json.loads(entry["text"])
    items.extend(parsed["result"]["items"])

print(f"Total items: {len(items)}")

missing = []
for item in items:
    fd = item["fieldData"]
    gallery = fd.get("gallery") or []
    featured = fd.get("featured-image")
    if not featured or len(gallery) == 0:
        missing.append({
            "id": item["id"],
            "propertyId": fd.get("property-id"),
            "name": fd.get("name"),
            "featuredImage": bool(featured),
            "galleryCount": len(gallery),
            "isArchived": item.get("isArchived"),
        })

print(f"Items with missing featured image or empty gallery: {len(missing)}")
with open(r"C:\Users\Jorge Cerna\OneDrive\Desktop\LCB\lcb-easybroker-sync\scripts\missing-images.json", "w", encoding="utf-8") as f:
    json.dump(missing, f, ensure_ascii=False, indent=2)

for m in missing:
    print(m["propertyId"], "featured:", m["featuredImage"], "gallery:", m["galleryCount"])
