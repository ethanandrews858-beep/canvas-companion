require("dotenv").config();
console.log("SERVER FILE IS RUNNING");

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const { Pool } = require("pg");

const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const JWT_SECRET = process.env.JWT_SECRET || "cc-dev-secret-change-before-production";
const CANVAS_URL = "https://ca.instructure.com/api/v1";

// ---------- DATABASE INIT ----------
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      completed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      canvas_id TEXT,
      title TEXT NOT NULL,
      class TEXT NOT NULL,
      due BIGINT,
      submitted BOOLEAN DEFAULT FALSE,
      manual_submitted BOOLEAN DEFAULT FALSE,
      graded BOOLEAN DEFAULT FALSE,
      grade TEXT,
      graded_at TEXT,
      priority_dismissed BOOLEAN DEFAULT FALSE,
      points_possible NUMERIC
    );
  `);
}

// ---------- AUTH MIDDLEWARE ----------
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ---------- CANVAS PAGINATION ----------
async function fetchAllPages(url, token) {
  let results = [];
  let nextUrl = url;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Canvas request failed: ${errorText}`);
    }

    const data = await response.json();
    if (Array.isArray(data)) results = results.concat(data);

    const linkHeader = response.headers.get("link");
    nextUrl = null;

    if (linkHeader) {
      for (const link of linkHeader.split(",")) {
        const match = link.match(/<([^>]+)>;\s*rel="([^"]+)"/);
        if (match && match[2] === "next") {
          nextUrl = match[1];
          break;
        }
      }
    }
  }

  return results;
}

// ---------- AUTH ROUTES ----------
app.post("/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id",
      [email.toLowerCase().trim(), hashed]
    );
    const token = jwt.sign(
      { userId: result.rows[0].id, email: email.toLowerCase().trim() },
      JWT_SECRET,
      { expiresIn: "30d" }
    );
    res.json({ token, email: email.toLowerCase().trim() });
  } catch (err) {
    if (err.code === "23505") {
      res.status(400).json({ error: "An account with that email already exists" });
    } else {
      console.error("Register error:", err.message);
      res.status(500).json({ error: "Registration failed" });
    }
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  const { rows } = await pool.query(
    "SELECT * FROM users WHERE email = $1",
    [email.toLowerCase().trim()]
  );
  const user = rows[0];
  if (!user) return res.status(401).json({ error: "Invalid email or password" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: "Invalid email or password" });

  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, email: user.email });
});

app.get("/me", requireAuth, (req, res) => {
  res.json({ email: req.user.email });
});

// ---------- TASK ROUTES ----------
app.get("/tasks", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, text, completed FROM tasks WHERE user_id = $1 ORDER BY created_at ASC",
    [req.user.userId]
  );
  res.json(rows);
});

app.post("/tasks", requireAuth, async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "Task text required" });
  const { rows } = await pool.query(
    "INSERT INTO tasks (user_id, text) VALUES ($1, $2) RETURNING id, text, completed",
    [req.user.userId, text]
  );
  res.json(rows[0]);
});

app.patch("/tasks/:id", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM tasks WHERE id = $1 AND user_id = $2",
    [req.params.id, req.user.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: "Task not found" });
  await pool.query("UPDATE tasks SET completed = $1 WHERE id = $2", [req.body.completed, req.params.id]);
  res.json({ ok: true });
});

app.delete("/tasks/:id", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM tasks WHERE id = $1 AND user_id = $2",
    [req.params.id, req.user.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: "Task not found" });
  await pool.query("DELETE FROM tasks WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
});

// ---------- ASSIGNMENT ROUTES ----------
app.get("/assignments", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM assignments WHERE user_id = $1 ORDER BY due IS NULL, due ASC",
    [req.user.userId]
  );
  res.json(rows.map(a => ({
    title: a.title,
    class: a.class,
    due: a.due !== null ? Number(a.due) : null,
    submitted: a.submitted,
    manualSubmitted: a.manual_submitted,
    graded: a.graded,
    grade: a.grade,
    gradedAt: a.graded_at,
    canvasId: a.canvas_id,
    priorityDismissed: a.priority_dismissed,
    pointsPossible: a.points_possible !== null ? Number(a.points_possible) : null
  })));
});

