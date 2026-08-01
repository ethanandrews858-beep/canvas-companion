console.log("Canvas Companion script loaded");

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(err => {
      console.error("Service worker registration failed:", err);
    });
  });
}

let assignments = [];
let tasks = [];

const ASSIGNMENT_TYPES = ["Homework", "Quiz", "Test", "Project", "Other"];

const DEFAULT_SETTINGS = {
  quarters: {
    Q1: { name: "Quarter 1", start: "2025-08-06", end: "2025-10-10" },
    Q2: { name: "Quarter 2", start: "2025-10-14", end: "2025-12-19" },
    Q3: { name: "Quarter 3", start: "2026-01-06", end: "2026-03-13" },
    Q4: { name: "Quarter 4", start: "2026-03-17", end: "2026-05-28" }
  },
  defaultQuarter: "Q4",
  recentGradedDays: 7
};

let appSettings = loadSettings();
let activeQuarterKey = localStorage.getItem("activeQuarterKey") || appSettings.defaultQuarter;

// ---------- SETTINGS ----------
function loadSettings() {
  const saved = localStorage.getItem("canvasCompanionSettings");
  if (!saved) return structuredClone(DEFAULT_SETTINGS);

  try {
    const parsed = JSON.parse(saved);

    return {
      quarters: {
        Q1: {
          name: "Quarter 1",
          start: parsed?.quarters?.Q1?.start || DEFAULT_SETTINGS.quarters.Q1.start,
          end: parsed?.quarters?.Q1?.end || DEFAULT_SETTINGS.quarters.Q1.end
        },
        Q2: {
          name: "Quarter 2",
          start: parsed?.quarters?.Q2?.start || DEFAULT_SETTINGS.quarters.Q2.start,
          end: parsed?.quarters?.Q2?.end || DEFAULT_SETTINGS.quarters.Q2.end
        },
        Q3: {
          name: "Quarter 3",
          start: parsed?.quarters?.Q3?.start || DEFAULT_SETTINGS.quarters.Q3.start,
          end: parsed?.quarters?.Q3?.end || DEFAULT_SETTINGS.quarters.Q3.end
        },
        Q4: {
          name: "Quarter 4",
          start: parsed?.quarters?.Q4?.start || DEFAULT_SETTINGS.quarters.Q4.start,
          end: parsed?.quarters?.Q4?.end || DEFAULT_SETTINGS.quarters.Q4.end
        }
      },
      defaultQuarter: parsed?.defaultQuarter || DEFAULT_SETTINGS.defaultQuarter,
      recentGradedDays: Number(parsed?.recentGradedDays) || DEFAULT_SETTINGS.recentGradedDays
    };
  } catch (error) {
    console.error("Failed to load settings:", error);
    return structuredClone(DEFAULT_SETTINGS);
  }
}

function persistSettings() {
  localStorage.setItem("canvasCompanionSettings", JSON.stringify(appSettings));
}

function toggleSettings() {
  const panel = document.getElementById("settings-panel");
  if (!panel) return;
  document.getElementById("login-panel")?.classList.add("hidden");
  panel.classList.toggle("hidden");
}

function toggleLogin() {
  const panel = document.getElementById("login-panel");
  if (!panel) return;
  document.getElementById("settings-panel")?.classList.add("hidden");
  panel.classList.toggle("hidden");
}

function fillSettingsForm() {
  const q1s = document.getElementById("q1-start");
  if (!q1s) return;

  document.getElementById("q1-start").value = appSettings.quarters.Q1.start;
  document.getElementById("q1-end").value = appSettings.quarters.Q1.end;
  document.getElementById("q2-start").value = appSettings.quarters.Q2.start;
  document.getElementById("q2-end").value = appSettings.quarters.Q2.end;
  document.getElementById("q3-start").value = appSettings.quarters.Q3.start;
  document.getElementById("q3-end").value = appSettings.quarters.Q3.end;
  document.getElementById("q4-start").value = appSettings.quarters.Q4.start;
  document.getElementById("q4-end").value = appSettings.quarters.Q4.end;
  document.getElementById("default-quarter").value = appSettings.defaultQuarter;
  document.getElementById("recent-graded-days").value = String(appSettings.recentGradedDays);
}

function saveSettings() {
  appSettings = {
    quarters: {
      Q1: { name: "Quarter 1", start: document.getElementById("q1-start").value, end: document.getElementById("q1-end").value },
      Q2: { name: "Quarter 2", start: document.getElementById("q2-start").value, end: document.getElementById("q2-end").value },
      Q3: { name: "Quarter 3", start: document.getElementById("q3-start").value, end: document.getElementById("q3-end").value },
      Q4: { name: "Quarter 4", start: document.getElementById("q4-start").value, end: document.getElementById("q4-end").value }
    },
    defaultQuarter: document.getElementById("default-quarter").value,
    recentGradedDays: Number(document.getElementById("recent-graded-days").value)
  };

  persistSettings();
  localStorage.setItem("activeQuarterKey", activeQuarterKey);
  syncQuarterDropdown();
  renderAssignments();
  alert("Settings saved.");
}

function resetSettings() {
  appSettings = structuredClone(DEFAULT_SETTINGS);
  persistSettings();

  activeQuarterKey = appSettings.defaultQuarter;
  localStorage.setItem("activeQuarterKey", activeQuarterKey);

  fillSettingsForm();
  syncQuarterDropdown();
  renderAssignments();

  alert("Settings reset.");
}

// ---------- QUARTERS ----------
function getQuarterRange(key) {
  if (key === "ALL") return null;

  const q = appSettings.quarters[key];
  if (!q) return null;

  return {
    name: q.name,
    start: new Date(`${q.start}T00:00:00`).getTime(),
    end: new Date(`${q.end}T23:59:59`).getTime()
  };
}

function getActiveQuarter() {
  if (activeQuarterKey === "ALL") return { name: "All Year" };
  return getQuarterRange(activeQuarterKey);
}

function setActiveQuarter(newQuarterKey) {
  if (!["Q1", "Q2", "Q3", "Q4", "ALL"].includes(newQuarterKey)) return;

  activeQuarterKey = newQuarterKey;
  localStorage.setItem("activeQuarterKey", activeQuarterKey);
  renderAssignments();
}

function syncQuarterDropdown() {
  const quarterSelect = document.getElementById("quarter-select");
  if (quarterSelect) quarterSelect.value = activeQuarterKey;
}

function isInActiveQuarter(dueTimestamp) {
  if (activeQuarterKey === "ALL") return true;

  if (dueTimestamp === null || dueTimestamp === undefined || Number.isNaN(dueTimestamp)) {
    return false;
  }

  const quarter = getQuarterRange(activeQuarterKey);
  if (!quarter) return false;

  const oneDayMs = 24 * 60 * 60 * 1000;

  return (
    dueTimestamp >= (quarter.start - oneDayMs) &&
    dueTimestamp <= (quarter.end + oneDayMs)
  );
}

