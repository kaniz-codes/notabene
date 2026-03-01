let courses = [];
let APP_DATA = {};

/* Storage */
const LS_THEME = "notabene_theme_v5";
const LS_COURSE_FAVS = "notabene_course_favs_v7";
const LS_LINK_DONE = "notabene_link_done_v1";
const LS_TOPICS = "notabene_topics_v4";

/* State */
const state = {
  selectedCourseId: null,
  currentTab: "overview",
  search: "",
  sem: "all",
  type: "all",
  favOnly: false,
  theme: "dark",
  courseFavs: new Set(JSON.parse(localStorage.getItem(LS_COURSE_FAVS) || "[]")),
  linkDone: new Set(JSON.parse(localStorage.getItem(LS_LINK_DONE) || "[]")),
  topicsByCourse: JSON.parse(localStorage.getItem(LS_TOPICS) || "{}")
};

/* DOM */
const elThemeToggle = document.getElementById("themeToggle");

const elCourseList = document.getElementById("courseList");
const elEmptyCourses = document.getElementById("emptyCourses");

const elCourseSearch = document.getElementById("courseSearch");
const elSemFilter = document.getElementById("semFilter");
const elTypeFilter = document.getElementById("typeFilter");
const elFavOnlyBtn = document.getElementById("favOnlyBtn");

const elStatTotal = document.getElementById("statTotal");
const elStatVisible = document.getElementById("statVisible");
const elStatFavs = document.getElementById("statFavs");

const elBadgeSem = document.getElementById("badgeSem");
const elBadgeType = document.getElementById("badgeType");
const elBadgeCode = document.getElementById("badgeCode");
const elCourseTitle = document.getElementById("courseTitle");
const elCourseMeta = document.getElementById("courseMeta");

const elCourseFavBtn = document.getElementById("courseFavBtn");
const elCopyLinkBtn = document.getElementById("copyLinkBtn");

const tabs = Array.from(document.querySelectorAll(".tab"));
const elTabPanel = document.getElementById("tabPanel");

/* Topics */
const elTopicAddForm = document.getElementById("topicAddForm");
const elTopicInput = document.getElementById("topicInput");
const elTopicsList = document.getElementById("topicsList");
const elTopicsEmpty = document.getElementById("topicsEmpty");
const elTopicsProgress = document.getElementById("topicsProgress");

/* Persist */
function saveAll(){
  localStorage.setItem(LS_THEME, state.theme);
  localStorage.setItem(LS_COURSE_FAVS, JSON.stringify([...state.courseFavs]));
  localStorage.setItem(LS_LINK_DONE, JSON.stringify([...state.linkDone]));
  localStorage.setItem(LS_TOPICS, JSON.stringify(state.topicsByCourse));
}

/* Utils */
function norm(s){ return String(s || "").toLowerCase().trim(); }

function escapeHTML(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function typeLabel(t){
  const m = { theory: "Theory", lab: "Lab", practice: "Practice" };
  return m[t] || "—";
}

function getCourseById(id){ return courses.find(c => c.id === id) || null; }

function buildLinkKey(courseId, category, linkId){
  return `${courseId}::${category}::${linkId}`;
}

function linkTextFor(category){
  return category === "repos" ? "Link to repository" : "Link";
}

/* YouTube embed */
function getYouTubeEmbed(url){
  if (!url) return null;

  try{
    const u = new URL(url);
    const host = u.hostname.replace("www.", "").toLowerCase();

    if (host === "youtube.com" || host === "m.youtube.com") {
      const list = u.searchParams.get("list");
      const v = u.searchParams.get("v");

      if (u.pathname === "/playlist" && list) {
        return { type: "playlist", embed: `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(list)}` };
      }

      if (u.pathname === "/watch" && v) {
        if (list) return { type: "video", embed: `https://www.youtube.com/embed/${encodeURIComponent(v)}?list=${encodeURIComponent(list)}` };
        return { type: "video", embed: `https://www.youtube.com/embed/${encodeURIComponent(v)}` };
      }

      if (u.pathname.startsWith("/embed/")) {
        return { type: "video", embed: url };
      }
    }

    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id) return { type: "video", embed: `https://www.youtube.com/embed/${encodeURIComponent(id)}` };
    }
  } catch {
    return null;
  }

  return null;
}

