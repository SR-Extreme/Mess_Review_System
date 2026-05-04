require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 5000);

/* =======================
   MySQL Connection Pool
======================= */
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+05:30'
});

/* =======================
   Health Check
======================= */
app.get("/api/health", async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({
      status: "ok",
      db: rows?.[0]?.ok === 1 ? "connected" : "unknown",
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: err?.message || String(err),
    });
  }
});

/* =======================
   Get Mess List
======================= */
app.get("/api/messes", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT DISTINCT mess FROM mess_reviews ORDER BY mess ASC"
    );
    const messes = rows.map((r) => r.mess).filter(Boolean);
    res.json(messes.length ? messes : ["Mess A", "Mess B"]);
  } catch (_err) {
    res.json(["Mess A", "Mess B"]);
  }
});

/* =======================
   Date Range Helper
======================= */
function getDateRange(range, customDate) {
  const today = new Date();
  let end = new Date(today);
  // Default to today

  let start = new Date(end);
  let sql;

  if (range === 'custom' && customDate) {
    const d = new Date(customDate);
    start = new Date(d);
    end = new Date(d);
    sql = `?`; // We'll pass the date as a parameter
  } else {
    switch (range) {
      case '1':
      case 'daily':
        // Only today or specific day
        sql = "CURDATE()";
        break;
      case '7':
      case 'weekly':
        start.setDate(end.getDate() - 6);
        sql = "DATE_SUB(CURDATE(), INTERVAL 6 DAY)";
        break;
      case '30':
      case 'monthly':
        start.setDate(end.getDate() - 29);
        sql = "DATE_SUB(CURDATE(), INTERVAL 29 DAY)";
        break;
      default:
        sql = "CURDATE()";
        break;
    }
  }

  const format = (d) => d.toISOString().slice(0, 10);

  return {
    sql,
    isCustom: range === 'custom',
    customValue: customDate,
    startDate: format(start),
    endDate: format(end),
  };
}

function buildDateFilterClause(dateRange) {
  if (dateRange.isCustom) {
    return {
      clause: "DATE_FORMAT(review_date, '%Y-%m-%d') = ?",
      params: [dateRange.customValue],
    };
  }

  return {
    clause: `DATE(review_date) >= ${dateRange.sql} AND DATE(review_date) <= CURDATE()`,
    params: [],
  };
}

