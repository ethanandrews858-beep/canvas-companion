console.log("Canvas Companion script loaded");

let assignments = [];
let tasks = [];

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
        pointsPossible: typeof a.pointsPossible === "number" ? a.pointsPossible : null
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

  // BUTTON RULES:
  // Late/Needs Attention section: Mark Submitted + Delete + AI Help
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

  const searchText = searchInput ? searchInput.value.toLowerCase().trim() : "";
  const filter = filterSelect ? filterSelect.value : "all";

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
        priorityDismissed: existingAssignment?.priorityDismissed ?? false
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

  const title = titleInput.value.trim();
  const course = classInput.value.trim();
  const dueValue = dueInput.value;

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
    pointsPossible: null
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

// ---------- AI HELP ----------
async function openAiHelp(assignment) {
  const modal = document.getElementById("ai-modal");
  const loading = document.getElementById("ai-loading");
  const advice = document.getElementById("ai-advice");
  const error = document.getElementById("ai-error");
  const assignmentLabel = document.getElementById("ai-modal-assignment");

  assignmentLabel.textContent = `${assignment.title} — ${assignment.class}`;
  loading.classList.remove("hidden");
  advice.classList.add("hidden");
  error.classList.add("hidden");
  advice.textContent = "";
  error.textContent = "";
  modal.classList.remove("hidden");

  try {
    const res = await fetch("/ai/help", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(isLoggedIn() ? { Authorization: `Bearer ${authToken}` } : {})
      },
      body: JSON.stringify({ assignment })
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Request failed");

    loading.classList.add("hidden");
    advice.textContent = data.advice;
    advice.classList.remove("hidden");
  } catch (err) {
    loading.classList.add("hidden");
    error.textContent = err.message === "AI features not configured"
      ? "AI features require an ANTHROPIC_API_KEY in Railway settings."
      : "Could not get AI help right now. Try again later.";
    error.classList.remove("hidden");
  }
}

function closeAiModal(event) {
  if (event && event.target !== document.getElementById("ai-modal")) return;
  document.getElementById("ai-modal").classList.add("hidden");
}

// ---------- INIT ----------
async function initApp() {
  loadAssignments();
  fillSettingsForm();
  syncQuarterDropdown();
  renderAssignments();
  await checkAuthState();
  console.log(`Canvas Companion initialized for ${getActiveQuarter().name}`);
}

initApp();