// ---------- STORAGE ----------
function loadAssignments() {
  const saved = localStorage.getItem("assignments");

  if (!saved) {
    assignments = [];
    return;
  }

  try {
    assignments = JSON.parse(saved)
      .map(a => ({
        title: a.title || "",
        class: a.class || "",
        due:
          a.due === null || a.due === undefined
            ? null
            : typeof a.due === "number"
              ? a.due
              : Number.isNaN(new Date(a.due).getTime())
                ? null
                : new Date(a.due).getTime(),
        submitted: Boolean(a.submitted),
        manualSubmitted: Boolean(a.manualSubmitted),
        graded: Boolean(a.graded),
        grade: a.grade ?? null,
        gradedAt: a.gradedAt ?? null,
        canvasId: a.canvasId ?? null,
        priorityDismissed: Boolean(a.priorityDismissed),
        pointsPossible: typeof a.pointsPossible === "number" ? a.pointsPossible : null,
        type: ASSIGNMENT_TYPES.includes(a.type) ? a.type : "Other"
      }))
      .filter(a => a.title && a.class);
  } catch (error) {
    console.error("Failed to load assignments:", error);
    assignments = [];
  }
}

function saveAssignments() {
  localStorage.setItem("assignments", JSON.stringify(assignments));
  if (isLoggedIn()) syncAssignmentsToServer();
}

async function syncAssignmentsToServer() {
  try {
    await fetch("/assignments/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`
      },
      body: JSON.stringify(assignments)
    });
  } catch {
    // silent — localStorage still has the data
  }
}

