import json

RAW_PATH = r"C:\Users\Jorge Cerna\.claude\projects\C--Users-Jorge-Cerna-OneDrive-Desktop-LCB\bf1bca9b-83d9-4096-be05-9ff52e96bc9f\tool-results\mcp-0ceb823f-2607-4b5c-87f7-5e457ab67d4f-data_cms_tool-1785401623720.txt"

with open(RAW_PATH, encoding="utf-8") as f:
    entries = json.load(f)

draft_ids = []
total = 0
for entry in entries:
    parsed = json.loads(entry["text"])
    for item in parsed["result"]["items"]:
        total += 1
        if item.get("isDraft"):
            draft_ids.append({"id": item["id"], "propertyId": item["fieldData"].get("property-id")})

print(f"Total items: {total}")
print(f"Draft items: {len(draft_ids)}")

with open(r"C:\Users\Jorge Cerna\OneDrive\Desktop\LCB\lcb-easybroker-sync\scripts\draft-ids.json", "w", encoding="utf-8") as f:
    json.dump(draft_ids, f, indent=2)

print(json.dumps(draft_ids[:5], indent=2))
