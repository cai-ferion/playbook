#!/usr/bin/env python3
"""Compare ATTEND_26 Google Sheet data with io_attendance for week ending 04/10."""
import json
import requests
from collections import defaultdict

# 1. Load Google Sheet data
print("Loading ATTEND_26 from Google Sheet...")
with open('/tmp/attend26_full.json') as f:
    sheet_data = json.load(f)

rows = sheet_data.get('values', [])
header = rows[0] if rows else []
print(f"Header: {header}")
print(f"Total rows (incl header): {len(rows)}")

# Column indices
# A=0:Concat, B=1:Tag, C=2:Billing Code, D=3:UPL Reason, E=4:Remarks, F=5:OT, 
# G=6:Date, H=7:OHR, I=8:Agent, J=9:FLM, K=10:Role, L=11:Actual Planning Group,
# M=12:Shift Time, N=13:Status, O=14:Week Ending, P=15:Month, Q=16:Archiving

# Filter for week ending 4/10/2026
sheet_we0410 = []
for row in rows[1:]:
    if len(row) > 14:
        we = row[14].strip()
        if we in ('4/10/2026', '04/10/2026'):
            sheet_we0410.append(row)

print(f"\nATTEND_26 rows for WE 4/10/2026: {len(sheet_we0410)}")

# Build sheet lookup: key = (ohr, date_str)
# Date format in sheet: "Sat, 04/04" -> need to convert to 2026-04-04
def parse_sheet_date(d):
    """Convert 'Sat, 04/04' or 'Mon, 04/07' to '2026-04-04' or '2026-04-07'"""
    parts = d.split(', ')
    if len(parts) == 2:
        md = parts[1]  # "04/04"
        mp = md.split('/')
        if len(mp) == 2:
            return f"2026-{mp[0].zfill(2)}-{mp[1].zfill(2)}"
    return d

sheet_dict = {}  # (ohr, date) -> {tag, ot, billing_code, pg, role, ...}
sheet_ohrs = set()
for row in sheet_we0410:
    ohr = row[7].strip() if len(row) > 7 else ''
    date_raw = row[6].strip() if len(row) > 6 else ''
    date_str = parse_sheet_date(date_raw)
    tag = row[1].strip() if len(row) > 1 else ''
    ot = row[5].strip() if len(row) > 5 else ''
    billing_code = row[2].strip() if len(row) > 2 else ''
    pg = row[11].strip() if len(row) > 11 else ''
    role = row[10].strip() if len(row) > 10 else ''
    agent = row[8].strip() if len(row) > 8 else ''
    
    sheet_ohrs.add(ohr)
    sheet_dict[(ohr, date_str)] = {
        'tag': tag, 'ot': ot, 'billing_code': billing_code,
        'pg': pg, 'role': role, 'agent': agent, 'date_raw': date_raw
    }

print(f"Unique OHRs in sheet (WE 04/10): {len(sheet_ohrs)}")

# 2. Load io_attendance data for week ending 04/10 (dates 2026-04-04 to 2026-04-10)
print("\nLoading io_attendance from API...")
resp = requests.get("http://localhost:3000/api/io/attendance", params={
    'log_date_gte': '2026-04-04',
    'log_date_lte': '2026-04-10',
    'limit': '50000'
})
db_rows = resp.json()
print(f"io_attendance rows for 04/04 to 04/10: {len(db_rows)}")

db_dict = {}  # (ohr, date) -> {tag, ot_hours, planning_group, role, ...}
db_ohrs = set()
for r in db_rows:
    ohr = str(r.get('ohr_id', '')).strip()
    date_str = str(r.get('log_date', '')).strip()
    db_ohrs.add(ohr)
    db_dict[(ohr, date_str)] = {
        'tag': r.get('tag', '') or '',
        'ot_hours': str(r.get('ot_hours', '') or ''),
        'planning_group': r.get('planning_group', '') or '',
        'role': r.get('role', '') or '',
        'billing_code': r.get('billing_code', '') or ''
    }

print(f"Unique OHRs in DB (04/04-04/10): {len(db_ohrs)}")

# 3. Compare
print("\n" + "="*80)
print("DISCREPANCY REPORT: ATTEND_26 vs io_attendance (Week Ending 04/10)")
print("="*80)

# 3a. OHRs in sheet but not in DB
sheet_only_ohrs = sheet_ohrs - db_ohrs
print(f"\n--- OHRs in ATTEND_26 but NOT in io_attendance: {len(sheet_only_ohrs)} ---")
for ohr in sorted(sheet_only_ohrs):
    # Find agent name
    for (o, d), v in sheet_dict.items():
        if o == ohr:
            print(f"  OHR: {ohr} | Agent: {v['agent']} | PG: {v['pg']} | Role: {v['role']}")
            break

# 3b. OHRs in DB but not in sheet
db_only_ohrs = db_ohrs - sheet_ohrs
print(f"\n--- OHRs in io_attendance but NOT in ATTEND_26: {len(db_only_ohrs)} ---")
for ohr in sorted(db_only_ohrs):
    for (o, d), v in db_dict.items():
        if o == ohr:
            print(f"  OHR: {ohr} | PG: {v['planning_group']} | Role: {v['role']}")
            break