async function loadAssignmentsFromServer() {
  try {
    const res = await fetch("/assignments", {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (res.ok) {
      assignments = await res.json();
      localStorage.setItem("assignments", JSON.stringify(assignments));
    }
  } catch {
    loadAssignments();
  }
}

function loadTasks() {
  const saved = localStorage.getItem("tasks");

  if (!saved) {
    tasks = [];
    return;
  }

  try {
    tasks = JSON.parse(saved);
  } catch (error) {
    console.error("Failed to load tasks:", error);
    tasks = [];
  }
}

function saveTasks() {
  localStorage.setItem("tasks", JSON.stringify(tasks));
}

// ---------- STATUS ----------
function isZeroGrade(assignment) {
  if (!assignment.graded && (assignment.grade === null || assignment.grade === "")) return false;

  const raw = String(assignment.grade ?? "").trim().toLowerCase();

  if (raw === "0") return true;
  if (raw.startsWith("0/")) return true;
  if (raw.startsWith("0 /")) return true;

  const numeric = Number(raw);
  return !Number.isNaN(numeric) && numeric === 0;
}

function getAssignmentStatus(assignment) {
  if (!assignment.manualSubmitted && isZeroGrade(assignment)) return "needs-attention";

  if (assignment.graded || (assignment.grade !== null && assignment.grade !== "")) {
    return "graded";
  }

  if (assignment.submitted || assignment.manualSubmitted) {
    return "submitted";
  }

  if (assignment.due === null || assignment.due === undefined || Number.isNaN(assignment.due)) {
    return "upcoming";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(assignment.due);
  dueDate.setHours(0, 0, 0, 0);

  if (dueDate.getTime() < today.getTime()) return "late";

  return "upcoming";
}

function getVisibleAssignments() {
  return assignments.filter(a => isInActiveQuarter(a.due));
}

function formatDate(timestamp) {
  if (timestamp === null || timestamp === undefined || Number.isNaN(timestamp)) {
    return "No due date";
  }

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function getDueText(assignment) {
  if (assignment.due === null || assignment.due === undefined || Number.isNaN(assignment.due)) {
    return "No due date";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(assignment.due);
  dueDate.setHours(0, 0, 0, 0);

  const diffMs = dueDate.getTime() - today.getTime();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1) return `In ${days} days`;

  return formatDate(assignment.due);
}

function isRecentlyGraded(assignment) {
  const isActuallyGraded = assignment.graded || (assignment.grade !== null && assignment.grade !== "");
  if (!isActuallyGraded || isZeroGrade(assignment)) return false;

  const now = Date.now();
  const recentMs = appSettings.recentGradedDays * 24 * 60 * 60 * 1000;

  if (assignment.gradedAt) {
    const gradedTime = new Date(assignment.gradedAt).getTime();
    if (!Number.isNaN(gradedTime)) return (now - gradedTime) <= recentMs;
  }

  if (assignment.due !== null && assignment.due !== undefined && !Number.isNaN(assignment.due)) {
    return (now - assignment.due) <= recentMs;
  }

  return false;
}

function findExistingAssignmentIndex(incoming) {
  return assignments.findIndex(existing =>
    existing.canvasId && incoming.canvasId
      ? existing.canvasId === incoming.canvasId
      : (
          existing.title === incoming.title &&
          existing.class === incoming.class &&
          existing.due === incoming.due
        )
  );
}

// ---------- BUTTON ACTIONS ----------
function markSubmitted(assignment) {
  let index = assignments.indexOf(assignment);
  if (index === -1 && assignment.canvasId) {
    index = assignments.findIndex(a => a.canvasId === assignment.canvasId);
  }

  if (index !== -1) {
    assignments[index].manualSubmitted = true;
    assignments[index].submitted = true;
    saveAssignments();
    renderAssignments();
  }
}

function markGraded(assignment) {
  const idx = assignments.indexOf(assignment);
  if (idx === -1) return;
  const a = assignments[idx];
  a.graded = true;
  a.submitted = true;
  a.manualSubmitted = false;
  a.gradedAt = new Date().toISOString();
  if (a.grade === null || a.grade === "" || isZeroGrade(a)) {
    a.grade = "Complete";
  }
  saveAssignments();
  renderAssignments();
}

function changeAssignmentType(assignment, newType) {
  if (!ASSIGNMENT_TYPES.includes(newType)) return;
  const idx = assignments.indexOf(assignment);
  if (idx === -1) return;
  assignments[idx].type = newType;
  saveAssignments();
  renderAssignments();
}

function deleteAssignment(assignment) {
  const index = assignments.indexOf(assignment);
  if (index !== -1) {
    assignments.splice(index, 1);
    saveAssignments();
    renderAssignments();
  }
}

// ---------- PRIORITY ----------
function getPriorityAssignments() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  return getVisibleAssignments()
    .filter(a => {
      const s = getAssignmentStatus(a);
      if (s === "graded" || s === "submitted") return false;
      if (a.priorityDismissed && s !== "late" && s !== "needs-attention") return false;
      if (s === "upcoming" && a.due !== null && !Number.isNaN(a.due)) {
        const daysUntil = Math.ceil((a.due - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntil > 10) return false;
      }
      return true;
    })
    .map(a => {
      let priorityScore = 0;
      const status = getAssignmentStatus(a);

      if (status === "needs-attention") priorityScore += 130;

      if (status === "late") {
        priorityScore += 100;
        const daysLate = Math.floor((now.getTime() - a.due) / (1000 * 60 * 60 * 24));
        if (daysLate <= 2) priorityScore += 20;
      }

      if (a.due !== null && a.due !== undefined && !Number.isNaN(a.due)) {
        const dueDate = new Date(a.due);
        dueDate.setHours(0, 0, 0, 0);
        const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntil === 0) priorityScore += 60;
        else if (daysUntil === 1) priorityScore += 40;
        else if (daysUntil <= 3) priorityScore += 20;
      }

      return { ...a, priorityScore };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 5);
}

function dismissFromPriority(assignment) {
  const idx = assignment.canvasId
    ? assignments.findIndex(a => a.canvasId === assignment.canvasId)
    : assignments.findIndex(a => a.title === assignment.title && a.class === assignment.class && a.due === assignment.due);

  if (idx !== -1) {
    assignments[idx].priorityDismissed = true;
    saveAssignments();
    renderPriorityCard();
  }
}

function renderPriorityCard() {
  const priorityList = document.getElementById("priority-list");
  if (!priorityList) return;

  priorityList.innerHTML = "";

  const items = getPriorityAssignments();

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "priority-empty";
    empty.textContent = "Nothing urgent right now. You’re in a good spot.";
    priorityList.appendChild(empty);
    return;
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  items.forEach(assignment => {
    const status = getAssignmentStatus(assignment);
    const dueText = getDueText(assignment);

    let reason = "Upcoming — plan ahead";
    if (status === "needs-attention") {
      reason = "You have a 0 — talk to your teacher";
    } else if (status === "late") {
      const daysLate = Math.floor((now.getTime() - assignment.due) / (1000 * 60 * 60 * 24));
      reason = daysLate <= 1 ? "Just went late — turn it in now" : `${daysLate} days late — act soon`;
    } else if (dueText === "Today") {
      reason = "Due today — finish this first";
    } else if (dueText === "Tomorrow") {
      reason = "Due tomorrow — don’t wait";
    } else if (dueText.startsWith("In ")) {
      reason = `${dueText} — get ahead of it`;
    }

    const item = document.createElement("div");
    item.className = "priority-item";

    const header = document.createElement("div");
    header.className = "priority-item-header";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "priority-check";
    checkbox.title = "Mark as done for today";
    checkbox.onchange = () => { if (checkbox.checked) dismissFromPriority(assignment); };

    const title = document.createElement("h3");
    title.textContent = assignment.title;

    header.appendChild(checkbox);
    header.appendChild(title);

    const metaP = document.createElement("p");
    metaP.textContent = `${assignment.class} · ${dueText}`;

    const reasonP = document.createElement("p");
    reasonP.className = "priority-reason";
    reasonP.textContent = reason;

    item.appendChild(header);
    item.appendChild(metaP);
    item.appendChild(reasonP);
    priorityList.appendChild(item);
  });
}

// ---------- GRADES ----------
function parseGradeToPoints(assignment) {
  const isActuallyGraded = assignment.graded || (assignment.grade !== null && assignment.grade !== "");
  if (!isActuallyGraded) return null;

  const raw = String(assignment.grade ?? "").trim();
  if (!raw) return null;

  const fractionMatch = raw.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (fractionMatch) {
    return { earned: Number(fractionMatch[1]), possible: Number(fractionMatch[2]) };
  }

  const numeric = Number(raw);
  if (Number.isNaN(numeric)) return null; // e.g. "Complete" or a letter grade — not a usable score

  if (typeof assignment.pointsPossible === "number" && assignment.pointsPossible > 0) {
    return { earned: numeric, possible: assignment.pointsPossible };
  }

  return { earned: numeric, possible: 100 };
}

function getClassGradeTotals() {
  const totals = {};

  getVisibleAssignments().forEach(a => {
    const points = parseGradeToPoints(a);
    if (!points || points.possible <= 0) return;

    if (!totals[a.class]) totals[a.class] = { earned: 0, possible: 0, count: 0 };
    totals[a.class].earned += points.earned;
    totals[a.class].possible += points.possible;
    totals[a.class].count += 1;
  });

  return totals;
}

function computeClassGrades() {
  const totals = getClassGradeTotals();

  return Object.entries(totals)
    .map(([className, stats]) => ({
      class: className,
      percent: (stats.earned / stats.possible) * 100,
      count: stats.count
    }))
    .sort((a, b) => a.class.localeCompare(b.class));
}

function percentToLetter(percent) {
  if (percent >= 97) return "A+";
  if (percent >= 93) return "A";
  if (percent >= 90) return "A-";
  if (percent >= 87) return "B+";
  if (percent >= 83) return "B";
  if (percent >= 80) return "B-";
  if (percent >= 77) return "C+";
  if (percent >= 73) return "C";
  if (percent >= 70) return "C-";
  if (percent >= 67) return "D+";
  if (percent >= 63) return "D";
  if (percent >= 60) return "D-";
  return "F";
}

function renderGrades() {
  const list = document.getElementById("grades-list");
  const classSelect = document.getElementById("grade-target-class");
  if (!list || !classSelect) return;

  list.innerHTML = "";
  const grades = computeClassGrades();

  if (grades.length === 0) {
    const empty = document.createElement("p");
    empty.className = "grades-empty";
    empty.textContent = "No graded assignments with a numeric score yet — grades will show up here once Canvas syncs them or you mark some as graded.";
    list.appendChild(empty);
  } else {
    grades.forEach(g => {
      const percent = Math.max(0, Math.min(100, g.percent));
      const letter = percentToLetter(g.percent);
      const isFailing = g.percent < 60;

      const card = document.createElement("div");
      card.className = "grade-card";
      card.innerHTML = `
        <div class="grade-card-header">
          <h3>${g.class}</h3>
          <span class="grade-letter${isFailing ? " grade-letter-critical" : ""}">${letter}</span>
        </div>
        <div class="grade-meter">
          <div class="grade-meter-fill${isFailing ? " critical" : ""}" style="width: ${percent}%"></div>
        </div>
        <p class="grade-meta">${g.percent.toFixed(1)}% · ${g.count} graded assignment${g.count === 1 ? "" : "s"}</p>
      `;
      list.appendChild(card);
    });
  }

  const previousSelection = classSelect.value;
  classSelect.innerHTML = "";

  const classNames = [...new Set(getVisibleAssignments().map(a => a.class))].sort((a, b) => a.localeCompare(b));

  if (classNames.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No classes yet";
    classSelect.appendChild(option);
  } else {
    classNames.forEach(className => {
      const option = document.createElement("option");
      option.value = className;
      option.textContent = className;
      classSelect.appendChild(option);
    });

    if (classNames.includes(previousSelection)) classSelect.value = previousSelection;
  }
}

function calculateNeededScore() {
  const classSelect = document.getElementById("grade-target-class");
  const pointsInput = document.getElementById("grade-target-points");
  const percentInput = document.getElementById("grade-target-percent");
  const resultEl = document.getElementById("grade-target-result");

  const className = classSelect.value;
  const newPoints = Number(pointsInput.value);
  const targetPercent = Number(percentInput.value);

  if (!className) {
    resultEl.textContent = "Add a graded assignment for a class first — there's nothing to calculate yet.";
    return;
  }
  if (!newPoints || newPoints <= 0) {
    resultEl.textContent = "Enter how many points the next assignment is worth.";
    return;
  }
  if (!targetPercent || targetPercent <= 0 || targetPercent > 100) {
    resultEl.textContent = "Enter a target grade between 1 and 100.";
    return;
  }

  const totals = getClassGradeTotals()[className];
  const earned = totals ? totals.earned : 0;
  const possible = totals ? totals.possible : 0;

  const needed = (targetPercent / 100) * (possible + newPoints) - earned;

  if (needed <= 0) {
    resultEl.textContent = `You're already above ${targetPercent}% in ${className} — even a 0 on this assignment keeps you at or above that target.`;
  } else if (needed > newPoints) {
    const bestCase = ((earned + newPoints) / (possible + newPoints)) * 100;
    resultEl.textContent = `Even a perfect score on this assignment only gets you to ${bestCase.toFixed(1)}% — you can't reach ${targetPercent}% in ${className} from this one assignment alone.`;
  } else {
    const neededPercent = (needed / newPoints) * 100;
    resultEl.textContent = `You need at least ${needed.toFixed(1)} / ${newPoints} points (${neededPercent.toFixed(1)}%) on this assignment to reach ${targetPercent}% in ${className}.`;
  }
}

// ---------- MISSING WORK (ALL TIME) ----------
function getQuarterLabelForDate(due) {
  if (due === null || due === undefined || Number.isNaN(due)) return null;

  for (const key of ["Q1", "Q2", "Q3", "Q4"]) {
    const range = getQuarterRange(key);
    if (range && due >= range.start && due <= range.end) return range.name;
  }

  return null;
}

function getAllTimeMissingWork() {
  return assignments
    .filter(a => {
      const status = getAssignmentStatus(a);
      return status === "late" || status === "needs-attention";
    })
    .sort((a, b) => {
      const aDue = a.due ?? Number.MAX_SAFE_INTEGER;
      const bDue = b.due ?? Number.MAX_SAFE_INTEGER;
      return aDue - bDue;
    });
}

function renderMissingWork() {
  const container = document.getElementById("missing-work-list");
  if (!container) return;

  container.innerHTML = "";
  const items = getAllTimeMissingWork();

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "overview-empty";
    empty.textContent = "Nothing missing anywhere — you're all caught up.";
    container.appendChild(empty);
    return;
  }

  items.forEach(a => {
    const quarterLabel = getQuarterLabelForDate(a.due);

    const row = document.createElement("div");
    row.className = "missing-work-item";
    row.innerHTML = `
      <strong>${a.title}</strong>
      <span class="missing-work-meta">${a.class} · ${getDueText(a)}${quarterLabel ? ` · ${quarterLabel}` : ""}</span>
    `;
    container.appendChild(row);
  });
}

// ---------- STUDY PLAN ----------
function getStudyPlanAssignments() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  return getVisibleAssignments()
    .filter(a => {
      if (getAssignmentStatus(a) !== "upcoming") return false;
      if (a.due === null || a.due === undefined || Number.isNaN(a.due)) return false;

      const daysUntil = Math.ceil((a.due - now.getTime()) / (1000 * 60 * 60 * 24));
      return daysUntil >= 2 && daysUntil <= 14;
    })
    .map(a => ({
      ...a,
      daysUntil: Math.ceil((a.due - now.getTime()) / (1000 * 60 * 60 * 24))
    }))
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

function buildStudyCheckpoints(assignment) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(assignment.due);
  dueDate.setHours(0, 0, 0, 0);

  const checkpoints = [{ label: "Start", date: today.getTime() }];

  if (assignment.daysUntil >= 4) {
    const halfway = new Date(today);
    halfway.setDate(halfway.getDate() + Math.floor(assignment.daysUntil / 2));
    checkpoints.push({ label: "Halfway check-in", date: halfway.getTime() });
  }

  const finish = new Date(dueDate);
  finish.setDate(finish.getDate() - 1);
  checkpoints.push({ label: "Finish & review", date: finish.getTime() });

  return checkpoints;
}

function renderStudyPlan() {
  const container = document.getElementById("study-plan-list");
  if (!container) return;

  container.innerHTML = "";
  const items = getStudyPlanAssignments();

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "overview-empty";
    empty.textContent = "Nothing far enough out to plan yet — assignments due in 2+ days will show up here.";
    container.appendChild(empty);
    return;
  }

  items.forEach(a => {
    const checkpoints = buildStudyCheckpoints(a);

    const card = document.createElement("div");
    card.className = "study-plan-item";
    card.innerHTML = `
      <h3>${a.title}</h3>
      <p class="grades-hint">${a.class} · Due ${formatDate(a.due)} (${a.daysUntil} days away)</p>
      <div class="study-plan-checkpoints">
        ${checkpoints.map(c => `<span class="study-checkpoint"><strong>${c.label}:</strong> ${formatDate(c.date)}</span>`).join("")}
      </div>
    `;
    container.appendChild(card);
  });
}

// ---------- WEEKLY DIGEST ----------
function getThisWeekAssignments() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return getVisibleAssignments()
    .filter(a => {
      if (a.due === null || a.due === undefined || Number.isNaN(a.due)) return false;
      const dueDate = new Date(a.due);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate.getTime() >= today.getTime() && dueDate.getTime() <= weekEnd.getTime();
    })
    .sort((a, b) => a.due - b.due);
}