/* Drive thumbnail */
function getDriveFileId(url){
  if (!url) return null;

  try{
    const u = new URL(url);
    const host = u.hostname.replace("www.", "").toLowerCase();
    if (host !== "drive.google.com") return null;

    const m = u.pathname.match(/\/file\/d\/([^/]+)/);
    if (m && m[1]) return m[1];

    const id = u.searchParams.get("id");
    if (id) return id;
  } catch {
    return null;
  }

  return null;
}

function getDriveImagePreview(url){
  const id = getDriveFileId(url);
  if (!id) return null;

  return {
    type: "image",
    src: `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1200`
  };
}

/* Load data */
async function loadData(){
  const res = await fetch("./data.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load data.json (${res.status})`);

  APP_DATA = await res.json();
  courses = APP_DATA.courses || [];

  const eyebrowEl = document.querySelector(".eyebrow");
  const brandTitleEl = document.querySelector(".brandTitle");
  if (eyebrowEl && APP_DATA.appName) eyebrowEl.textContent = String(APP_DATA.appName).toUpperCase();
  if (brandTitleEl && APP_DATA.tagline) brandTitleEl.textContent = String(APP_DATA.tagline);
  if (APP_DATA.appName && APP_DATA.tagline) document.title = `${APP_DATA.appName} — ${APP_DATA.tagline}`;
}

/* Theme */
function applyTheme(theme){
  state.theme = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", state.theme);

  const isLight = state.theme === "light";
  elThemeToggle.textContent = isLight ? "☀" : "☾";
  elThemeToggle.setAttribute("aria-pressed", String(isLight));
  saveAll();
}

/* Filters */
function courseMatchesFilters(course){
  if (state.sem !== "all" && String(course.semester) !== String(state.sem)) return false;
  if (state.type !== "all" && course.type !== state.type) return false;

  if (state.search){
    const hay = norm([
      course.code,
      course.title,
      course.instructor,
      course.description,
      (course.topics||[]).join(" ")
    ].join(" "));
    if (!hay.includes(state.search)) return false;
  }

  if (state.favOnly && !state.courseFavs.has(course.id)) return false;
  return true;
}

/* Sidebar */
function renderSidebar(){
  const visible = courses.filter(courseMatchesFilters);

  elStatTotal.textContent = String(courses.length);
  elStatVisible.textContent = String(visible.length);
  elStatFavs.textContent = String(state.courseFavs.size);

  elCourseList.innerHTML = "";
  elEmptyCourses.hidden = visible.length !== 0;

  for (const c of visible){
    const item = document.createElement("div");
    item.className = "courseItem" + (c.id === state.selectedCourseId ? " active" : "");
    item.tabIndex = 0;
    item.setAttribute("role", "button");

    const dot = document.createElement("div");
    dot.className = "courseDot";
    dot.style.background = `var(--${c.type || "theory"})`;

    const text = document.createElement("div");
    text.className = "courseText";
    text.innerHTML = `
      <div class="courseLine1">
        <span class="courseCode">${escapeHTML(c.code)}</span>
        <span class="courseMini">Sem ${escapeHTML(c.semester)}</span>
        <span class="courseMini">${escapeHTML(typeLabel(c.type))}</span>
      </div>
      <div class="courseName">${escapeHTML(c.title)}</div>
    `;

    const star = document.createElement("button");
    const isFav = state.courseFavs.has(c.id);
    star.className = "courseStar" + (isFav ? " active" : "");
    star.type = "button";
    star.title = "Favorite course";
    star.textContent = "★";
    star.setAttribute("aria-pressed", String(isFav));
    star.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleCourseFav(c.id);
    });

    item.addEventListener("click", () => selectCourse(c.id));
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectCourse(c.id);
      }
    });

    item.append(dot, text, star);
    elCourseList.appendChild(item);
  }
}

/* Course favorite */
function toggleCourseFav(courseId){
  if (state.courseFavs.has(courseId)) state.courseFavs.delete(courseId);
  else state.courseFavs.add(courseId);

  saveAll();
  renderSidebar();
  renderMain();
}

/* Link done */
function toggleLinkDone(key){
  if (state.linkDone.has(key)) state.linkDone.delete(key);
  else state.linkDone.add(key);

  saveAll();
  renderMain();
}

/* Routing */
function selectCourse(courseId){
  state.selectedCourseId = courseId;
  history.replaceState(null, "", `#${encodeURIComponent(courseId)}`);

  ensureTopicsInitialized(courseId);
  renderSidebar();
  renderMain();
}

function initFromHash(){
  const id = decodeURIComponent((location.hash || "").replace("#",""));
  if (id && getCourseById(id)) return id;
  return courses[0]?.id || null;
}

