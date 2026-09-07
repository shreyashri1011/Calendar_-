import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import "./App.css";

const API_URL = "http://localhost:4000";

function formatKolkataDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date()).reduce((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function App() {
  const today = useMemo(() => formatKolkataDate(), []);
  const [tasks, setTasks] = useState([]);
  const [activity, setActivity] = useState([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("academic");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [tasksResponse, activityResponse] = await Promise.all([
        fetch(`${API_URL}/daily-tasks?date=${today}`), fetch(`${API_URL}/daily-activity?days=28`),
      ]);
      if (!tasksResponse.ok || !activityResponse.ok) throw new Error("Could not load dashboard");
      const taskData = await tasksResponse.json();
      const activityData = await activityResponse.json();
      setTasks(taskData.tasks); setActivity(activityData.activity);
    } catch (requestError) {
      setError("Cannot reach the backend. Start it with: cd server && npm run dev");
      console.error(requestError);
    } finally { setLoading(false); }
  }, [today]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  async function addTask(event) {
    event.preventDefault();
    if (!title.trim()) return;
    try {
      const response = await fetch(`${API_URL}/daily-tasks`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, category }),
      });
      if (!response.ok) throw new Error("Could not create task");
      setTitle(""); await loadDashboard();
    } catch (requestError) {
      setError("Your task could not be saved. Is the backend running?"); console.error(requestError);
    }
  }

  async function toggleTask(taskId) {
    try {
      const response = await fetch(`${API_URL}/daily-tasks/${taskId}/toggle`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: today }),
      });
      if (!response.ok) throw new Error("Could not update task");
      await loadDashboard();
    } catch (requestError) {
      setError("Your change was not saved. Is the backend running?"); console.error(requestError);
    }
  }

  const completedCount = tasks.filter((task) => task.completed).length;
  const activityByDate = new Map(activity.map((day) => [day.date, day.completed_count]));
  const graphDays = Array.from({ length: 28 }, (_, index) => dayjs(today).subtract(27 - index, "day"));
  const maxCompleted = Math.max(1, ...activity.map((day) => day.completed_count));

  return <main className="app-shell">
    <header className="page-header"><div><p className="eyebrow">MY PERSONAL SPACE</p><h1>Daily Focus</h1><p className="subtitle">Small tasks, visible progress.</p></div><div className="today-card"><span>Today in Kolkata</span><strong>{dayjs(today).format("ddd, D MMM")}</strong></div></header>
    {error && <p className="status-message error-message">{error}</p>}
    <section className="dashboard-grid" aria-label="Daily focus dashboard">
      <section className="panel checklist-panel"><div className="panel-heading"><div><p className="eyebrow">TODAY'S LIST</p><h2>Your daily tasks</h2></div><span className="completion-count">{completedCount} done</span></div>
        <form className="task-form" onSubmit={addTask}><input aria-label="New daily task" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Add something you want to do every day" /><select aria-label="Task category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="academic">Academic</option><option value="life">Life</option></select><button type="submit">Add task</button></form>
        {loading ? <p className="status-message">Loading your daily list…</p> : tasks.length === 0 ? <p className="empty-state">Start with one small recurring task. It will appear here every day.</p> : <ul className="task-list">{tasks.map((task) => <li key={task.id} className={`task ${task.completed ? "completed" : ""}`}><label><input type="checkbox" checked={task.completed} onChange={() => toggleTask(task.id)} /><span className="checkmark" aria-hidden="true">✓</span><span className="task-title">{task.title}</span></label><span className={`tag ${task.category}`}>{task.category}</span></li>)}</ul>}
      </section>
      <section className="panel activity-panel"><div className="panel-heading"><div><p className="eyebrow">LAST 28 DAYS</p><h2>Your activity</h2></div></div><p className="graph-description">Each square becomes greener as you complete more tasks that day. There is no score to chase—just a quiet record of your effort.</p><div className="activity-graph" aria-label="Daily completed tasks over the last 28 days">{graphDays.map((date) => { const dateString = date.format("YYYY-MM-DD"); const completed = activityByDate.get(dateString) || 0; const level = completed === 0 ? 0 : Math.ceil((completed / maxCompleted) * 4); return <div className={`activity-dot level-${level}`} key={dateString} title={`${date.format("D MMM")}: ${completed} task${completed === 1 ? "" : "s"} completed`}><span className="sr-only">{date.format("D MMM")}: {completed} tasks completed</span></div>; })}</div><div className="graph-legend" aria-hidden="true"><span>Less</span><i className="level-0" /><i className="level-1" /><i className="level-2" /><i className="level-3" /><i className="level-4" /><span>More</span></div></section>
    </section>
  </main>;
}

export default App;