function renderWeeklyDigest() {
  const digestEl = document.getElementById("weekly-digest");
  const weekList = document.getElementById("week-list");
  if (!digestEl || !weekList) return;

  const items = getThisWeekAssignments();

  digestEl.textContent = items.length === 0
    ? "Nothing due in the next 7 days."
    : `${items.length} assignment${items.length === 1 ? "" : "s"} due in the next 7 days.`;

  weekList.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "overview-empty";
    empty.textContent = "Nothing due this week.";
    weekList.appendChild(empty);
    return;
  }

  items.forEach(a => {
    const item = document.createElement("div");
    item.className = "today-item";
    item.textContent = `${a.title} (${a.class}) — ${getDueText(a)}`;
    weekList.appendChild(item);
  });
}

// ---------- CALENDAR ----------
let calendarViewYear = new Date().getFullYear();
let calendarViewMonth = new Date().getMonth();

function changeCalendarMonth(delta) {
  calendarViewMonth += delta;
  if (calendarViewMonth < 0) { calendarViewMonth = 11; calendarViewYear--; }
  if (calendarViewMonth > 11) { calendarViewMonth = 0; calendarViewYear++; }
  renderCalendar();
}

function getAssignmentsByDay() {
  const map = {};
  assignments.forEach(a => {
    if (a.due === null || a.due === undefined || Number.isNaN(a.due)) return;
    const d = new Date(a.due);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!map[key]) map[key] = [];
    map[key].push(a);
  });
  return map;
}