/* Tabs */
function setTab(tabKey){
  state.currentTab = tabKey;

  tabs.forEach(t => {
    const active = t.dataset.tab === tabKey;
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", String(active));
  });

  renderMain();
}

/* Topics */
function ensureTopicsInitialized(courseId){
  if (!courseId) return;
  if (state.topicsByCourse[courseId]) return;

  const course = getCourseById(courseId);
  const base = (course?.topics || []).map((txt, i) => ({
    id: `t_${courseId}_${i}`,
    text: txt,
    done: false
  }));

  state.topicsByCourse[courseId] = base;
  saveAll();
}

function getTopics(courseId){ return state.topicsByCourse[courseId] || []; }
function setTopics(courseId, topics){ state.topicsByCourse[courseId] = topics; saveAll(); }

function addTopic(courseId, text){
  const t = text.trim();
  if (!t) return;

  const topics = getTopics(courseId);
  topics.push({ id: `t_${Date.now()}`, text: t, done: false });
  setTopics(courseId, topics);
}

function deleteTopic(courseId, topicId){
  setTopics(courseId, getTopics(courseId).filter(t => t.id !== topicId));
}

function toggleTopicDone(courseId, topicId, done){
  setTopics(
    courseId,
    getTopics(courseId).map(t => t.id === topicId ? { ...t, done: !!done } : t)
  );
}

function moveTopic(courseId, fromIndex, toIndex){
  const topics = [...getTopics(courseId)];
  if (fromIndex < 0 || fromIndex >= topics.length) return;
  if (toIndex < 0 || toIndex >= topics.length) return;

  const [item] = topics.splice(fromIndex, 1);
  topics.splice(toIndex, 0, item);
  setTopics(courseId, topics);
}

let dragFromId = null;

function renderTopics(){
  const courseId = state.selectedCourseId;

  if (!courseId){
    elTopicsList.innerHTML = "";
    elTopicsEmpty.hidden = false;
    elTopicsProgress.textContent = "";
    return;
  }

  const topics = getTopics(courseId);
  elTopicsList.innerHTML = "";
  elTopicsEmpty.hidden = topics.length !== 0;

  const doneCount = topics.filter(t => t.done).length;
  elTopicsProgress.textContent = topics.length
    ? `Progress: ${doneCount}/${topics.length} completed`
    : `Progress: 0/0 completed`;

  topics.forEach((t, idx) => {
    const row = document.createElement("div");
    row.className = "topicItem";

    row.innerHTML = `
      <div class="dragHandle" draggable="true" title="Drag to reorder">≡</div>
      <input class="topicCheck" type="checkbox" ${t.done ? "checked" : ""} aria-label="Mark topic done" />
      <div class="topicText ${t.done ? "done" : ""}">${escapeHTML(t.text)}</div>
      <div class="topicActions">
        <button class="miniBtn" type="button" title="Move up">↑</button>
        <button class="miniBtn" type="button" title="Move down">↓</button>
        <button class="dangerBtn" type="button" title="Delete topic">🗑</button>
      </div>
    `;

    const handle = row.querySelector(".dragHandle");
    const checkbox = row.querySelector(".topicCheck");
    const btnUp = row.querySelectorAll(".miniBtn")[0];
    const btnDown = row.querySelectorAll(".miniBtn")[1];
    const btnDel = row.querySelector(".dangerBtn");

    handle.addEventListener("dragstart", (e) => {
      dragFromId = t.id;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", t.id);
    });

    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });

    row.addEventListener("drop", (e) => {
      e.preventDefault();
      const fromId = e.dataTransfer.getData("text/plain") || dragFromId;

      const list = getTopics(courseId);
      const fromIndex = list.findIndex(x => x.id === fromId);
      const toIndex = idx;

      if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex){
        moveTopic(courseId, fromIndex, toIndex);
        renderTopics();
      }

      dragFromId = null;
    });

    checkbox.addEventListener("change", () => {
      toggleTopicDone(courseId, t.id, checkbox.checked);
      renderTopics();
    });

    btnDel.addEventListener("click", () => { deleteTopic(courseId, t.id); renderTopics(); });
    btnUp.addEventListener("click", () => { moveTopic(courseId, idx, idx - 1); renderTopics(); });
    btnDown.addEventListener("click", () => { moveTopic(courseId, idx, idx + 1); renderTopics(); });

    elTopicsList.appendChild(row);
  });
}

