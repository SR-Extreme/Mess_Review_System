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

    let output = "--- ALL DATA in mess_reviews (Limit 50) ---\n";
    const [rows] = await connection.query("SELECT * FROM mess_reviews ORDER BY review_date DESC LIMIT 50");

    rows.forEach(r => {
        const d = r.review_date instanceof Date ? r.review_date.toISOString() : String(r.review_date);
        output += `Date: ${d} | Mess: [${r.mess}] | Meal: [${r.meal}] | Quality: [${r.quality}]\n`;
    });

    const [qRows] = await connection.query("SELECT DISTINCT quality FROM mess_reviews");
    output += "\n--- DISTINCT QUALITIES ---\n" + JSON.stringify(qRows, null, 2);

    const [mRows] = await connection.query("SELECT DISTINCT meal FROM mess_reviews");
    output += "\n\n--- DISTINCT MEALS ---\n" + JSON.stringify(mRows, null, 2);

    fs.writeFileSync("diag_out_utf8.txt", output, "utf8");
    console.log("Diagnostic written to diag_out_utf8.txt");

    await connection.end();
}

diagnose().catch(console.error);