function renderCalendar() {
  const grid = document.getElementById("calendar-grid");
  const label = document.getElementById("calendar-month-label");
  if (!grid || !label) return;

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  label.textContent = `${monthNames[calendarViewMonth]} ${calendarViewYear}`;

  grid.innerHTML = "";

  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach(d => {
    const head = document.createElement("div");
    head.className = "calendar-day-name";
    head.textContent = d;
    grid.appendChild(head);
  });

  const firstOfMonth = new Date(calendarViewYear, calendarViewMonth, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(calendarViewYear, calendarViewMonth + 1, 0).getDate();
  const byDay = getAssignmentsByDay();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < startWeekday; i++) {
    const blank = document.createElement("div");
    blank.className = "calendar-cell calendar-cell-empty";
    grid.appendChild(blank);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement("div");
    cell.className = "calendar-cell";

    const cellDate = new Date(calendarViewYear, calendarViewMonth, day);
    if (cellDate.getTime() === today.getTime()) cell.classList.add("calendar-cell-today");

    const dayAssignments = byDay[`${calendarViewYear}-${calendarViewMonth}-${day}`] || [];

    const numberEl = document.createElement("div");
    numberEl.className = "calendar-day-number";
    numberEl.textContent = day;
    cell.appendChild(numberEl);

    dayAssignments.slice(0, 3).forEach(a => {
      const status = getAssignmentStatus(a);
      const item = document.createElement("div");
      item.className = "calendar-item";
      if (status === "late" || status === "needs-attention") item.classList.add("calendar-item-late");
      else if (status === "graded") item.classList.add("calendar-item-graded");
      item.textContent = a.title;
      item.title = `${a.title} — ${a.class}`;
      cell.appendChild(item);
    });

    if (dayAssignments.length > 3) {
      const more = document.createElement("div");
      more.className = "calendar-item-more";
      more.textContent = `+${dayAssignments.length - 3} more`;
      cell.appendChild(more);
    }

    grid.appendChild(cell);
  }
}

function formatGradeDisplay(assignment) {
  const grade = assignment.grade;
  if (grade === null || grade === "") return null;
  const g = String(grade).trim();
  if (g.includes("/") || isNaN(Number(g))) return g;
  if (assignment.pointsPossible !== null && assignment.pointsPossible !== undefined) {
    return `${g}/${assignment.pointsPossible}`;
  }
  return g;
}