/* Main */
function renderMain(){
  const course = getCourseById(state.selectedCourseId);

  if (!course){
    elBadgeSem.textContent = "Sem —";
    elBadgeType.textContent = "—";
    elBadgeCode.textContent = "—";
    elCourseTitle.textContent = "Select a course";
    elCourseMeta.textContent = "Instructor: —";
    elTabPanel.innerHTML = `<div class="empty">Pick a course from the left.</div>`;
    renderTopics();
    return;
  }

  elBadgeSem.textContent = `Sem ${course.semester}`;
  elBadgeType.textContent = typeLabel(course.type);
  elBadgeType.style.color = `var(--${course.type || "theory"})`;
  elBadgeCode.textContent = course.code;

  elCourseTitle.textContent = course.title;
  elCourseMeta.textContent = `Instructor: ${course.instructor || "—"}`;

  const courseFav = state.courseFavs.has(course.id);
  elCourseFavBtn.setAttribute("aria-pressed", String(courseFav));

  renderTopics();

  const res = course.resources || {};
  elTabPanel.innerHTML = "";

  if (state.currentTab === "overview") elTabPanel.appendChild(renderOverview(course, res));
  else if (state.currentTab === "favorites") elTabPanel.appendChild(renderDoneTab(course, res));
  else elTabPanel.appendChild(renderResourceTab(course, res, state.currentTab));
}

/* Overview */
function renderOverview(course, res){
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="empty small" style="margin-bottom:12px;">
      ${escapeHTML(course.description || "")}
    </div>
    <div class="linkGrid">
      ${renderSection(course, res, "notes", "📝 Notes")}
      ${renderSection(course, res, "ct", "⁇ CT Questions")}
      ${renderSection(course, res, "videos", "▶ Videos")}
    </div>
  `;
  wireDoneButtons(wrap);
  wirePreviewButtons(wrap);
  return wrap;
}

function renderSection(course, res, category, title){
  const list = (res[category] || []);
  const cards = list.length
    ? list.map(it => renderLinkCardHTML(course, category, it)).join("")
    : `<div class="empty small">No links yet.</div>`;

  return `
    <div class="linkCard" style="display:block;">
      <div class="sectionHead" style="margin:0 0 8px;">
        <h2>${escapeHTML(title)}</h2>
      </div>
      <div class="linkGrid">${cards}</div>
    </div>
  `;
}

/* Tabs */
function renderResourceTab(course, res, category){
  const nice = { notes: "Notes", ct: "CT Questions", videos: "Videos", repos: "Repos" }[category] || "Links";
  const items = res[category] || [];

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="sectionHead">
      <h2>${escapeHTML(nice)}</h2>
    </div>

    <div class="linkGrid">
      ${items.map(it => renderLinkCardHTML(course, category, it)).join("")}
    </div>

    <div class="empty small" ${items.length ? "hidden" : ""}>
      No links yet.
    </div>
  `;
  wireDoneButtons(wrap);
  wirePreviewButtons(wrap);
  return wrap;
}

