require("dotenv").config();
const mysql = require("mysql2/promise");

const MESSES = ["Mess A", "Mess B"];
const MEALS = ["breakfast", "lunch", "dinner"];

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

function makeStudents(count) {
  const students = [];

  for (let i = 1; i <= count; i += 1) {
    students.push({
      roll_number: `STU${String(i).padStart(4, "0")}`,
      email: `student${i}@iiits.in`,
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

    await connection.query("DROP TABLE IF EXISTS mess_reviews");

    await connection.query(`
      CREATE TABLE mess_reviews (
        date DATE NOT NULL,
        email VARCHAR(150) NULL,
        roll_number VARCHAR(30) NOT NULL,
        mess VARCHAR(50) NOT NULL,
        food ENUM('breakfast','lunch','dinner') NOT NULL,
        quality VARCHAR(10) NOT NULL,
        PRIMARY KEY (roll_number, date, food),
        INDEX idx_mess_date_food (mess, date, food),
        INDEX idx_quality (quality)
      )
    `);

    const students = makeStudents(80);
    const today = new Date();
    const values = [];

    // Seed 14 days of data with mixed good/bad reviews.
    for (let dayOffset = 1; dayOffset <= 14; dayOffset += 1) {
      const date = new Date(today);
      date.setDate(date.getDate() - dayOffset);
      const dateStr = formatDate(date);

      for (const meal of ["breakfast", "lunch", "dinner"]) {
        const used = new Set();
        for (const mess of ["Mess A", "Mess B"]) {
          // Mark some combinations as incidents (>50% bad).
          const incident =
            (mess === "Mess A" && meal === "lunch" && dayOffset % 2 === 0) ||
            (mess === "Mess B" && meal === "dinner" && dayOffset % 5 === 0);

          const badVotes = incident ? 12 : 4;
          const goodVotes = incident ? 8 : 16;

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
              dateStr,
              s.email,
              s.roll_number,
              mess,
              meal, // corresponding to food
              "bad",
            ]);
          }

          for (let i = 0; i < goodVotes; i += 1) {
            const s = pickStudent();
            values.push([
              dateStr,
              s.email,
              s.roll_number,
              mess,
              meal, // corresponding to food
              "good",
            ]);
          }
        }
      }
    }

    await connection.query(
      `
        INSERT INTO mess_reviews (
          date, email, roll_number, mess, food, quality
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