// ---------- CARD CREATION ----------
function createAssignmentCard(assignment) {
  const status = getAssignmentStatus(assignment);

  const card = document.createElement("div");
  card.className = "assignment-card";

  if (status === "late" || status === "needs-attention") {
    card.classList.add("late-assignment");
  }

  card.innerHTML = `
    <h3>${assignment.title}</h3>
    <p>Class: ${assignment.class}</p>
    <p>Due: ${getDueText(assignment)}</p>
    ${formatGradeDisplay(assignment) !== null ? `<p>Grade: ${formatGradeDisplay(assignment)}</p>` : ""}
  `;

  const badge = document.createElement("span");
  badge.className = "status-badge";

  if (status === "needs-attention") {
    badge.textContent = "Needs Attention";
    badge.classList.add("badge-late");
  } else if (status === "late") {
    badge.textContent = "Late";
    badge.classList.add("badge-late");
  } else if (status === "graded") {
    badge.textContent = "Graded";
    badge.classList.add("badge-submitted");
  } else if (status === "submitted") {
    badge.textContent = assignment.manualSubmitted ? "Marked Submitted" : "Submitted";
    badge.classList.add("badge-submitted");
  } else if (getDueText(assignment) === "Tomorrow") {
    badge.textContent = "Due Tomorrow";
    badge.classList.add("badge-due-soon");
  } else {
    badge.textContent = "Upcoming";
    badge.classList.add("badge-upcoming");
  }

  card.appendChild(badge);

  const typeSelect = document.createElement("select");
  typeSelect.className = "assignment-type-select";
  typeSelect.title = "Assignment type";
  ASSIGNMENT_TYPES.forEach(t => {
    const option = document.createElement("option");
    option.value = t;
    option.textContent = t;
    if (t === assignment.type) option.selected = true;
    typeSelect.appendChild(option);
  });
  typeSelect.onchange = () => changeAssignmentType(assignment, typeSelect.value);
  card.appendChild(typeSelect);

  // BUTTON RULES:
  // Late/Needs Attention section: Mark Submitted + Delete
  if (status === "late" || status === "needs-attention") {
    const submitBtn = document.createElement("button");
    submitBtn.textContent = "Mark Submitted";
    submitBtn.onclick = () => markSubmitted(assignment);
    card.appendChild(submitBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.onclick = () => deleteAssignment(assignment);
    card.appendChild(deleteBtn);

    return card;
  }

  // Ungraded section: Mark Graded + Delete
  if (status === "submitted" || status === "upcoming") {
    const gradeBtn = document.createElement("button");
    gradeBtn.textContent = "Mark Graded";
    gradeBtn.onclick = () => markGraded(assignment);
    card.appendChild(gradeBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.onclick = () => deleteAssignment(assignment);
    card.appendChild(deleteBtn);

    return card;
  }

  // Graded section: Delete only
  if (status === "graded") {
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.onclick = () => deleteAssignment(assignment);
    card.appendChild(deleteBtn);

    return card;
  }

  return card;
}

// ---------- RENDER ----------
function renderAssignments() {
  syncQuarterDropdown();

  const upcomingList = document.getElementById("upcoming-list");
  const lateList = document.getElementById("late-list");
  const gradedList = document.getElementById("graded-list");
  const todayList = document.getElementById("today-list");
  const tomorrowList = document.getElementById("tomorrow-list");

  const searchInput = document.getElementById("search-input");
  const filterSelect = document.getElementById("filter-select");
  const typeFilterSelect = document.getElementById("type-filter");

  const searchText = searchInput ? searchInput.value.toLowerCase().trim() : "";
  const filter = filterSelect ? filterSelect.value : "all";
  const typeFilter = typeFilterSelect ? typeFilterSelect.value : "all";

  upcomingList.innerHTML = "";
  lateList.innerHTML = "";
  gradedList.innerHTML = "";
  todayList.innerHTML = "";
  if (tomorrowList) tomorrowList.innerHTML = "";

  const visibleAssignments = getVisibleAssignments().slice().sort((a, b) => {
    const aDue = a.due ?? Number.MAX_SAFE_INTEGER;
    const bDue = b.due ?? Number.MAX_SAFE_INTEGER;
    return aDue - bDue;
  });

  let dueToday = 0;
  let dueTomorrow = 0;
  let lateCount = 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  visibleAssignments.forEach(assignment => {
    const status = getAssignmentStatus(assignment);

    if (status === "late" || status === "needs-attention") lateCount++;

    if (assignment.due !== null && assignment.due !== undefined && !Number.isNaN(assignment.due)) {
      const dueDate = new Date(assignment.due);
      dueDate.setHours(0, 0, 0, 0);

      if (dueDate.getTime() === today.getTime()) {
        dueToday++;
        const todayItem = document.createElement("div");
        todayItem.className = "today-item";
        todayItem.textContent = `${assignment.title} (${assignment.class})`;
        todayList.appendChild(todayItem);
      } else if (dueDate.getTime() === tomorrow.getTime() && tomorrowList) {
        dueTomorrow++;
        const tomorrowItem = document.createElement("div");
        tomorrowItem.className = "today-item tomorrow-item";
        tomorrowItem.textContent = `${assignment.title} (${assignment.class})`;
        tomorrowList.appendChild(tomorrowItem);
      }
    }

    const matchesSearch =
      assignment.title.toLowerCase().includes(searchText) ||
      assignment.class.toLowerCase().includes(searchText);

    if (!matchesSearch) return;

    if (typeFilter !== "all" && (assignment.type || "Other") !== typeFilter) return;

    if (filter === "late" && !(status === "late" || status === "needs-attention")) return;

    if (filter === "due-soon") {
      if (assignment.due === null || assignment.due === undefined || Number.isNaN(assignment.due)) return;

      const dueDate = new Date(assignment.due);
      dueDate.setHours(0, 0, 0, 0);
      const hoursUntilDue = (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60);

      if (!(hoursUntilDue <= 24 && hoursUntilDue >= 0)) return;
    }

    const card = createAssignmentCard(assignment);

    if (status === "graded") {
      if (isRecentlyGraded(assignment)) {
        gradedList.appendChild(card);
      }
    } else if (status === "late" || status === "needs-attention") {
      lateList.appendChild(card);
    } else {
      upcomingList.appendChild(card);
    }
  });

  document.getElementById("due-today").textContent = dueToday;
  document.getElementById("due-tomorrow-count").textContent = dueTomorrow;
  document.getElementById("late-count").textContent = lateCount;
  document.getElementById("total-count").textContent = visibleAssignments.length;

  if (todayList && dueToday === 0) {
    const empty = document.createElement("p");
    empty.className = "overview-empty";
    empty.textContent = "Nothing due today.";
    todayList.appendChild(empty);
  }
  if (tomorrowList && dueTomorrow === 0) {
    const empty = document.createElement("p");
    empty.className = "overview-empty";
    empty.textContent = "Nothing due tomorrow.";
    tomorrowList.appendChild(empty);
  }

  renderPriorityCard();
  renderGrades();
  renderMissingWork();
  renderStudyPlan();
  renderCalendar();
  renderWeeklyDigest();
}

// ---------- IMPORT ----------
async function importCanvas() {
  const tokenInput = document.getElementById("canvas-token");
  const token = tokenInput.value.trim();

  if (!token) {
    alert("Paste your Canvas token first.");
    return;
  }

  const quarterRange = activeQuarterKey !== "ALL" ? getQuarterRange(activeQuarterKey) : null;

  try {
    const response = await fetch("/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        startDate: quarterRange ? quarterRange.start : null,
        endDate: quarterRange ? quarterRange.end : null
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Import failed:", errorText);
      alert("Import failed: " + errorText);
      return;
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      console.error("Unexpected backend response:", data);
      alert("Import failed: invalid backend response.");
      return;
    }

    let addedCount = 0;
    let updatedCount = 0;

    data.forEach(a => {
      if (!a || !a.title || !a.class) return;

      const incomingDue = a.due ?? null;
      const existingIndex = findExistingAssignmentIndex({
        title: a.title,
        class: a.class,
        due: incomingDue,
        canvasId: a.canvasId || null
      });

      const existingAssignment = existingIndex !== -1 ? assignments[existingIndex] : null;

      const isGraded = a.graded === true || (a.grade !== null && a.grade !== "");
      const keepManualSubmitted = existingAssignment?.manualSubmitted === true;

      const cleanedAssignment = {
        title: a.title,
        class: a.class,
        due: incomingDue,
        submitted: (a.submitted ?? false) || keepManualSubmitted,
        manualSubmitted: keepManualSubmitted,
        graded: isGraded,
        grade: a.grade ?? null,
        gradedAt: isGraded ? (existingAssignment?.gradedAt || null) : null,
        canvasId: a.canvasId || null,
        pointsPossible: typeof a.pointsPossible === "number" ? a.pointsPossible : null,
        priorityDismissed: existingAssignment?.priorityDismissed ?? false,
        type: existingAssignment?.type || "Other"
      };

      if (existingIndex !== -1) {
        assignments[existingIndex] = {
          ...assignments[existingIndex],
          ...cleanedAssignment
        };
        updatedCount++;
      } else {
        assignments.push(cleanedAssignment);
        addedCount++;
      }
    });

    saveAssignments();
    renderAssignments();

    const visibleCount = getVisibleAssignments().length;
    const quarter = getActiveQuarter();
    const filterNote = quarterRange
      ? `Filtered to ${quarter.name} on server.`
      : "All quarters imported.";

    alert(
      `Canvas import complete.\n\n` +
      `Added: ${addedCount}\n` +
      `Updated: ${updatedCount}\n` +
      `Showing: ${visibleCount}\n\n` +
      filterNote
    );
  } catch (error) {
    console.error("Network/server error:", error);
    alert("Import failed: could not connect to backend.");
  }
}

// ---------- MANUAL ASSIGNMENTS ----------
function addAssignment() {
  const titleInput = document.getElementById("assignment-title");
  const classInput = document.getElementById("assignment-class");
  const dueInput = document.getElementById("assignment-due");
  const typeInput = document.getElementById("assignment-type");

  const title = titleInput.value.trim();
  const course = classInput.value.trim();
  const dueValue = dueInput.value;
  const type = ASSIGNMENT_TYPES.includes(typeInput?.value) ? typeInput.value : "Other";

  if (!title || !course || !dueValue) {
    alert("Fill out all assignment fields first.");
    return;
  }

  const due = new Date(`${dueValue}T00:00:00`).getTime();

  assignments.push({
    title,
    class: course,
    due,
    submitted: false,
    manualSubmitted: false,
    graded: false,
    grade: null,
    gradedAt: null,
    canvasId: null,
    priorityDismissed: false,
    pointsPossible: null,
    type
  });

  saveAssignments();
  renderAssignments();

  titleInput.value = "";
  classInput.value = "";
  dueInput.value = "";
}

// ---------- AUTH ----------
let authToken = localStorage.getItem("authToken") || null;
let authEmail = localStorage.getItem("authEmail") || null;
let authMode = "login";

function isLoggedIn() {
  return !!authToken;
}

function showAuthForm(mode) {
  authMode = mode;
  document.getElementById("tab-login").classList.toggle("active", mode === "login");
  document.getElementById("tab-register").classList.toggle("active", mode === "register");
  document.getElementById("auth-submit").textContent = mode === "login" ? "Login" : "Register";
  document.getElementById("auth-error").classList.add("hidden");
  document.getElementById("auth-error").textContent = "";
}

function showLoggedIn(email) {
  document.getElementById("auth-logged-out").classList.add("hidden");
  document.getElementById("auth-logged-in").classList.remove("hidden");
  document.getElementById("auth-user-email").textContent = email;
  const btn = document.getElementById("login-nav-btn");
  if (btn) btn.textContent = "Account";
}

function showLoggedOut() {
  document.getElementById("auth-logged-out").classList.remove("hidden");
  document.getElementById("auth-logged-in").classList.add("hidden");
  const btn = document.getElementById("login-nav-btn");
  if (btn) btn.textContent = "Login";
}

async function submitAuth() {
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  const errorEl = document.getElementById("auth-error");

  errorEl.classList.add("hidden");
  errorEl.textContent = "";

  if (!email || !password) {
    errorEl.textContent = "Enter your email and password.";
    errorEl.classList.remove("hidden");
    return;
  }

  const endpoint = authMode === "login" ? "/login" : "/register";

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || "Something went wrong.";
      errorEl.classList.remove("hidden");
      return;
    }

    authToken = data.token;
    authEmail = data.email;
    localStorage.setItem("authToken", authToken);
    localStorage.setItem("authEmail", authEmail);

    showLoggedIn(authEmail);
    await Promise.all([loadTasksFromServer(), loadAssignmentsFromServer()]);
    renderTasks();
    renderAssignments();
  } catch {
    errorEl.textContent = "Could not connect to server.";
    errorEl.classList.remove("hidden");
  }
}