app.post("/assignments/sync", requireAuth, async (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: "Expected array" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM assignments WHERE user_id = $1", [req.user.userId]);

    for (const a of req.body) {
      await client.query(`
        INSERT INTO assignments
          (user_id, canvas_id, title, class, due, submitted, manual_submitted, graded, grade, graded_at, priority_dismissed, points_possible)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        req.user.userId,
        a.canvasId ?? null,
        a.title,
        a.class,
        a.due ?? null,
        a.submitted ?? false,
        a.manualSubmitted ?? false,
        a.graded ?? false,
        a.grade ?? null,
        a.gradedAt ?? null,
        a.priorityDismissed ?? false,
        a.pointsPossible ?? null
      ]);
    }

    await client.query("COMMIT");
    res.json({ ok: true, count: req.body.length });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Assignment sync failed:", err.message);
    res.status(500).json({ error: "Sync failed" });
  } finally {
    client.release();
  }
});

// ---------- CANVAS IMPORT ----------
app.post("/import", async (req, res) => {
  console.log("IMPORT ROUTE HIT");

  const { token, startDate, endDate } = req.body;
  if (!token) return res.status(400).json({ error: "Missing Canvas token" });

  try {
    const coursesUrl = `${CANVAS_URL}/courses?enrollment_state=active&per_page=100`;
    const courses = await fetchAllPages(coursesUrl, token);
    console.log(`Found ${courses.length} active courses`);

    let allAssignments = [];

    for (const course of courses) {
      try {
        const assignmentsUrl = `${CANVAS_URL}/courses/${course.id}/assignments?include[]=submission&per_page=100`;
        const assignments = await fetchAllPages(assignmentsUrl, token);

        let withDue = 0, withoutDue = 0;

        assignments.forEach(a => {
          const submission = a.submission || null;

          const submitted = !!submission && !!(
            submission.submitted_at ||
            (typeof submission.attempt === "number" && submission.attempt > 0) ||
            submission.workflow_state === "submitted" ||
            submission.workflow_state === "graded"
          );

          const hasGradeString = submission && submission.grade !== undefined && submission.grade !== null && submission.grade !== "";
          const hasScore = submission && submission.score !== undefined && submission.score !== null;

          const isGraded = !!submission && (
            submission.workflow_state === "graded" || hasGradeString || hasScore
          );

          const gradeValue = hasGradeString
            ? String(submission.grade)
            : hasScore ? String(submission.score)
            : null;

          if (a.due_at) withDue++; else withoutDue++;

          allAssignments.push({
            title: a.name,
            class: course.name,
            due: a.due_at ? new Date(a.due_at).getTime() : null,
            canvasId: `${course.id}-${a.id}`,
            submitted,
            graded: isGraded,
            grade: gradeValue,
            pointsPossible: typeof a.points_possible === "number" ? a.points_possible : null
          });
        });

        console.log(`Course: ${course.name} | Total: ${assignments.length} | With due: ${withDue} | No due: ${withoutDue}`);
      } catch (courseError) {
        console.error(`Failed course ${course.name} (${course.id}): ${courseError.message}`);
      }
    }

    console.log(`Total assignments fetched from Canvas: ${allAssignments.length}`);

    let result = allAssignments;
    if (startDate && endDate) {
      const oneDayMs = 24 * 60 * 60 * 1000;
      const start = Number(startDate) - oneDayMs;
      const end = Number(endDate) + oneDayMs;
      result = allAssignments.filter(a => {
        if (a.due === null) return true;
        return a.due >= start && a.due <= end;
      });
      console.log(`Quarter filter applied: ${allAssignments.length} → ${result.length}`);
    }

    res.json(result);
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ---------- START ----------
const PORT = process.env.PORT || 3000;
initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error("Failed to initialize database:", err.message);
    process.exit(1);
  });
