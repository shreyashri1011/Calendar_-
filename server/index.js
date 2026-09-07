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

// A daily task repeats every day. Its completion history is stored separately.
db.prepare(`
  CREATE TABLE IF NOT EXISTS daily_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('academic', 'life')),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS daily_task_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    daily_task_id INTEGER NOT NULL,
    completion_date TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    UNIQUE(daily_task_id, completion_date),
    FOREIGN KEY(daily_task_id) REFERENCES daily_tasks(id) ON DELETE CASCADE
  )
`).run();

function formatKolkataDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date()).reduce((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function nowInKolkata() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date()).replace(",", "");
}

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

app.post("/daily-tasks", (req, res) => {
  const { title, category = "life" } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: "A task title is required" });
  if (!['academic', 'life'].includes(category)) return res.status(400).json({ error: "Invalid category" });

  const now = nowInKolkata();
  const result = db.prepare(`
    INSERT INTO daily_tasks (title, category, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(title.trim(), category, now, now);
  res.status(201).json({ id: result.lastInsertRowid, message: "Daily task created" });
});

app.get("/daily-tasks", (req, res) => {
  const date = req.query.date || formatKolkataDate();
  const tasks = db.prepare(`
    SELECT daily_tasks.id, daily_tasks.title, daily_tasks.category, daily_task_completions.completed_at
    FROM daily_tasks
    LEFT JOIN daily_task_completions
      ON daily_task_completions.daily_task_id = daily_tasks.id
      AND daily_task_completions.completion_date = ?
    WHERE daily_tasks.is_active = 1
    ORDER BY daily_tasks.category, daily_tasks.id
  `).all(date).map((task) => ({ ...task, completed: Boolean(task.completed_at) }));
  res.json({ date, tasks });
});

app.post("/daily-tasks/:id/toggle", (req, res) => {
  const taskId = Number(req.params.id);
  const date = req.body.date || formatKolkataDate();
  if (!Number.isInteger(taskId)) return res.status(400).json({ error: "Invalid task id" });

  const task = db.prepare("SELECT id FROM daily_tasks WHERE id = ? AND is_active = 1").get(taskId);
  if (!task) return res.status(404).json({ error: "Daily task not found" });

  const existing = db.prepare(`
    SELECT id FROM daily_task_completions WHERE daily_task_id = ? AND completion_date = ?
  `).get(taskId, date);
  if (existing) {
    db.prepare("DELETE FROM daily_task_completions WHERE id = ?").run(existing.id);
    return res.json({ id: taskId, date, completed: false });
  }

  db.prepare(`
    INSERT INTO daily_task_completions (daily_task_id, completion_date, completed_at)
    VALUES (?, ?, ?)
  `).run(taskId, date, nowInKolkata());
  res.json({ id: taskId, date, completed: true });
});

app.get("/daily-activity", (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 28, 7), 365);
  const startDate = dayjs(formatKolkataDate()).subtract(days - 1, "day").format("YYYY-MM-DD");
  const activity = db.prepare(`
    SELECT completion_date AS date, COUNT(*) AS completed_count
    FROM daily_task_completions
    WHERE completion_date >= ?
    GROUP BY completion_date
    ORDER BY completion_date
  `).all(startDate);
  res.json({ start_date: startDate, days, activity });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
