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

    console.log("Dumping all records from Feb 10 to Feb 17...");
    const [rows] = await connection.query(`
    SELECT id, review_date, mess, meal, quality 
    FROM mess_reviews 
    WHERE review_date BETWEEN '2026-02-10' AND '2026-02-18'
    ORDER BY review_date DESC
  `);

    let output = `Found ${rows.length} records.\n\n`;
    rows.forEach(r => {
        output += `ID: ${r.id} | Date: ${r.review_date.toISOString()} | Mess: [${r.mess}] | Meal: [${r.meal}] | Quality: [${r.quality}]\n`;
    });

    fs.writeFileSync("full_data_dump.txt", output, "utf8");
    console.log("Done. Results in full_data_dump.txt");

    await connection.end();
}

diagnose().catch(console.error);
