// Standalone read-only viewer for a parent/tutor share link.
// Deliberately does not import script.js — this page has no auth, no editing,
// and no access to the main app's localStorage, so it keeps its own small
// copy of just the pure calculation logic it needs.

function isZeroGrade(assignment) {
  if (!assignment.graded && (assignment.grade === null || assignment.grade === "")) return false;
  const raw = String(assignment.grade ?? "").trim().toLowerCase();
  if (raw === "0" || raw.startsWith("0/") || raw.startsWith("0 /")) return true;
  const numeric = Number(raw);
  return !Number.isNaN(numeric) && numeric === 0;
}

function getAssignmentStatus(assignment) {
  if (!assignment.manualSubmitted && isZeroGrade(assignment)) return "needs-attention";
  if (assignment.graded || (assignment.grade !== null && assignment.grade !== "")) return "graded";
  if (assignment.submitted || assignment.manualSubmitted) return "submitted";
  if (assignment.due === null || assignment.due === undefined || Number.isNaN(assignment.due)) return "upcoming";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(assignment.due);
  dueDate.setHours(0, 0, 0, 0);

  return dueDate.getTime() < today.getTime() ? "late" : "upcoming";
}

function formatDate(timestamp) {
  if (timestamp === null || timestamp === undefined || Number.isNaN(timestamp)) return "No due date";
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function getDueText(assignment) {
  if (assignment.due === null || assignment.due === undefined || Number.isNaN(assignment.due)) return "No due date";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(assignment.due);
  dueDate.setHours(0, 0, 0, 0);

  const days = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1) return `In ${days} days`;
  return formatDate(assignment.due);
}

function parseGradeToPoints(assignment) {
  const isActuallyGraded = assignment.graded || (assignment.grade !== null && assignment.grade !== "");
  if (!isActuallyGraded) return null;

  const raw = String(assignment.grade ?? "").trim();
  if (!raw) return null;

  const fractionMatch = raw.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (fractionMatch) return { earned: Number(fractionMatch[1]), possible: Number(fractionMatch[2]) };

  const numeric = Number(raw);
  if (Number.isNaN(numeric)) return null;

  if (typeof assignment.pointsPossible === "number" && assignment.pointsPossible > 0) {
    return { earned: numeric, possible: assignment.pointsPossible };
  }
  return { earned: numeric, possible: 100 };
}

function computeClassGrades(assignments) {
  const totals = {};

  assignments.forEach(a => {
    const points = parseGradeToPoints(a);
    if (!points || points.possible <= 0) return;
    if (!totals[a.class]) totals[a.class] = { earned: 0, possible: 0, count: 0 };
    totals[a.class].earned += points.earned;
    totals[a.class].possible += points.possible;
    totals[a.class].count += 1;
  });

  return Object.entries(totals)
    .map(([className, stats]) => ({ class: className, percent: (stats.earned / stats.possible) * 100, count: stats.count }))
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

function createReadOnlyCard(assignment) {
  const status = getAssignmentStatus(assignment);
  const card = document.createElement("div");
  card.className = "assignment-card";
  if (status === "late" || status === "needs-attention") card.classList.add("late-assignment");

  const gradeText = assignment.grade !== null && assignment.grade !== "" ? `<p>Grade: ${assignment.grade}</p>` : "";

  card.innerHTML = `
    <h3>${assignment.title}</h3>
    <p>Class: ${assignment.class}</p>
    <p>Due: ${getDueText(assignment)}</p>
    ${gradeText}
  `;

  const badge = document.createElement("span");
  badge.className = "status-badge";
  if (status === "needs-attention") { badge.textContent = "Needs Attention"; badge.classList.add("badge-late"); }
  else if (status === "late") { badge.textContent = "Late"; badge.classList.add("badge-late"); }
  else if (status === "graded") { badge.textContent = "Graded"; badge.classList.add("badge-submitted"); }
  else if (status === "submitted") { badge.textContent = "Submitted"; badge.classList.add("badge-submitted"); }
  else { badge.textContent = "Upcoming"; badge.classList.add("badge-upcoming"); }
  card.appendChild(badge);

  return card;
}

async function loadSharedView() {
  const statusEl = document.getElementById("shared-status");
  const token = new URLSearchParams(location.search).get("token");

  if (!token) {
    statusEl.textContent = "Missing share link token.";
    return;
  }

  try {
    const res = await fetch(`/shared/${encodeURIComponent(token)}`);
    const data = await res.json();

    if (!res.ok) {
      statusEl.textContent = data.error || "This share link is invalid or has been revoked.";
      return;
    }

    statusEl.classList.add("hidden");

    const gradesSection = document.getElementById("shared-grades");
    const gradesList = document.getElementById("shared-grades-list");
    const grades = computeClassGrades(data);

    gradesSection.classList.remove("hidden");
    if (grades.length === 0) {
      gradesList.innerHTML = `<p class="grades-empty">No graded assignments with a numeric score yet.</p>`;
    } else {
      gradesList.innerHTML = grades.map(g => {
        const percent = Math.max(0, Math.min(100, g.percent));
        const isFailing = g.percent < 60;
        return `
          <div class="grade-card">
            <div class="grade-card-header">
              <h3>${g.class}</h3>
              <span class="grade-letter${isFailing ? " grade-letter-critical" : ""}">${percentToLetter(g.percent)}</span>
            </div>
            <div class="grade-meter">
              <div class="grade-meter-fill${isFailing ? " critical" : ""}" style="width: ${percent}%"></div>
            </div>
            <p class="grade-meta">${g.percent.toFixed(1)}% · ${g.count} graded assignment${g.count === 1 ? "" : "s"}</p>
          </div>
        `;
      }).join("");
    }

    const buckets = { late: [], upcoming: [], graded: [] };
    data.forEach(a => {
      const status = getAssignmentStatus(a);
      if (status === "late" || status === "needs-attention") buckets.late.push(a);
      else if (status === "graded") buckets.graded.push(a);
      else buckets.upcoming.push(a);
    });

    const sections = [
      ["shared-late", "shared-late-list", buckets.late],
      ["shared-upcoming", "shared-upcoming-list", buckets.upcoming],
      ["shared-graded", "shared-graded-list", buckets.graded]
    ];

    sections.forEach(([sectionId, listId, items]) => {
      const section = document.getElementById(sectionId);
      const list = document.getElementById(listId);
      section.classList.remove("hidden");
      list.innerHTML = "";
      if (items.length === 0) {
        list.innerHTML = `<p class="overview-empty">Nothing here.</p>`;
        return;
      }
      items
        .sort((a, b) => (a.due ?? Number.MAX_SAFE_INTEGER) - (b.due ?? Number.MAX_SAFE_INTEGER))
        .forEach(a => list.appendChild(createReadOnlyCard(a)));
    });
  } catch {
    statusEl.textContent = "Could not load this shared view right now. Try again later.";
  }
}

loadSharedView();
