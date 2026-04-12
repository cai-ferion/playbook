/**
 * Migration: io_coaching → compass_coaching_logs
 *
 * Batch-insert approach for speed. Maps legacy types/statuses to new schema.
 * Preserves dispute comments as dispute events.
 */
import mysql from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

const TYPE_MAP = {
  "General Coaching": "cap_0",
  "New Session": "cap_0",
  "Follow Up Session": "follow_up",
  "QA Feedback": "qa_feedback",
  "Group Coaching": "group",
  "Triad Coaching": "triad",
  "ZTP Coaching": "ztp",
};

const STATUS_MAP = {
  "": "Pending Acknowledgement",
  "Completed": "Acknowledged",
  "Markdown Accepted - SME": "Acknowledged",
  "Trainer Decision Accepted - SME": "Acknowledged",
  "Markdown Disputed": "Markdown Disputed",
  "Markdown Disputed - SME": "Markdown Disputed",
  "Markdown Retained - Trainer": "Markdown Retained - Trainer",
  "QA Decision Rejected": "QA Decision Rejected",
  "QA Retention Rejected - SME": "QA Decision Rejected",
  "Trainer Decision Rejected": "Trainer Decision Rejected",
  "Trainer Decision Rejected - SME": "Trainer Decision Rejected",
};

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  console.log("Fetching legacy coaching records...");
  const [legacyRows] = await conn.query("SELECT * FROM io_coaching ORDER BY id ASC");
  console.log(`Found ${legacyRows.length} legacy records.`);

  const [existing] = await conn.query("SELECT coaching_id FROM compass_coaching_logs");
  const existingIds = new Set(existing.map(r => r.coaching_id));
  console.log(`${existingIds.size} already migrated.`);

  // Build batch values
  const coachingValues = [];
  const disputeValues = [];
  let skipped = 0;

  for (const row of legacyRows) {
    if (existingIds.has(row.coaching_id)) { skipped++; continue; }

    const newType = TYPE_MAP[row.coaching_type] || "cap_0";
    const newStatus = STATUS_MAP[row.status || ""] || "Pending Acknowledgement";
    const coacheeAck = newStatus === "Acknowledged" || row.coachee_ack === 1 || row.coachee_ack === "1" || row.coachee_ack === true;

    let sessionGoals;
    try {
      const parsed = JSON.parse(row.session_goal);
      sessionGoals = JSON.stringify(Array.isArray(parsed) ? parsed : [parsed]);
    } catch {
      sessionGoals = JSON.stringify(row.session_goal ? [row.session_goal] : ["General coaching session"]);
    }

    const now = row.created_at || String(Date.now());

    coachingValues.push([
      row.coaching_id, newType, row.coaching_date || null, sessionGoals,
      row.coaching_details || null, newStatus,
      row.coach_ohr || null, row.coach || null, row.coach_meta_email || null,
      row.coach_sup || null, row.coach_sup_email || null, row.coach_pg || null,
      row.coachee_ohr || null, row.coachee || null, row.coachee_meta_email || null,
      row.coachee_sup || null, row.coachee_sup_email || null, row.coachee_pg || null,
      row.job_id || null,
      row.level_1_category || null, row.level_2_direct_cause || null,
      row.level_3_contributing_cause || null, row.level_4_deficiency || null,
      row.level_5_root_cause || null, row.guidelines || null,
      row.infraction_category || null, row.infraction || null,
      row.infraction_description || null, row.severity || null,
      row.sme_joiner || null, row.sme_meta_email || null,
      row.coachee_list || null, row.attachments || null,
      coacheeAck ? 1 : 0, row.coachee_commitments || null,
      row.coaching_rating ? parseInt(row.coaching_rating) || null : null,
      row.coachee_sentiments || null, row.ack_date || null,
      row.week_ending || null, row.month || null,
      null, null, // parent_coaching_id, group_session_id
      now, row.updated_at || now,
    ]);

    // Collect dispute events for QA Feedback
    if (newType === "qa_feedback") {
      const events = [
        { level: 1, comments: row.dispute_comments, attachments: row.dispute_attachments, role: "Operational SME", stamp: row.sme_dispute_stamp },
        { level: 2, comments: row.qa_comments, attachments: row.qa_attachments, role: "Quality & Policy Expert", stamp: row.qa_decision_stamp },
        { level: 3, comments: row.sme_qa_dispute_comments, attachments: row.sme_qa_dispute_attachments, role: "Operational SME", stamp: row.sme_qa_dispute_stamp },
        { level: 4, comments: row.trainer_comments, attachments: row.trainer_attachments, role: "Trainer", stamp: row.trainer_decision_stamp },
        { level: 5, comments: row.sme_trainer_comments, attachments: row.sme_trainer_attachments, role: "Operational SME", stamp: row.sme_trainer_dispute_stamp },
        { level: 6, comments: row.qtp_manager_comments, attachments: row.qtp_manager_attachments, role: "Manager", stamp: row.qtp_manager_stamp },
      ];
      for (const evt of events) {
        if (evt.comments && evt.comments.trim()) {
          disputeValues.push([
            row.coaching_id, evt.level, "migrated_action", "migrated",
            "Migrated from legacy", evt.role, evt.comments,
            evt.attachments || null, evt.stamp || now,
          ]);
        }
      }
    }
  }

  // Batch insert coaching logs (100 at a time)
  const BATCH_SIZE = 100;
  const coachingCols = `coaching_id, coaching_type, coaching_date, session_goals, coaching_details, status, coach_ohr, coach_name, coach_email, coach_supervisor, coach_supervisor_email, coach_pg, coachee_ohr, coachee_name, coachee_email, coachee_supervisor, coachee_supervisor_email, coachee_pg, job_id, rca_level_1, rca_level_2, rca_level_3, rca_level_4, rca_level_5, rca_description, infraction_category, infraction, infraction_description, severity, sme_joiner_name, sme_joiner_email, coachee_list, attachments, coachee_ack, coachee_commitments, coaching_rating, coachee_sentiments, ack_date, week_ending, month, parent_coaching_id, group_session_id, created_at, updated_at`;
  const placeholders = `(${Array(44).fill("?").join(",")})`;

  console.log(`Inserting ${coachingValues.length} coaching logs...`);
  for (let i = 0; i < coachingValues.length; i += BATCH_SIZE) {
    const batch = coachingValues.slice(i, i + BATCH_SIZE);
    const sql = `INSERT INTO compass_coaching_logs (${coachingCols}) VALUES ${batch.map(() => placeholders).join(",")}`;
    const flat = batch.flat();
    await conn.query(sql, flat);
    process.stdout.write(`  ${Math.min(i + BATCH_SIZE, coachingValues.length)}/${coachingValues.length}\r`);
  }
  console.log(`\nCoaching logs inserted: ${coachingValues.length}`);

  // Batch insert dispute events
  if (disputeValues.length > 0) {
    const disputeCols = `coaching_id, dispute_level, action, actor_ohr, actor_name, actor_role, comments, attachments, created_at`;
    const dPlaceholders = `(${Array(9).fill("?").join(",")})`;
    console.log(`Inserting ${disputeValues.length} dispute events...`);
    for (let i = 0; i < disputeValues.length; i += BATCH_SIZE) {
      const batch = disputeValues.slice(i, i + BATCH_SIZE);
      const sql = `INSERT INTO compass_dispute_events (${disputeCols}) VALUES ${batch.map(() => dPlaceholders).join(",")}`;
      await conn.query(sql, batch.flat());
    }
    console.log(`Dispute events inserted: ${disputeValues.length}`);
  }

  console.log(`Skipped (already exists): ${skipped}`);
  console.log("Migration complete.");
  await conn.end();
}

main().catch(e => { console.error("Migration failed:", e.message); process.exit(1); });