# 3c. Tag mismatches (same OHR+date, different tag)
tag_mismatches = []
for key in sorted(sheet_dict.keys()):
    if key in db_dict:
        s_tag = sheet_dict[key]['tag'].upper().strip()
        d_tag = db_dict[key]['tag'].upper().strip()
        # Normalize: blank in both = match
        if s_tag == d_tag:
            continue
        # Blank vs P are effectively the same in our system
        if (s_tag == '' and d_tag == 'P') or (s_tag == 'P' and d_tag == ''):
            continue
        tag_mismatches.append({
            'ohr': key[0], 'date': key[1],
            'sheet_tag': sheet_dict[key]['tag'],
            'db_tag': db_dict[key]['tag'],
            'agent': sheet_dict[key]['agent']
        })

print(f"\n--- Tag Mismatches (same OHR+date, different tag): {len(tag_mismatches)} ---")
for m in tag_mismatches[:100]:
    print(f"  OHR: {m['ohr']} | Date: {m['date']} | Agent: {m['agent']} | Sheet: '{m['sheet_tag']}' | DB: '{m['db_tag']}'")
if len(tag_mismatches) > 100:
    print(f"  ... and {len(tag_mismatches) - 100} more")

# 3d. OT mismatches
ot_mismatches = []
for key in sorted(sheet_dict.keys()):
    if key in db_dict:
        s_ot = sheet_dict[key]['ot'].strip()
        d_ot = db_dict[key]['ot_hours'].strip()
        # Normalize
        s_val = float(s_ot) if s_ot else 0
        d_val = float(d_ot) if d_ot else 0
        if abs(s_val - d_val) > 0.01:
            ot_mismatches.append({
                'ohr': key[0], 'date': key[1],
                'sheet_ot': s_ot or '0',
                'db_ot': d_ot or '0',
                'agent': sheet_dict[key]['agent']
            })

print(f"\n--- OT Hours Mismatches: {len(ot_mismatches)} ---")
for m in ot_mismatches[:100]:
    print(f"  OHR: {m['ohr']} | Date: {m['date']} | Agent: {m['agent']} | Sheet OT: {m['sheet_ot']} | DB OT: {m['db_ot']}")
if len(ot_mismatches) > 100:
    print(f"  ... and {len(ot_mismatches) - 100} more")

# 3e. Records in sheet but missing from DB (specific date+ohr combos)
missing_from_db = []
for key in sorted(sheet_dict.keys()):
    if key not in db_dict:
        missing_from_db.append({
            'ohr': key[0], 'date': key[1],
            'agent': sheet_dict[key]['agent'],
            'tag': sheet_dict[key]['tag'],
            'pg': sheet_dict[key]['pg']
        })

print(f"\n--- Records in ATTEND_26 but missing from io_attendance: {len(missing_from_db)} ---")
for m in missing_from_db[:100]:
    print(f"  OHR: {m['ohr']} | Date: {m['date']} | Agent: {m['agent']} | Tag: {m['tag']} | PG: {m['pg']}")
if len(missing_from_db) > 100:
    print(f"  ... and {len(missing_from_db) - 100} more")

# 3f. Records in DB but missing from sheet
missing_from_sheet = []
for key in sorted(db_dict.keys()):
    if key not in sheet_dict:
        missing_from_sheet.append({
            'ohr': key[0], 'date': key[1],
            'tag': db_dict[key]['tag'],
            'pg': db_dict[key]['planning_group'],
            'role': db_dict[key]['role']
        })

print(f"\n--- Records in io_attendance but missing from ATTEND_26: {len(missing_from_sheet)} ---")
for m in missing_from_sheet[:100]:
    print(f"  OHR: {m['ohr']} | Date: {m['date']} | Tag: {m['tag']} | PG: {m['pg']} | Role: {m['role']}")
if len(missing_from_sheet) > 100:
    print(f"  ... and {len(missing_from_sheet) - 100} more")

# 3g. Planning Group mismatches
pg_mismatches = []
for key in sorted(sheet_dict.keys()):
    if key in db_dict:
        s_pg = sheet_dict[key]['pg'].strip()
        d_pg = db_dict[key]['planning_group'].strip()
        if s_pg != d_pg:
            pg_mismatches.append({
                'ohr': key[0], 'date': key[1],
                'sheet_pg': s_pg,
                'db_pg': d_pg,
                'agent': sheet_dict[key]['agent']
            })

print(f"\n--- Planning Group Mismatches: {len(pg_mismatches)} ---")
# Group by OHR for readability
pg_by_ohr = defaultdict(list)
for m in pg_mismatches:
    pg_by_ohr[m['ohr']].append(m)
for ohr in sorted(pg_by_ohr.keys()):
    items = pg_by_ohr[ohr]
    print(f"  OHR: {ohr} | Agent: {items[0]['agent']} | Sheet PG: {items[0]['sheet_pg']} | DB PG: {items[0]['db_pg']} ({len(items)} days)")

# Summary
print("\n" + "="*80)
print("SUMMARY")
print("="*80)
print(f"Sheet records (WE 04/10): {len(sheet_we0410)}")
print(f"DB records (04/04-04/10): {len(db_rows)}")
print(f"OHRs in sheet only: {len(sheet_only_ohrs)}")
print(f"OHRs in DB only: {len(db_only_ohrs)}")
print(f"Tag mismatches: {len(tag_mismatches)}")
print(f"OT mismatches: {len(ot_mismatches)}")
print(f"Records in sheet, missing from DB: {len(missing_from_db)}")
print(f"Records in DB, missing from sheet: {len(missing_from_sheet)}")
print(f"Planning Group mismatches: {len(pg_mismatches)}")