async function getStudentColumns() {
  const wantedColumns = [
    "student_id",
    "student_name",
    "student_email",
    "hostel",
    "room_no",
    "department",
    "batch",
  ];

  const [rows] = await pool.query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'mess_reviews'
    `
  );

  const available = new Set(rows.map((r) => String(r.COLUMN_NAME || "").toLowerCase()));
  return wantedColumns.filter((col) => available.has(col));
}

/* =======================
   Summary API
======================= */
app.get("/api/summary", async (req, res) => {
  const mess = String(req.query.mess || "").trim();
  const range = String(req.query.range || '1').trim().toLowerCase();
  const date = String(req.query.date || '').trim();

  if (!mess) {
    return res.status(400).json({
      error: "Missing required query param: mess",
    });
  }

  const dateRange = getDateRange(range, date);

  try {
    const filterSql = dateRange.isCustom
      ? `review_date = ?`
      : `review_date >= ${dateRange.sql} AND review_date < CURDATE()`;

    const params = dateRange.isCustom ? [dateRange.customValue, mess] : [mess];

    const sql = `
      SELECT
        DATE_FORMAT(review_date, '%Y-%m-%d') AS review_date,
        meal,
        COUNT(*) AS totalReviews,
        SUM(CASE WHEN LOWER(TRIM(quality)) = 'good' THEN 1 ELSE 0 END) AS goodCount,
        SUM(CASE WHEN LOWER(TRIM(quality)) = 'bad' THEN 1 ELSE 0 END) AS badCount
      FROM mess_reviews
      WHERE ${dateRange.isCustom ? "DATE_FORMAT(review_date, '%Y-%m-%d') = ?" : `DATE(review_date) >= ${dateRange.sql} AND DATE(review_date) <= CURDATE()`}
        AND mess = ?
      GROUP BY DATE_FORMAT(review_date, '%Y-%m-%d'), meal
      ORDER BY review_date ASC, meal ASC
    `;

    const [rows] = await pool.query(sql, params);

    // Transform rows into a per-day structure so the frontend can
    // show bar graphs for each individual date in the selected range.
    const dayMap = new Map();

    for (const r of rows) {
      const rawDate = r.review_date;
      const dateStr =
        rawDate instanceof Date
          ? rawDate.toISOString().slice(0, 10)
          : String(rawDate);

      if (!dayMap.has(dateStr)) {
        dayMap.set(dateStr, {
          date: dateStr,
          meals: [],
        });
      }

      const dayEntry = dayMap.get(dateStr);
      dayEntry.meals.push({
        meal: r.meal,
        totalReviews: Number(r.totalReviews || 0),
        goodCount: Number(r.goodCount || 0),
        badCount: Number(r.badCount || 0),
      });
    }

    const days = Array.from(dayMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    res.json({
      mess,
      range,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      days,
    });
  } catch (err) {
    res.status(500).json({
      error: err?.message || String(err),
    });
  }
});

/* =======================
   Incident + Student Export API
======================= */
app.get("/api/incidents", async (req, res) => {
  const mess = String(req.query.mess || "").trim();
  const range = String(req.query.range || "7").trim().toLowerCase();
  const date = String(req.query.date || "").trim();
  const capacity = Number(req.query.capacity || 0);

  if (!mess) {
    return res.status(400).json({
      error: "Missing required query param: mess",
    });
  }

  const dateRange = getDateRange(range, date);
  const dateFilter = buildDateFilterClause(dateRange);

  try {
    const incidentsSql = `
      SELECT
        DATE_FORMAT(review_date, '%Y-%m-%d') AS review_date,
        meal,
        COUNT(*) AS totalReviews,
        SUM(CASE WHEN LOWER(TRIM(quality)) = 'bad' THEN 1 ELSE 0 END) AS badCount
      FROM mess_reviews
      WHERE ${dateFilter.clause}
        AND mess = ?
      GROUP BY DATE_FORMAT(review_date, '%Y-%m-%d'), meal
      HAVING badCount > ?
      ORDER BY review_date DESC, meal ASC
    `;

    const incidentsParams = [...dateFilter.params, mess, capacity * 0.5];
    const [incidentRows] = await pool.query(incidentsSql, incidentsParams);

    const incidents = incidentRows.map((r) => {
      const totalReviews = Number(r.totalReviews || 0);
      const badCount = Number(r.badCount || 0);
      return {
        date: String(r.review_date),
        meal: String(r.meal || ""),
        totalReviews,
        badCount,
        badPercentage: totalReviews ? Number(((badCount / totalReviews) * 100).toFixed(2)) : 0,
      };
    });

    if (incidents.length === 0) {
      return res.json({
        mess,
        range,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        capacity,
        incidents: [],
        studentIncidentSummary: [],
      });
    }

    const studentColumns = await getStudentColumns();
    if (studentColumns.length === 0) {
      return res.json({
        mess,
        range,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        capacity,
        incidents: incidents.map((item) => ({ ...item, students: [] })),
        studentIncidentSummary: [],
        note: "No student detail columns found in mess_reviews table.",
      });
    }

    const incidentMatchersSql = incidents
      .map(() => "(DATE_FORMAT(review_date, '%Y-%m-%d') = ? AND meal = ?)")
      .join(" OR ");
    const incidentMatcherParams = incidents.flatMap((item) => [item.date, item.meal]);

    const studentSelectSql = studentColumns.map((col) => `\`${col}\``).join(", ");
    const studentVotesSql = `
      SELECT
        DATE_FORMAT(review_date, '%Y-%m-%d') AS review_date,
        meal,
        ${studentSelectSql}
      FROM mess_reviews
      WHERE ${dateFilter.clause}
        AND mess = ?
        AND LOWER(TRIM(quality)) = 'bad'
        AND (${incidentMatchersSql})
      ORDER BY review_date DESC, meal ASC
    `;
    const studentVoteParams = [...dateFilter.params, mess, ...incidentMatcherParams];
    const [studentRows] = await pool.query(studentVotesSql, studentVoteParams);

    const incidentMap = new Map(
      incidents.map((item) => [`${item.date}__${String(item.meal || "").toLowerCase()}`, { ...item, students: [] }])
    );
    const studentMap = new Map();

    for (const row of studentRows) {
      const dateStr = String(row.review_date);
      const meal = String(row.meal || "");
      const incidentKey = `${dateStr}__${meal.toLowerCase()}`;
      const incident = incidentMap.get(incidentKey);
      if (!incident) continue;

      const student = {
        studentId: row.student_id ?? null,
        name: row.student_name ?? null,
        email: row.student_email ?? null,
        hostel: row.hostel ?? null,
        roomNo: row.room_no ?? null,
        department: row.department ?? null,
        batch: row.batch ?? null,
      };

      incident.students.push(student);

      const identityKey = [
        student.studentId ?? "",
        student.email ?? "",
        student.name ?? "",
      ].join("|");
      if (!identityKey.replace(/\|/g, "").trim()) continue;

      if (!studentMap.has(identityKey)) {
        studentMap.set(identityKey, {
          ...student,
          incidentKeys: new Set(),
          totalBadVotesInIncidents: 0,
        });
      }
      const aggregate = studentMap.get(identityKey);
      aggregate.incidentKeys.add(incidentKey);
      aggregate.totalBadVotesInIncidents += 1;
    }

    const studentIncidentSummary = Array.from(studentMap.values())
      .map((entry) => ({
        studentId: entry.studentId,
        name: entry.name,
        email: entry.email,
        hostel: entry.hostel,
        roomNo: entry.roomNo,
        department: entry.department,
        batch: entry.batch,
        incidentCount: entry.incidentKeys.size,
        totalBadVotesInIncidents: entry.totalBadVotesInIncidents,
      }))
      .sort((a, b) => b.incidentCount - a.incidentCount || b.totalBadVotesInIncidents - a.totalBadVotesInIncidents);

    res.json({
      mess,
      range,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      capacity,
      incidents: Array.from(incidentMap.values()),
      studentIncidentSummary,
    });
  } catch (err) {
    res.status(500).json({
      error: err?.message || String(err),
    });
  }
});

/* =======================
   Start Server
======================= */
app.listen(PORT, () => {
  console.log(`🚀 API running at http://localhost:${PORT}`);
});
