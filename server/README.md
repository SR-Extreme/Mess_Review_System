# Mess Review Dashboard

React dashboard and Node.js + MySQL API to monitor daily, weekly and monthly performance of Mess A and Mess B for breakfast, lunch and dinner.

## Backend (Node + Express + MySQL)

### 1. Install dependencies

From the `Mess_Review` folder:

```bash
npm install
```

### 2. Configure database

Create a `.env` file in the `Mess_Review` folder based on `.env.example`:

```bash
cp .env.example .env
```

Then edit `.env` with your MySQL credentials and database name.

**Expected table (you can adapt it to your existing Excel import):**

```sql
CREATE TABLE mess_reviews (
  id INT PRIMARY KEY AUTO_INCREMENT,
  mess VARCHAR(50) NOT NULL,                    -- e.g. 'Mess A' or 'Mess B'
  meal ENUM('breakfast', 'lunch', 'dinner') NOT NULL,
  review_date DATE NOT NULL,
  quality VARCHAR(10) NOT NULL,                 -- 'good' or 'bad' per student review
  student_id VARCHAR(30),
  student_name VARCHAR(120),
  student_email VARCHAR(150),
  hostel VARCHAR(80),
  room_no VARCHAR(20),
  department VARCHAR(60),
  batch INT
);
```

Example rows:

| id | mess   | meal      | review_date | quality |
|----|--------|-----------|-------------|---------|
| 1  | Mess A | breakfast | 2026-01-04  | good    |
| 2  | Mess B | lunch     | 2026-01-05  | bad     |

Each row should represent a single student's review (imported from Excel each day).

### 3. Start backend server

```bash
npm run dev
```

By default the API runs on `http://localhost:5000`.

**Key endpoints:**

- `GET /api/health` – simple health check.
- `GET /api/messes` – list of mess names (e.g. `["Mess A","Mess B"]`).
- `GET /api/summary?mess=Mess%20A&range=daily` – performance summary.
- `GET /api/incidents?mess=Mess%20A&range=7&thresholdPercent=50` – only incidents where bad review % crossed threshold, with student-level refund export data.

`range` can be `daily`, `weekly`, or `monthly`.  
The `quality` column should be `good` or `bad` for each review.

## Frontend (React + Vite)

### 1. Install dependencies

From the `client` folder:

```bash
cd client
npm install
```

### 2. Run React dev server

```bash
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`).

Make sure the backend (`npm run dev` from the root) is also running on port `5000`, because the React app calls `http://localhost:5000/api/...`.

## How the dashboard works

- Select **Mess A** or **Mess B** from the dropdown.
- Choose **Today**, **Last 7 days**, or **Last 30 days**.
- For the selected mess and time range, the dashboard shows for each meal:
  - **Good** count and good percentage.
  - **Bad** count and bad percentage.
  - A bar for good vs bad proportion.

You can adjust the SQL table and import process from Excel as long as it populates the `mess_reviews` table with the fields described above.

## Dummy Data Seeding

From the `server` folder:

```bash
npm run seed
```

What it does:
- Creates `mess_reviews` if missing.
- Adds student detail columns if the table already existed.
- Clears old rows and inserts 14 days of mixed dummy data.
- Includes multiple day+meal combinations where bad reviews exceed 50%.

