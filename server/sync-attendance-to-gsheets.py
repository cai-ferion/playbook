#!/usr/bin/env python3
"""
ATTEND_26 Sync: DB → Google Sheet
Reads attendance from the database (last 2 weeks) and syncs to the ATTEND_26 Google Sheet.
Matches rows by Concat ID (column A). Updates changed rows, appends new rows.

Sheet columns (A-O, no Billing Code):
  A: Concat (serial_date + ohr_id)
  B: Tag
  C: UPL Reason
  D: Remarks
  E: OT
  F: Date (display format: "Day, MM/DD")
  G: OHR
  H: Agent
  I: FLM
  J: Role
  K: Actual Planning Group
  L: Shift Time
  M: Status
  N: Week Ending (M/D/YYYY)
  O: Month
"""
import json
import os
import subprocess
import sys
from datetime import date, datetime, timedelta

# ── Configuration ──────────────────────────────────────────────────────────
SPREADSHEET_ID = "1UZxiqTsskXwKJ9VMgetK1DvmjwkPfHmMNqE7u4JkSqc"
SHEET_NAME = "ATTEND_26"
TOKEN_FILE = "/home/ubuntu/.gws_token"
LOOKBACK_DAYS = 7

DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
]

# Google Sheets epoch: Dec 30, 1899
SHEETS_EPOCH = date(1899, 12, 30)


def date_to_serial(d: date) -> int:
    return (d - SHEETS_EPOCH).days


def format_date_display(d: date) -> str:
    """Format date as 'Day, MM/DD' matching JS getDay() convention."""
    js_day = (d.weekday() + 1) % 7  # Mon=0..Sun=6 → Sun=0..Sat=6
    return f"{DAY_NAMES[js_day]}, {d.month:02d}/{d.day:02d}"


def get_week_ending(d: date) -> str:
    """Get the Saturday week ending date in M/D/YYYY format."""
    js_day = (d.weekday() + 1) % 7
    diff = (6 - js_day + 7) % 7
    sat = d + timedelta(days=diff)
    return f"{sat.month}/{sat.day}/{sat.year}"


def get_month_name(d: date) -> str:
    return MONTH_NAMES[d.month - 1]


def make_concat(d: date, ohr: str) -> str:
    return f"{date_to_serial(d)}{ohr}"


# ── Auth ───────────────────────────────────────────────────────────────────
def load_token() -> str:
    if os.path.exists(TOKEN_FILE):
        token = open(TOKEN_FILE).read().strip()
        if token:
            print(f"[AUTH] Loaded GWS token from {TOKEN_FILE}")
            return token
    env_token = os.environ.get("GOOGLE_WORKSPACE_CLI_TOKEN", "")
    if env_token:
        with open(TOKEN_FILE, "w") as f:
            f.write(env_token)
        os.chmod(TOKEN_FILE, 0o600)
        print(f"[AUTH] Wrote GWS token from env ({len(env_token)} chars)")
        return env_token
    print("[AUTH] ERROR: No GWS token available", file=sys.stderr)
    sys.exit(1)


# ── GWS CLI helpers ───────────────────────────────────────────────────────
def gws_read(range_str: str) -> list:
    cmd = [
        "gws", "sheets", "spreadsheets", "values", "get",
        "--params", json.dumps({
            "spreadsheetId": SPREADSHEET_ID,
            "range": f"{SHEET_NAME}!{range_str}"
        })
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f"gws read failed: {result.stderr}")
    data = json.loads(result.stdout)
    return data.get("values", [])


def gws_update(range_str: str, values: list) -> dict:
    cmd = [
        "gws", "sheets", "spreadsheets", "values", "update",
        "--params", json.dumps({
            "spreadsheetId": SPREADSHEET_ID,
            "range": f"{SHEET_NAME}!{range_str}",
            "valueInputOption": "RAW"
        }),
        "--json", json.dumps({"values": values})
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f"gws update failed: {result.stderr}")
    return json.loads(result.stdout)


def gws_append(values: list) -> dict:
    cmd = [
        "gws", "sheets", "spreadsheets", "values", "append",
        "--params", json.dumps({
            "spreadsheetId": SPREADSHEET_ID,
            "range": f"{SHEET_NAME}!A:O",
            "valueInputOption": "RAW",
            "insertDataOption": "INSERT_ROWS"
        }),
        "--json", json.dumps({"values": values})
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f"gws append failed: {result.stderr}")
    return json.loads(result.stdout)


