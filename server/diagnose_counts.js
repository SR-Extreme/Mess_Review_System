require("dotenv").config();
const mysql = require("mysql2/promise");
const fs = require("fs");

async function diagnose() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_NAME || "mess_review",
    });

    let output = "--- RECORD COUNTS PER DATE AND MESS ---\n";
    const [rows] = await connection.query(`
    SELECT DATE(review_date) as date, mess, meal, quality, COUNT(*) as count 
    FROM mess_reviews 
    GROUP BY DATE(review_date), mess, meal, quality 
    ORDER BY date DESC, mess, meal
  `);

    rows.forEach(r => {
        const d = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date);
        output += `${d} | Mess: [${r.mess}] | Meal: [${r.meal}] | Qual: [${r.quality}] | Count: ${r.count}\n`;
    });

    fs.writeFileSync("diag_counts.txt", output, "utf8");
    console.log("Detailed counts written to diag_counts.txt");

    await connection.end();
}

diagnose().catch(console.error);
