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
function getDateRange(range) {
  // We want all ranges to end on "yesterday" (the last fully completed day),
  // not on today. This avoids partial data for the current day and aligns
  // with how the frontend displays dates.
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() - 1); // yesterday

  const start = new Date(end);

  switch (range) {
    case "daily":
      // Single day: just yesterday
      break;
    case "weekly":
      // Last 7 days including yesterday → go back 6 days from "end"
      start.setDate(end.getDate() - 6);
      break;
    case "monthly":
      // Last 30 days including yesterday → go back 29 days from "end"
      start.setDate(end.getDate() - 29);
      break;
    default:
      break;
  }

  const format = (d) => d.toISOString().slice(0, 10);

  // SQL lower bound should match the JS start date:
  // - daily: 1 day before CURDATE()      → only yesterday
  // - weekly: 7 days before CURDATE()    → 7 days ending yesterday
  // - monthly: 30 days before CURDATE()  → 30 days ending yesterday
  let sql;
  if (range === "daily") {
    sql = "DATE_SUB(CURDATE(), INTERVAL 1 DAY)";
  } else if (range === "weekly") {
    sql = "DATE_SUB(CURDATE(), INTERVAL 7 DAY)";
  } else if (range === "monthly") {
    sql = "DATE_SUB(CURDATE(), INTERVAL 30 DAY)";
  } else {
    // Fallback: treat as daily
    sql = "DATE_SUB(CURDATE(), INTERVAL 1 DAY)";
  }

  return {
    sql,
    startDate: format(start),
    endDate: format(end),
  };
}

/* =======================
   Summary API
======================= */
app.get("/api/summary", async (req, res) => {
  const mess = String(req.query.mess || "").trim();
  const range = String(req.query.range || "daily").trim().toLowerCase();

  if (!mess) {
    return res.status(400).json({
      error: "Missing required query param: mess",
    });
  }

  const dateRange = getDateRange(range);

  try {
    const sql = `
      SELECT
        DATE(review_date) AS review_date,
        meal,
        COUNT(*) AS totalReviews,
        SUM(CASE WHEN LOWER(TRIM(quality)) = 'good' THEN 1 ELSE 0 END) AS goodCount,
        SUM(CASE WHEN LOWER(TRIM(quality)) = 'bad' THEN 1 ELSE 0 END) AS badCount
      FROM mess_reviews
      WHERE mess = ?
        AND review_date >= ${dateRange.sql}
        AND review_date < CURDATE()
      GROUP BY DATE(review_date), meal
      ORDER BY DATE(review_date), meal
    `;

    const [rows] = await pool.query(sql, [mess]);

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
   Start Server
======================= */
app.listen(PORT, () => {
  console.log(`🚀 API running at http://localhost:${PORT}`);
});
