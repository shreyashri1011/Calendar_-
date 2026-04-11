const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const dayjs = require("dayjs");

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

// 1) Create/open SQLite DB file
const db = new Database("calendar.db");

// 2) Create events table if it doesn't exist
db.prepare(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    date TEXT NOT NULL,                 -- YYYY-MM-DD
    start_time TEXT NOT NULL,           -- HH:mm
    end_time TEXT NOT NULL,             -- HH:mm
    category TEXT NOT NULL CHECK(category IN ('academic', 'life')),
    reminder_minutes_before INTEGER,    -- optional
    remind_at TEXT,                     -- optional computed datetime
    reminder_sent INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`).run();

// Health route
app.get("/health", (req, res) => {
  res.json({ ok: true, message: "Backend is running" });
});

// 3) Create event route
app.post("/events", (req, res) => {
  const {
    title,
    description = "",
    date,
    start_time,
    end_time,
    category,
    reminder_minutes_before = null
  } = req.body;

  // Basic validation
  if (!title || !date || !start_time || !end_time || !category) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!["academic", "life"].includes(category)) {
    return res.status(400).json({ error: "Invalid category" });
  }

  if (end_time <= start_time) {
    return res.status(400).json({ error: "end_time must be after start_time" });
  }

  const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

  // Calculate remind_at if reminder_minutes_before is provided
  let remind_at = null;
  if (reminder_minutes_before !== null && reminder_minutes_before !== "") {
    const eventDateTime = dayjs(`${date} ${start_time}`, "YYYY-MM-DD HH:mm");
    remind_at = eventDateTime
      .subtract(Number(reminder_minutes_before), "minute")
      .format("YYYY-MM-DD HH:mm:ss");
  }

  const stmt = db.prepare(`
    INSERT INTO events (
      title, description, date, start_time, end_time, category,
      reminder_minutes_before, remind_at, reminder_sent, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `);

  const result = stmt.run(
    title,
    description,
    date,
    start_time,
    end_time,
    category,
    reminder_minutes_before === "" ? null : reminder_minutes_before,
    remind_at,
    now,
    now
  );

  res.status(201).json({ id: result.lastInsertRowid, message: "Event created" });
});

// 4) Read events route (with optional category filter)
app.get("/events", (req, res) => {
  const { category } = req.query;

  let rows;
  if (category && category !== "all") {
    rows = db
      .prepare("SELECT * FROM events WHERE category = ? ORDER BY date, start_time")
      .all(category);
  } else {
    rows = db
      .prepare("SELECT * FROM events ORDER BY date, start_time")
      .all();
  }

  res.json(rows);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
