/* Job Recommendation System - unified API client */
(() => {
  "use strict";
  const API_BASE = window.API_BASE_URL || "http://localhost:5000/api";
  const $ = (id) => document.getElementById(id);
  const token = () => localStorage.getItem("authToken");
  const currentUser = () => {
    try { return JSON.parse(localStorage.getItem("studentData") || "null"); }
    catch { return null; }
  };
  const setUser = (user) => localStorage.setItem("studentData", JSON.stringify(user));
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);
  const skillsOf = (value) => {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) return parsed; } catch {}
    return String(value).split(",").map(s => s.trim()).filter(Boolean);
  };
  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData) && options.body !== undefined) headers["Content-Type"] = "application/json";
    if (token()) headers.Authorization = `Bearer ${token()}`;
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`);
    return data;
  }
  function requireLogin() {
    if (!token() || !currentUser()) {
      alert("Please log in first.");
      location.href = "login.html";
      return false;
    }
    return true;
  }
  function statusMessage(element, message, isError = false) {
    if (!element) return;
    element.textContent = message;
    element.style.color = isError ? "#b91c1c" : "#15803d";
  }

  // Shared navigation state
  const nav = document.querySelector(".main-nav");
  if (nav && currentUser()) {
    const logout = document.createElement("a");
    logout.href = "#";
    logout.textContent = "Logout";
    logout.addEventListener("click", e => {
      e.preventDefault();
      localStorage.removeItem("authToken");
      localStorage.removeItem("studentData");
      location.href = "index.html";
    });
    nav.appendChild(logout);
  }

  // Registration
  const registerForm = $("registerForm");
  if (registerForm) registerForm.addEventListener("submit", async e => {
    e.preventDefault();
    const button = registerForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const payload = {
        full_name: $("fullName").value.trim(),
        email: $("email").value.trim(),
        password: $("password").value,
        university: $("university").value.trim(),
        department: $("department").value,
        skills: $("skills").value.split(",").map(s => s.trim()).filter(Boolean).join(", ")
      };
      await api("/students", { method: "POST", body: JSON.stringify(payload) });
      alert("Account created. Please log in.");
      location.href = "login.html";
    } catch (err) { alert(err.message); }
    finally { button.disabled = false; }
  });

  // Login
  const loginForm = $("loginForm");
  if (loginForm) loginForm.addEventListener("submit", async e => {
    e.preventDefault();
    const button = loginForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const data = await api("/login", { method: "POST", body: JSON.stringify({
        email: $("loginEmail").value.trim(), password: $("loginPassword").value
      })});
      localStorage.setItem("authToken", data.token);
      setUser(data.student);
      location.href = data.student.role === "admin" ? "admin.html" : "profile.html";
    } catch (err) { statusMessage($("loginMessage"), err.message, true); }
    finally { button.disabled = false; }
  });

  // Profile display and update
  async function loadProfile() {
    if (!$("profileName")) return;
    if (!requireLogin()) return;
    try {
      const user = currentUser();
      const data = await api(`/students/${user.id}`);
      const s = data.student;
      setUser(s);
      $("profileName").textContent = s.full_name;
      $("profileEmail").textContent = s.email;
      $("profileUniversity").textContent = s.university || "Not provided";
      $("profileDepartment").textContent = s.department || "Not provided";
      $("profileSkills").textContent = skillsOf(s.skills).join(", ") || "Not provided";
      if ($("updateName")) $("updateName").value = s.full_name || "";
      if ($("updateUniversity")) $("updateUniversity").value = s.university || "";
      if ($("updateDepartment")) $("updateDepartment").value = s.department || "";
      if ($("updateSkills")) $("updateSkills").value = skillsOf(s.skills).join(", ");
    } catch (err) { statusMessage($("updateMessage"), err.message, true); }
  }
  loadProfile();

  const updateForm = $("updateForm");
  if (updateForm) updateForm.addEventListener("submit", async e => {
    e.preventDefault();
    if (!requireLogin()) return;
    const user = currentUser();
    try {
      await api(`/students/${user.id}`, { method: "PUT", body: JSON.stringify({
        full_name: $("updateName").value.trim(),
        university: $("updateUniversity").value.trim(),
        department: $("updateDepartment").value.trim(),
        skills: $("updateSkills").value.split(",").map(s => s.trim()).filter(Boolean).join(", ")
      })});
      statusMessage($("updateMessage"), "Profile saved to the database.");
      await loadProfile();
    } catch (err) { statusMessage($("updateMessage"), err.message, true); }
  });

  // Resume upload (server stores the file; browser extracts readable text for matching)
  const resumeInput = $("resume");
  if (resumeInput) resumeInput.addEventListener("change", () => {
    if ($("fileName")) $("fileName").textContent = resumeInput.files[0]?.name || "No file selected";
  });
  const uploadBtn = $("uploadBtn");
  if (uploadBtn) uploadBtn.addEventListener("click", async () => {
    if (!requireLogin()) return;
    const file = resumeInput?.files?.[0];
    if (!file) return statusMessage($("uploadMessage"), "Choose a PDF or DOCX file first.", true);
    const user = currentUser();
    const form = new FormData(); form.append("resume", file);
    uploadBtn.disabled = true;
    try {
      await api(`/students/${user.id}/resume`, { method: "POST", body: form });
      let text = "";
      if (file.name.toLowerCase().endsWith(".pdf") && window.pdfjsLib) {
        const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map(x => x.str).join(" ") + "\n";
        }
      } else if (file.name.toLowerCase().endsWith(".docx") && window.mammoth) {
        const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        text = result.value;
      }
      if (text.trim()) localStorage.setItem("resumeText", text.slice(0, 30000));
      statusMessage($("uploadMessage"), "Resume uploaded. " + (text.trim() ? "Text extracted for skill matching." : "The file is stored; text extraction was unavailable in this browser."));
      if ($("resumeTextPreview")) $("resumeTextPreview").textContent = text.slice(0, 5000);
    } catch (err) { statusMessage($("uploadMessage"), err.message, true); }
    finally { uploadBtn.disabled = false; }
  });

  // Jobs from MySQL API, not localStorage/demo arrays
  let jobs = [];
  const jobsContainer = $("jobsContainer");
  function normalizeJob(row) {
    return {
      ...row,
      type: row.job_type || row.type || "Not specified",
      skills: skillsOf(row.required_skills ?? row.skills),
      description: row.description || ""
    };
  }
  function matchScore(job, user) {
    const mine = new Set(skillsOf(user?.skills).map(s => s.toLowerCase()));
    const required = job.skills.map(s => s.toLowerCase());
    const matched = required.filter(s => mine.has(s));
    return { matched, missing: required.filter(s => !mine.has(s)), score: required.length ? Math.round(matched.length / required.length * 100) : 0 };
  }
  function renderJobs() {
    if (!jobsContainer) return;
    const search = ($("searchInput")?.value || "").toLowerCase();
    const type = $("jobType")?.value || "All";
    const user = currentUser();
    const filtered = jobs.map(j => ({ ...j, match: matchScore(j, user) }))
      .filter(j => (type === "All" || j.type.toLowerCase() === type.toLowerCase()) &&
        `${j.title} ${j.company} ${j.location} ${j.skills.join(" ")}`.toLowerCase().includes(search))
      .sort((a,b) => b.match.score - a.match.score);
    jobsContainer.innerHTML = "";
    if (!filtered.length) {
      if ($("noJobsMessage")) $("noJobsMessage").textContent = "No jobs found in the database. Try another search or ask an admin to add opportunities.";
      return;
    }
    if ($("noJobsMessage")) $("noJobsMessage").textContent = user ? "" : "Log in and add your skills to see personalised match scores.";
    filtered.forEach(job => {
      const card = document.createElement("article");
      card.className = "job-card";
      card.innerHTML = `<h3>${esc(job.title)}</h3>
        <p><strong>Company:</strong> ${esc(job.company)}</p>
        <p><strong>Type:</strong> ${esc(job.type)}</p>
        <p><strong>Location:</strong> ${esc(job.location || "Not specified")}</p>
        <p><strong>Required skills:</strong> ${esc(job.skills.join(", ") || "Not specified")}</p>
        <p><strong>Matched skills:</strong> ${esc(job.match.matched.join(", ") || "None")}</p>
        <p><strong>Skill match:</strong> ${job.match.score}%</p>
        <p><strong>Missing skills:</strong> ${esc(job.match.missing.join(", ") || "None")}</p>
        <div class="job-actions"><button class="applyBtn" data-id="${Number(job.id)}">Apply Now</button>
        <button class="detailsBtn" data-id="${Number(job.id)}">View Details</button></div>`;
      jobsContainer.appendChild(card);
    });
  }
  async function loadJobs() {
    if (!jobsContainer) return;
    jobsContainer.innerHTML = "<p>Loading opportunities…</p>";
    try {
      const data = await api("/jobs");
      jobs = (data.jobs || []).map(normalizeJob);
      renderJobs();
    } catch (err) {
      jobsContainer.innerHTML = `<p class="empty-message">Could not load jobs: ${esc(err.message)}. Start the backend and check your database connection.</p>`;
    }
  }
  if ($("searchInput")) $("searchInput").addEventListener("input", renderJobs);
  if ($("jobType")) $("jobType").addEventListener("change", renderJobs);
  loadJobs();

  // Job details and application modal
  function openDetails(job) {
    const old = $("jobDetailsModal"); if (old) old.remove();
    const modal = document.createElement("div"); modal.id = "jobDetailsModal";
    modal.style.cssText = "position:fixed;inset:0;background:#0009;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px";
    modal.innerHTML = `<div style="background:white;color:#222;max-width:600px;width:100%;padding:28px;border-radius:14px;max-height:85vh;overflow:auto">
      <button id="closeDetails" style="float:right">Close</button><h2>${esc(job.title)}</h2>
      <p><b>Company:</b> ${esc(job.company)}</p><p><b>Type:</b> ${esc(job.type)}</p><p><b>Location:</b> ${esc(job.location)}</p>
      <h3>Description</h3><p>${esc(job.description)}</p><h3>Required skills</h3><p>${esc(job.skills.join(", "))}</p></div>`;
    document.body.appendChild(modal);
    $("closeDetails").onclick = () => modal.remove();
    modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  }
  function openApply(job) {
    if (!requireLogin()) return;
    const user = currentUser();
    if (user.role === "admin") return alert("Admin accounts cannot apply for jobs.");
    const modal = document.createElement("div"); modal.id = "applicationModal";
    modal.style.cssText = "position:fixed;inset:0;background:#0009;z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px";
    modal.innerHTML = `<form id="applicationForm" style="background:white;color:#222;max-width:520px;width:100%;padding:28px;border-radius:14px">
      <button type="button" id="closeApply" style="float:right">Close</button><h2>Apply for ${esc(job.title)}</h2>
      <p>${esc(job.company)} · ${esc(job.location || "")}</p><label for="coverLetter">Cover letter</label>
      <textarea id="coverLetter" rows="6" required maxlength="5000" style="width:100%;box-sizing:border-box"></textarea>
      <p id="applicationMessage" aria-live="polite"></p><button type="submit">Submit application</button></form>`;
    document.body.appendChild(modal);
    $("closeApply").onclick = () => modal.remove();
    $("applicationForm").addEventListener("submit", async e => {
      e.preventDefault();
      const submit = $("applicationForm").querySelector('[type="submit"]'); submit.disabled = true;
      try {
        const data = await api("/applications", { method: "POST", body: JSON.stringify({ job_id: job.id, cover_letter: $("coverLetter").value.trim() }) });
        statusMessage($("applicationMessage"), data.message || "Application submitted.");
        setTimeout(() => modal.remove(), 900);
      } catch (err) { statusMessage($("applicationMessage"), err.message, true); submit.disabled = false; }
    });
  }
  if (jobsContainer) jobsContainer.addEventListener("click", e => {
    const apply = e.target.closest(".applyBtn"), details = e.target.closest(".detailsBtn");
    if (apply) { const job = jobs.find(j => Number(j.id) === Number(apply.dataset.id)); if (job) openApply(job); }
    if (details) { const job = jobs.find(j => Number(j.id) === Number(details.dataset.id)); if (job) openDetails(job); }
  });

  // My applications page
  async function loadApplications() {
    const container = $("applicationsContainer");
    if (!container) return;
    if (!requireLogin()) return;
    container.textContent = "Loading your applications…";
    try {
      const data = await api("/applications");
      const apps = data.applications || [];
      if (!apps.length) { container.innerHTML = '<div class="empty-message"><h3>No applications yet</h3><p>Your submitted applications will appear here.</p><a class="btn btn-small" href="jobs.html">Browse Jobs</a></div>'; return; }
      container.innerHTML = "";
      apps.forEach(a => {
        const card = document.createElement("article"); card.className = "application-card";
        card.innerHTML = `<h3>${esc(a.title)}</h3><p><b>Company:</b> ${esc(a.company)}</p><p><b>Location:</b> ${esc(a.location)}</p><p><b>Applied:</b> ${esc(a.applied_at)}</p><p><b>Status:</b> ${esc(a.status)}</p>`;
        container.appendChild(card);
      });
    } catch (err) { container.textContent = err.message; }
  }
  loadApplications();

  // Homepage featured opportunities are also loaded from the database.
  const featuredJobs = $("featuredJobs");
  if (featuredJobs) {
    api("/jobs").then(data => {
      const list = (data.jobs || []).slice(0, 3);
      featuredJobs.innerHTML = "";
      if (!list.length) { featuredJobs.innerHTML = '<p>No live listings yet. Log in as an admin to add jobs.</p>'; return; }
      list.forEach(raw => {
        const j = normalizeJob(raw);
        const card = document.createElement("article");
        card.className = "featured-card";
        card.innerHTML = `<div class="company-icon">${esc((j.company || "?").charAt(0).toUpperCase())}</div><h3>${esc(j.title)}</h3><p>${esc(j.company)} · ${esc(j.type)} · ${esc(j.location || "Location not specified")}</p>`;
        featuredJobs.appendChild(card);
      });
    }).catch(err => { featuredJobs.textContent = `Live opportunities unavailable: ${err.message}`; });
  }

  // Start button
  if ($("startBtn")) $("startBtn").addEventListener("click", () => location.href = token() ? "profile.html" : "register.html");
})();