/* Done tab */
function renderDoneTab(course, res){
  const cats = ["notes","ct","videos","repos"];
  const doneItems = [];

  for (const cat of cats){
    for (const it of (res[cat] || [])){
      const key = buildLinkKey(course.id, cat, it.id);
      if (state.linkDone.has(key)) doneItems.push({ cat, it });
    }
  }

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="sectionHead">
      <h2>Done links</h2>
    </div>

    <div class="linkGrid">
      ${doneItems.map(row => renderLinkCardHTML(course, row.cat, row.it)).join("")}
    </div>

    <div class="empty small" ${doneItems.length ? "hidden" : ""}>
      No done links yet.
    </div>
  `;
  wireDoneButtons(wrap);
  wirePreviewButtons(wrap);
  return wrap;
}

/* Link card */
function renderLinkCardHTML(course, category, it){
  const key = buildLinkKey(course.id, category, it.id);
  const isDone = state.linkDone.has(key);

  const linkText = linkTextFor(category);

  const yt = getYouTubeEmbed(it.url);
  const driveImg = getDriveImagePreview(it.url);

  const preview = yt
    ? { kind: "youtube", embed: yt.embed }
    : (driveImg ? { kind: "drive-image", src: driveImg.src } : null);

  return `
    <div class="linkCard ${isDone ? "isDone" : ""}">
      <div class="linkLeft">
        <div class="linkTitle">${escapeHTML(it.label || "Link")}</div>
        <div class="linkMeta">
          <span class="courseMini">${escapeHTML(category.toUpperCase())}</span>
          ${it.by ? `<span>By: <strong>${escapeHTML(it.by)}</strong></span>` : ""}
        </div>

        <a class="linkAction" href="${escapeHTML(it.url)}" target="_blank" rel="noopener noreferrer">
          ${escapeHTML(linkText)}
        </a>

        ${
          preview
            ? `
              <div class="previewRow">
                <button class="previewToggle" type="button" data-preview-btn="${escapeHTML(key)}">Preview</button>
              </div>

              <div class="previewWrap" data-preview-wrap="${escapeHTML(key)}" hidden>
                ${
                  preview.kind === "youtube"
                    ? `
                      <iframe
                        class="previewFrame"
                        src="${escapeHTML(preview.embed)}"
                        loading="lazy"
                        title="YouTube preview"
                        frameborder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowfullscreen></iframe>
                    `
                    : `
                      <img
                        class="previewImg"
                        src="${escapeHTML(preview.src)}"
                        loading="lazy"
                        alt="Drive image preview"
                      />
                    `
                }
              </div>
            `
            : ``
        }
      </div>

      <div class="linkRight">
        <button
          class="doneBtn ${isDone ? "active" : ""}"
          type="button"
          aria-pressed="${isDone}"
          title="${isDone ? "Mark as not done" : "Mark as done"}"
          data-done="${escapeHTML(key)}">
          ${isDone ? "✓ Done" : "Done"}
        </button>
      </div>
    </div>
  `;
}

/* Wire buttons */
function wireDoneButtons(root){
  root.querySelectorAll("[data-done]").forEach(btn => {
    btn.addEventListener("click", () => toggleLinkDone(btn.getAttribute("data-done")));
  });
}

function wirePreviewButtons(root){
  root.querySelectorAll("[data-preview-btn]").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-preview-btn");
      const wrap = root.querySelector(`[data-preview-wrap="${CSS.escape(key)}"]`);
      if (!wrap) return;

      const willOpen = wrap.hidden;
      wrap.hidden = !willOpen;

      btn.classList.toggle("active", willOpen);
      btn.textContent = willOpen ? "Hide preview" : "Preview";
    });
  });
}

/* Copy link */
async function copyCourseLink(){
  if (!state.selectedCourseId) return;
  const url = `${location.origin}${location.pathname}#${encodeURIComponent(state.selectedCourseId)}`;

  try{
    await navigator.clipboard.writeText(url);
    elCopyLinkBtn.textContent = "Copied!";
    setTimeout(() => (elCopyLinkBtn.textContent = "Copy link"), 900);
  } catch {
    prompt("Copy this link:", url);
  }
}

/* Events */
elThemeToggle.addEventListener("click", () => applyTheme(state.theme === "dark" ? "light" : "dark"));

elCourseSearch.addEventListener("input", (e) => { state.search = norm(e.target.value); renderSidebar(); });
elSemFilter.addEventListener("change", (e) => { state.sem = e.target.value; renderSidebar(); });
elTypeFilter.addEventListener("change", (e) => { state.type = e.target.value; renderSidebar(); });

elFavOnlyBtn.addEventListener("click", () => {
  state.favOnly = !state.favOnly;
  elFavOnlyBtn.setAttribute("aria-pressed", String(state.favOnly));
  renderSidebar();
});

elCourseFavBtn.addEventListener("click", () => {
  if (!state.selectedCourseId) return;
  toggleCourseFav(state.selectedCourseId);
});

elCopyLinkBtn.addEventListener("click", copyCourseLink);

tabs.forEach(t => t.addEventListener("click", () => setTab(t.dataset.tab)));

elTopicAddForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!state.selectedCourseId) return;
  addTopic(state.selectedCourseId, elTopicInput.value);
  elTopicInput.value = "";
  renderTopics();
});

/* Init */
(async function init(){
  try{
    await loadData();
  } catch (err){
    console.error(err);
    courses = [];
  }

  const saved = localStorage.getItem(LS_THEME);
  if (saved === "light" || saved === "dark") applyTheme(saved);
  else {
    const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
    applyTheme(prefersLight ? "light" : "dark");
  }

  state.selectedCourseId = initFromHash();
  ensureTopicsInitialized(state.selectedCourseId);

  renderSidebar();
  renderMain();

  window.addEventListener("hashchange", () => {
    const id = decodeURIComponent((location.hash || "").replace("#",""));
    if (id && getCourseById(id)) {
      state.selectedCourseId = id;
      ensureTopicsInitialized(id);
      renderSidebar();
      renderMain();
    }
  });
})();