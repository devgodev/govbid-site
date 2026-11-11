#!/usr/bin/env python3
"""Validate every snapshot in data/archive/ and rebuild data/index.json.

Run locally:  python3 scripts/build_index.py
The GitHub Action in .github/workflows/index.yml runs this on every push that
touches data/archive/, so adding a new dated JSON file is all a daily refresh needs.
Snapshots are never modified or deleted by this script.
"""
import json, re, sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ARCHIVE = ROOT / "data" / "archive"
CATS = {"Drone/UAS purchases", "Parts and payloads", "Drone services",
        "R&D and grants", "Counter-UAS and robotics", "Not drone related"}
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def fail(path, msg):
    sys.exit(f"ERROR in {path.name}: {msg}")


def check(d, path):
    for key in ("snapshot_date", "reports", "bids", "parts"):
        if key not in d:
            fail(path, f"missing '{key}'")
    if d["snapshot_date"] != path.stem:
        fail(path, f"snapshot_date {d['snapshot_date']} does not match the file name")
    ids = set()
    for b in d["bids"]:
        if b.get("id") in ids:
            fail(path, f"duplicate bid id {b.get('id')}")
        ids.add(b.get("id"))
        if b.get("category") not in CATS:
            fail(path, f"bid {b.get('id')}: unknown category {b.get('category')!r}")
        if b.get("level") not in ("Federal", "State/local"):
            fail(path, f"bid {b.get('id')}: level must be Federal or State/local")
        if b.get("due") and not ISO.match(b["due"]):
            fail(path, f"bid {b.get('id')}: due must be YYYY-MM-DD or null")
        for k in ("notice_url", "bidmatch_url"):
            if b.get(k) and not b[k].startswith("https://"):
                fail(path, f"bid {b.get('id')}: {k} must start with https://")
    for r in d["reports"]:
        if r["listings"] != r["drone"] + r["parts"] + r["other"]:
            fail(path, f"report {r['report_date']}: listings != drone + parts + other")
    drone = sum(1 for b in d["bids"] if b["category"] != "Not drone related")
    if drone != sum(r["drone"] for r in d["reports"]):
        fail(path, "drone bids in 'bids' do not match the drone total in 'reports'")
    totals = {p["bucket"]: p["count"] for p in d["parts"] if p["dimension"] == "total"}
    if totals.get("listings") != sum(r["parts"] for r in d["reports"]):
        fail(path, "parts 'total:listings' does not match the parts total in 'reports'")
    for dim in ("due_date", "set_aside", "fsc", "feed"):
        s = sum(p["count"] for p in d["parts"] if p["dimension"] == dim)
        if s != totals.get("unique"):
            fail(path, f"parts dimension '{dim}' sums to {s}, expected {totals.get('unique')}")


def main():
    snaps = []
    for path in sorted(ARCHIVE.glob("*.json")):
        d = json.loads(path.read_text(encoding="utf-8"))
        check(d, path)
        snap = date.fromisoformat(d["snapshot_date"])
        drone = [b for b in d["bids"] if b["category"] != "Not drone related"]
        closing = sum(1 for b in drone if b.get("due") and
                      snap <= date.fromisoformat(b["due"]) <= snap + timedelta(days=14))
        snaps.append({
            "date": d["snapshot_date"], "file": f"archive/{path.name}",
            "listings": sum(r["listings"] for r in d["reports"]),
            "drone": len(drone), "closing14": closing,
            "other": sum(r["other"] for r in d["reports"]),
            "parts": sum(r["parts"] for r in d["reports"]),
        })
    snaps.sort(key=lambda s: s["date"], reverse=True)
    out = ROOT / "data" / "index.json"
    out.write_text(json.dumps({"snapshots": snaps}, indent=1) + "\n", encoding="utf-8")
    print(f"{len(snaps)} snapshot(s) indexed; latest {snaps[0]['date'] if snaps else 'none'}")


if __name__ == "__main__":
    main()
