require("dotenv").config();
const mysql = require("mysql2/promise");

const MESSES = ["Mess A", "Mess B"];
const MEALS = ["breakfast", "lunch", "dinner"];

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

function makeStudents(count) {
  const departments = ["CSE", "ECE", "ME", "CE", "EE"];
  const hostels = ["A Block", "B Block", "C Block"];
  const students = [];

  for (let i = 1; i <= count; i += 1) {
    students.push({
      student_id: `STU${String(i).padStart(4, "0")}`,
      student_name: `Student ${i}`,
      student_email: `student${i}@college.edu`,
      hostel: hostels[i % hostels.length],
      room_no: `R-${100 + i}`,
      department: departments[i % departments.length],
      batch: 2026 + (i % 3),
    });
  }

  return students;
}

async function seed() {
  const dbName = process.env.DB_NAME || "mess_review";
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
  });

  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    await connection.query(`USE \`${dbName}\``);

    await connection.beginTransaction();

    await connection.query(`
      CREATE TABLE IF NOT EXISTS mess_reviews (
        id INT PRIMARY KEY AUTO_INCREMENT,
        mess VARCHAR(50) NOT NULL,
        meal ENUM('breakfast','lunch','dinner') NOT NULL,
        review_date DATE NOT NULL,
        quality VARCHAR(10) NOT NULL,
        student_id VARCHAR(30) NULL,
        student_name VARCHAR(120) NULL,
        student_email VARCHAR(150) NULL,
        hostel VARCHAR(80) NULL,
        room_no VARCHAR(20) NULL,
        department VARCHAR(60) NULL,
        batch INT NULL,
        INDEX idx_mess_date_meal (mess, review_date, meal),
        INDEX idx_quality (quality)
      )
    `);

    // Add columns if table existed before without student details.
    const alterStatements = [
      "ALTER TABLE mess_reviews ADD COLUMN student_id VARCHAR(30) NULL",
      "ALTER TABLE mess_reviews ADD COLUMN student_name VARCHAR(120) NULL",
      "ALTER TABLE mess_reviews ADD COLUMN student_email VARCHAR(150) NULL",
      "ALTER TABLE mess_reviews ADD COLUMN hostel VARCHAR(80) NULL",
      "ALTER TABLE mess_reviews ADD COLUMN room_no VARCHAR(20) NULL",
      "ALTER TABLE mess_reviews ADD COLUMN department VARCHAR(60) NULL",
      "ALTER TABLE mess_reviews ADD COLUMN batch INT NULL",
    ];
    for (const stmt of alterStatements) {
      try {
        await connection.query(stmt);
      } catch (_e) {
        // Ignore "duplicate column" errors.
      }
    }

    await connection.query("DELETE FROM mess_reviews");

    const students = makeStudents(80);
    const today = new Date();
    const values = [];

    // Seed 14 days of data with mixed good/bad reviews.
    for (let dayOffset = 1; dayOffset <= 14; dayOffset += 1) {
      const date = new Date(today);
      date.setDate(date.getDate() - dayOffset);
      const dateStr = formatDate(date);

      for (const mess of MESSES) {
        for (const meal of MEALS) {
          // Mark some combinations as incidents (>50% bad).
          const incident =
            (mess === "Mess A" && meal === "lunch" && dayOffset % 2 === 0) ||
            (mess === "Mess B" && meal === "dinner" && dayOffset % 5 === 0);

          const badVotes = incident ? 12 : 4;
          const goodVotes = incident ? 8 : 16;

          const used = new Set();
          const pickStudent = () => {
            while (true) {
              const idx = Math.floor(Math.random() * students.length);
              if (!used.has(idx)) {
                used.add(idx);
                return students[idx];
              }
            }
          };

          for (let i = 0; i < badVotes; i += 1) {
            const s = pickStudent();
            values.push([
              mess,
              meal,
              dateStr,
              "bad",
              s.student_id,
              s.student_name,
              s.student_email,
              s.hostel,
              s.room_no,
              s.department,
              s.batch,
            ]);
          }

          for (let i = 0; i < goodVotes; i += 1) {
            const s = pickStudent();
            values.push([
              mess,
              meal,
              dateStr,
              "good",
              s.student_id,
              s.student_name,
              s.student_email,
              s.hostel,
              s.room_no,
              s.department,
              s.batch,
            ]);
          }
        }
      }
    }

    await connection.query(
      `
        INSERT INTO mess_reviews (
          mess, meal, review_date, quality,
          student_id, student_name, student_email, hostel, room_no, department, batch
        )
        VALUES ?
      `,
      [values]
    );

    await connection.commit();
    console.log(`Seed completed. Inserted ${values.length} rows into mess_reviews.`);
  } catch (err) {
    await connection.rollback();
    console.error("Seed failed:", err.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

seed();
