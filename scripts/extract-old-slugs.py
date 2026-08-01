import csv
import json
import sys

path = r"C:\Users\Jorge Cerna\Downloads\lcb-realestate - Propiedades - actualizado.csv"

rows = []
with open(path, encoding="utf-8-sig", newline="") as f:
    reader = csv.DictReader(f)
    for row in reader:
        rows.append({
            "itemId": row.get("Item ID", "").strip(),
            "propertyId": row.get("Property ID", "").strip(),
            "oldSlug": row.get("Slug", "").strip(),
            "name": row.get("Name", "").strip(),
        })

print(f"Total rows: {len(rows)}", file=sys.stderr)
with_property_id = [r for r in rows if r["propertyId"]]
print(f"Rows with Property ID: {len(with_property_id)}", file=sys.stderr)

with open(r"C:\Users\Jorge Cerna\OneDrive\Desktop\LCB\lcb-easybroker-sync\scripts\old-slugs.json", "w", encoding="utf-8") as f:
    json.dump(rows, f, ensure_ascii=False, indent=2)

print(json.dumps(rows[:3], ensure_ascii=False, indent=2))