function logout() {
  authToken = null;
  authEmail = null;
  localStorage.removeItem("authToken");
  localStorage.removeItem("authEmail");
  tasks = [];
  showLoggedOut();
  loadTasksFromStorage();
  loadAssignments();
  renderTasks();
  renderAssignments();
}

async function checkAuthState() {
  if (!authToken) {
    showLoggedOut();
    loadTasksFromStorage();
    renderTasks();
    return;
  }

  try {
    const res = await fetch("/me", {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    if (res.ok) {
      const data = await res.json();
      showLoggedIn(data.email);
      await Promise.all([loadTasksFromServer(), loadAssignmentsFromServer()]);
      renderAssignments();
    } else {
      logout();
    }
  } catch {
    showLoggedOut();
    loadTasksFromStorage();
  }

  renderTasks();
}

async function loadTasksFromServer() {
  try {
    const res = await fetch("/tasks", {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (res.ok) {
      tasks = await res.json();
    }
  } catch {
    loadTasksFromStorage();
  }
}

function loadTasksFromStorage() {
  const saved = localStorage.getItem("tasks");
  if (!saved) { tasks = []; return; }
  try {
    tasks = JSON.parse(saved);
  } catch {
    tasks = [];
  }
}

// ---------- TASKS ----------
async function addTask() {
  const input = document.getElementById("task-input");
  const text = input.value.trim();
  if (!text) return;

  if (isLoggedIn()) {
    try {
      const res = await fetch("/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ text })
      });
      if (res.ok) {
        const task = await res.json();
        tasks.push(task);
        renderTasks();
      }
    } catch {
      alert("Could not save task — check your connection.");
    }
  } else {
    tasks.push({ text, completed: false });
    saveTasks();
    renderTasks();
  }

  input.value = "";
}

function renderTasks() {
  const list = document.getElementById("task-list");
  list.innerHTML = "";

  tasks.forEach((task, index) => {
    const li = document.createElement("li");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.completed;
    checkbox.onchange = async () => {
      tasks[index].completed = checkbox.checked;
      if (isLoggedIn()) {
        await fetch(`/tasks/${task.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${authToken}`
          },
          body: JSON.stringify({ completed: checkbox.checked })
        });
      } else {
        saveTasks();
      }
    };

    const textSpan = document.createElement("span");
    textSpan.textContent = " " + task.text;

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.onclick = async () => {
      if (isLoggedIn()) {
        await fetch(`/tasks/${task.id}`, {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${authToken}` }
        });
      }
      tasks.splice(index, 1);
      if (!isLoggedIn()) saveTasks();
      renderTasks();
    };

    li.appendChild(checkbox);
    li.appendChild(textSpan);
    li.appendChild(deleteBtn);
    list.appendChild(li);
  });
}

// ---------- THEME ----------
function getEffectiveTheme() {
  const saved = localStorage.getItem("theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function setTheme(theme) {
  localStorage.setItem("theme", theme);
  document.documentElement.setAttribute("data-theme", theme);
  renderThemeToggleButton();
}

function toggleTheme() {
  setTheme(getEffectiveTheme() === "dark" ? "light" : "dark");
}

function renderThemeToggleButton() {
  const btn = document.getElementById("theme-toggle-btn");
  if (!btn) return;
  btn.textContent = getEffectiveTheme() === "dark" ? "☀️" : "🌙";
}

// ---------- NOTIFICATIONS (shared helper) ----------
function notifyStudent(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "/icons/icon-192.png" });
  } catch {}
}

// ---------- SHARE WITH A PARENT ----------
async function generateShareLink() {
  if (!isLoggedIn()) {
    alert("Log in first — the share link is tied to your account's saved data.");
    return;
  }

  try {
    const res = await fetch("/share/token", {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create link");
    showShareLink(data.token);
  } catch {
    alert("Could not create a share link right now. Try again later.");
  }
}

function showShareLink(token) {
  const row = document.getElementById("share-link-row");
  const input = document.getElementById("share-link-input");
  if (!row || !input) return;

  input.value = `${location.origin}/shared.html?token=${token}`;
  row.classList.remove("hidden");
}

async function copyShareLink() {
  const input = document.getElementById("share-link-input");
  if (!input || !input.value) return;

  try {
    await navigator.clipboard.writeText(input.value);
    alert("Link copied.");
  } catch {
    input.select();
    alert("Couldn't auto-copy — the link is selected, press Ctrl+C (or Cmd+C) to copy it.");
  }
}

async function revokeShareLink() {
  if (!isLoggedIn()) return;

  const confirmed = confirm("This breaks the link for anyone you already shared it with. Continue?");
  if (!confirmed) return;

  try {
    await fetch("/share/revoke", {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` }
    });
    document.getElementById("share-link-row")?.classList.add("hidden");
    alert("Share link revoked.");
  } catch {
    alert("Could not revoke the link right now. Try again later.");
  }
}

// ---------- DUE-DATE NOTIFICATIONS ----------
// Foreground-only: these fire while the app is open in a tab. True background
// notifications (app closed) need a server-side push system — see project notes.
function isNotificationsEnabled() {
  return localStorage.getItem("dueDateNotificationsEnabled") === "true";
}

async function enableDueDateNotifications() {
  if (!("Notification" in window)) {
    alert("Your browser doesn't support notifications.");
    return;
  }

  const permission = await Notification.requestPermission();

  if (permission === "granted") {
    localStorage.setItem("dueDateNotificationsEnabled", "true");
    renderNotificationSettingUI();
    checkDueDateNotifications();
  } else {
    alert("Notifications weren't allowed. You can turn them on later in your browser's site settings.");
  }
}

function disableDueDateNotifications() {
  localStorage.setItem("dueDateNotificationsEnabled", "false");
  renderNotificationSettingUI();
}

function renderNotificationSettingUI() {
  const btn = document.getElementById("notif-toggle-btn");
  const status = document.getElementById("notif-status");
  if (!btn || !status) return;

  const enabled = isNotificationsEnabled() && "Notification" in window && Notification.permission === "granted";
  status.textContent = enabled ? "On" : "Off";
  btn.textContent = enabled ? "Turn Off" : "Turn On";
  btn.onclick = enabled ? disableDueDateNotifications : enableDueDateNotifications;
}

function getNotifiedRecord() {
  try {
    const saved = JSON.parse(localStorage.getItem("notifiedAssignments") || "null");
    if (saved && saved.date === getTodayDateKey()) return saved;
  } catch {}
  return { date: getTodayDateKey(), ids: [] };
}

function markNotified(id) {
  const record = getNotifiedRecord();
  if (!record.ids.includes(id)) record.ids.push(id);
  localStorage.setItem("notifiedAssignments", JSON.stringify(record));
}

function checkDueDateNotifications() {
  if (!isNotificationsEnabled() || !("Notification" in window) || Notification.permission !== "granted") return;

  const record = getNotifiedRecord();

  assignments.forEach(a => {
    const status = getAssignmentStatus(a);
    const dueText = getDueText(a);
    const id = a.canvasId || `${a.title}|${a.class}|${a.due}`;

    if (record.ids.includes(id)) return;

    if (status === "late") {
      notifyStudent("Assignment went late", `${a.title} (${a.class}) is now late.`);
      markNotified(id);
    } else if (dueText === "Today") {
      notifyStudent("Due today", `${a.title} (${a.class}) is due today.`);
      markNotified(id);
    }
  });
}

// ---------- CALENDAR EXPORT (.ics) ----------
function icsTimestamp() {
  const now = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
}

function icsEscape(text) {
  return String(text).replace(/[\\,;]/g, match => `\\${match}`).replace(/\n/g, "\\n");
}

function generateIcsContent() {
  const pad = n => String(n).padStart(2, "0");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Canvas Companion//EN", "CALSCALE:GREGORIAN"];

  assignments.forEach(a => {
    if (a.due === null || a.due === undefined || Number.isNaN(a.due)) return;

    const dueDate = new Date(a.due);
    const dateStr = `${dueDate.getFullYear()}${pad(dueDate.getMonth() + 1)}${pad(dueDate.getDate())}`;
    const uid = `${(a.canvasId || `${a.title}-${a.class}-${a.due}`).replace(/[^a-zA-Z0-9]/g, "")}@canvas-companion`;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${icsTimestamp()}`);
    lines.push(`DTSTART;VALUE=DATE:${dateStr}`);
    lines.push(`SUMMARY:${icsEscape(a.title)} (${icsEscape(a.class)})`);
    lines.push(`DESCRIPTION:${icsEscape(a.type || "Other")} for ${icsEscape(a.class)}`);
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function exportCalendar() {
  const withDueDates = assignments.filter(a => a.due !== null && a.due !== undefined && !Number.isNaN(a.due));

  if (withDueDates.length === 0) {
    alert("No assignments with due dates to export yet.");
    return;
  }

  const blob = new Blob([generateIcsContent()], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "canvas-companion-assignments.ics";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------- STUDY TIMER ----------
const TIMER_FOCUS_MINUTES = 25;
const TIMER_BREAK_MINUTES = 5;

let timerMode = "focus";
let timerRemainingSeconds = TIMER_FOCUS_MINUTES * 60;
let timerIntervalId = null;

function getTodayDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function getTimerSessionCount() {
  try {
    const saved = JSON.parse(localStorage.getItem("studyTimerSessions") || "null");
    if (saved && saved.date === getTodayDateKey()) return saved.count;
  } catch {}
  return 0;
}

function incrementTimerSessionCount() {
  const count = getTimerSessionCount() + 1;
  localStorage.setItem("studyTimerSessions", JSON.stringify({ date: getTodayDateKey(), count }));
  renderTimerSessionCount();
}

function renderTimerSessionCount() {
  const el = document.getElementById("timer-session-count");
  if (el) el.textContent = getTimerSessionCount();
}

function playTimerSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.3);
  } catch {}
}

function renderTimerDisplay() {
  const timeEl = document.getElementById("timer-time");
  const modeEl = document.getElementById("timer-mode-label");
  if (!timeEl || !modeEl) return;

  const minutes = Math.floor(timerRemainingSeconds / 60);
  const seconds = timerRemainingSeconds % 60;
  timeEl.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  modeEl.textContent = timerMode === "focus" ? "Focus" : "Break";
  modeEl.classList.toggle("timer-mode-focus", timerMode === "focus");
  modeEl.classList.toggle("timer-mode-break", timerMode === "break");
}

function timerTick() {
  timerRemainingSeconds--;

  if (timerRemainingSeconds <= 0) {
    playTimerSound();
    notifyStudent(
      timerMode === "focus" ? "Focus session done!" : "Break's over",
      timerMode === "focus" ? "Take a 5 minute break." : "Back to it — 25 more minutes."
    );

    if (timerMode === "focus") incrementTimerSessionCount();

    timerMode = timerMode === "focus" ? "break" : "focus";
    timerRemainingSeconds = (timerMode === "focus" ? TIMER_FOCUS_MINUTES : TIMER_BREAK_MINUTES) * 60;
  }

  renderTimerDisplay();
}

function startTimer() {
  if (timerIntervalId) return;
  timerIntervalId = setInterval(timerTick, 1000);
}

function pauseTimer() {
  if (timerIntervalId) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
}

function resetTimer() {
  pauseTimer();
  timerMode = "focus";
  timerRemainingSeconds = TIMER_FOCUS_MINUTES * 60;
  renderTimerDisplay();
}

function initStudyTimer() {
  renderTimerDisplay();
  renderTimerSessionCount();
}

// ---------- RESET ----------
function resetData() {
  const confirmed = confirm("This will delete all assignments and tasks saved in this browser. Continue?");
  if (!confirmed) return;

  localStorage.removeItem("assignments");
  localStorage.removeItem("tasks");
  localStorage.removeItem("activeQuarterKey");

  assignments = [];
  tasks = [];
  activeQuarterKey = appSettings.defaultQuarter;

  renderAssignments();
  renderTasks();
  syncQuarterDropdown();

  alert("Dashboard reset complete.");
}

// ---------- CLICK OUTSIDE SETTINGS ----------
document.addEventListener("click", (event) => {
  document.querySelectorAll(".settings-dropdown-wrapper").forEach(wrapper => {
    const panel = wrapper.querySelector(".settings-dropdown");
    if (panel && !wrapper.contains(event.target)) {
      panel.classList.add("hidden");
    }
  });
});

// ---------- INIT ----------
async function initApp() {
  renderThemeToggleButton();
  loadAssignments();
  fillSettingsForm();
  syncQuarterDropdown();
  renderAssignments();
  initStudyTimer();
  renderNotificationSettingUI();
  checkDueDateNotifications();
  setInterval(checkDueDateNotifications, 20 * 60 * 1000);
  await checkAuthState();
  console.log(`Canvas Companion initialized for ${getActiveQuarter().name}`);
}

initApp();