# ── Database ──────────────────────────────────────────────────────────────
def get_db_connection():
    import pymysql
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        try:
            pids = subprocess.run(
                ["pgrep", "-f", "tsx watch"], capture_output=True, text=True
            ).stdout.strip().split("\n")
            for pid in pids:
                if pid:
                    env_file = f"/proc/{pid}/environ"
                    if os.path.exists(env_file):
                        env_data = open(env_file, "rb").read()
                        for pair in env_data.split(b"\x00"):
                            decoded = pair.decode("utf-8", errors="ignore")
                            if decoded.startswith("DATABASE_URL="):
                                db_url = decoded[len("DATABASE_URL="):]
                                break
                    if db_url:
                        break
        except Exception:
            pass

    if not db_url:
        raise RuntimeError("DATABASE_URL not found")

    url = db_url.replace("mysql://", "")
    creds, rest = url.split("@", 1)
    user, password = creds.split(":", 1)
    host_port, db_part = rest.split("/", 1)
    host, port = host_port.split(":", 1) if ":" in host_port else (host_port, "3306")
    db_name = db_part.split("?")[0]

    return pymysql.connect(
        host=host, port=int(port), user=user, password=password,
        database=db_name, ssl={"ca": None},
        ssl_verify_cert=False, ssl_verify_identity=False,
        cursorclass=pymysql.cursors.DictCursor,
    )


def fetch_attendance(conn, start_date: str) -> list:
    with conn.cursor() as cur:
        cur.execute(
            """SELECT id, ohr_id, log_date, tag, upl_reason, remarks, ot_hours,
                      snap_full_name, snap_supervisor, snap_planning_group,
                      snap_shift_time, snap_actual_role, snap_status,
                      role, planning_group
               FROM io_attendance
               WHERE log_date >= %s
               ORDER BY log_date, ohr_id""",
            (start_date,)
        )
        return cur.fetchall()


# ── Row conversion ────────────────────────────────────────────────────────
def db_row_to_sheet_row(row: dict) -> list:
    log_date_str = str(row["log_date"])
    d = date.fromisoformat(log_date_str)

    concat = make_concat(d, str(row["ohr_id"]))
    tag = row["tag"] or ""
    upl_reason = row["upl_reason"] or ""
    remarks = row["remarks"] or ""
    ot = str(row["ot_hours"]) if row["ot_hours"] else ""
    date_display = format_date_display(d)
    ohr = str(row["ohr_id"])
    agent = row["snap_full_name"] or ""
    flm = row["snap_supervisor"] or ""
    role_val = row["role"] or row["snap_actual_role"] or ""
    pg_val = row["planning_group"] or row["snap_planning_group"] or ""
    shift_time = row["snap_shift_time"] or ""
    status = row["snap_status"] or ""
    week_ending = get_week_ending(d)
    month = get_month_name(d)

    return [
        concat, tag, upl_reason, remarks, ot,
        date_display, ohr, agent, flm, role_val, pg_val,
        shift_time, status, week_ending, month
    ]


# ── Batch update helper ──────────────────────────────────────────────────
def group_contiguous(updates: list) -> list:
    """Group updates by contiguous row numbers for efficient batch writes.
    Input: sorted list of (row_number, values).
    Output: list of (start_row, [values_list]) for contiguous ranges.
    """
    if not updates:
        return []
    groups = []
    current_start = updates[0][0]
    current_values = [updates[0][1]]

    for i in range(1, len(updates)):
        row_num, values = updates[i]
        if row_num == current_start + len(current_values):
            # Contiguous — extend current group
            current_values.append(values)
        else:
            # Gap — flush current group, start new one
            groups.append((current_start, current_values))
            current_start = row_num
            current_values = [values]

    groups.append((current_start, current_values))
    return groups


# ── Main sync logic ──────────────────────────────────────────────────────
def main():
    started = datetime.now()
    print("=" * 60)
    print(f"ATTEND_26 Sync: DB → Google Sheet")
    print(f"Started: {started.isoformat()}")
    print("=" * 60)

    load_token()

    today = date.today()
    start = today - timedelta(days=LOOKBACK_DAYS)
    # Round down to the previous Saturday for clean week boundaries
    js_day = (start.weekday() + 1) % 7
    start = start - timedelta(days=js_day)

    # Fetch DB rows
    print(f"\n[DB] Fetching attendance from {start} onward...")
    conn = get_db_connection()
    try:
        db_rows = fetch_attendance(conn, str(start))
    finally:
        conn.close()

    # Group by week for logging
    week_groups = {}
    for row in db_rows:
        d = date.fromisoformat(str(row["log_date"]))
        we = get_week_ending(d)
        week_groups.setdefault(we, []).append(row)
    for we in sorted(week_groups.keys()):
        d_start = date.fromisoformat(str(min(r["log_date"] for r in week_groups[we])))
        d_end = date.fromisoformat(str(max(r["log_date"] for r in week_groups[we])))
        print(f"  {d_start} to {d_end}: {len(week_groups[we])} rows")
    print(f"[DB] Total: {len(db_rows)} rows")

    # Convert DB rows to sheet format, keyed by concat
    db_sheet_rows = {}
    for row in db_rows:
        sheet_row = db_row_to_sheet_row(row)
        db_sheet_rows[sheet_row[0]] = sheet_row

    # Read existing sheet rows from the lookback start
    print(f"\n[SHEET] Finding rows from {start.strftime('%m/%d')} onward...")
    days_from_jan1 = (start - date(2026, 1, 1)).days
    approx_row = max(2, int(days_from_jan1 * 390))

    sheet_rows_by_concat = {}
    sheet_row_numbers = {}

    chunk_start = approx_row
    print(f"[SHEET] Reading from row {chunk_start} to end...")

    total_sheet_rows = 0
    while True:
        chunk_end = chunk_start + 5000
        try:
            rows = gws_read(f"A{chunk_start}:O{chunk_end}")
        except Exception as e:
            if "exceeds grid limits" in str(e):
                break
            raise
        if not rows:
            break
        for i, row in enumerate(rows):
            if not row or not row[0]:
                continue
            concat = row[0]
            sheet_rows_by_concat[concat] = row
            sheet_row_numbers[concat] = chunk_start + i
            total_sheet_rows += 1
        if len(rows) < 5000:
            break
        chunk_start = chunk_end + 1

    last_row = max(sheet_row_numbers.values()) if sheet_row_numbers else approx_row
    print(f"[SHEET] Found {total_sheet_rows} rows from {start.strftime('%m/%d')} onward (rows {approx_row}-{last_row})")

    # Compare and find updates + new rows
    updates = []
    new_rows = []

    for concat, db_row in db_sheet_rows.items():
        if concat in sheet_rows_by_concat:
            sheet_row = sheet_rows_by_concat[concat]
            while len(sheet_row) < 15:
                sheet_row.append("")
            changed = False
            for i in range(1, 15):
                db_val = str(db_row[i]) if db_row[i] else ""
                sheet_val = str(sheet_row[i]) if i < len(sheet_row) and sheet_row[i] else ""
                if db_val != sheet_val:
                    changed = True
                    break
            if changed:
                updates.append((sheet_row_numbers[concat], db_row))
        else:
            new_rows.append(db_row)

    print(f"\n[SYNC] Updates needed: {len(updates)}")
    print(f"[SYNC] New rows to append: {len(new_rows)}")

    # Apply updates using contiguous range batches (max 200 rows per gws call to stay under CLI arg limit)
    BATCH_CAP = 200
    if updates:
        print(f"\n[UPDATE] Applying {len(updates)} row updates...")
        updates.sort(key=lambda x: x[0])
        groups = group_contiguous(updates)
        print(f"  Grouped into {len(groups)} contiguous ranges")

        total_updated = 0
        api_calls = 0
        for start_row, values_list in groups:
            for sub_start in range(0, len(values_list), BATCH_CAP):
                sub_values = values_list[sub_start:sub_start + BATCH_CAP]
                row_from = start_row + sub_start
                row_to = row_from + len(sub_values) - 1
                gws_update(f"A{row_from}:O{row_to}", sub_values)
                total_updated += len(sub_values)
                api_calls += 1
                if api_calls % 5 == 0 or total_updated == len(updates):
                    print(f"  Progress: {total_updated}/{len(updates)} rows updated ({api_calls} API calls)")

    # Append new rows
    if new_rows:
        print(f"\n[APPEND] Adding {len(new_rows)} new rows...")
        new_rows.sort(key=lambda r: r[0])
        total_appended = 0
        for batch_idx in range(0, len(new_rows), BATCH_CAP):
            batch = new_rows[batch_idx:batch_idx + BATCH_CAP]
            gws_append(batch)
            total_appended += len(batch)
        print(f"  Total appended: {total_appended}/{len(new_rows)} rows")

    completed = datetime.now()
    duration = (completed - started).total_seconds()
    print(f"\n{'=' * 60}")
    print(f"Sync complete: {completed.isoformat()}")
    print(f"  Updated: {len(updates)} rows")
    print(f"  Appended: {len(new_rows)} rows")
    print(f"  Duration: {duration:.1f}s")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
