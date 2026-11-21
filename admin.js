(() => {
  "use strict";
  const API = window.API_BASE_URL || "http://localhost:5000/api";
  const $ = id => document.getElementById(id);
  const getUser = () => { try { return JSON.parse(localStorage.getItem("studentData") || "null"); } catch { return null; } };
  const getToken = () => localStorage.getItem("authToken");
  const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const skills = v => { if (Array.isArray(v)) return v; try { const a=JSON.parse(v); if(Array.isArray(a)) return a; } catch {} return String(v||"").split(",").map(x=>x.trim()).filter(Boolean); };
  async function api(path, options={}) {
    const headers={...(options.headers||{}),Authorization:`Bearer ${getToken()}`};
    if(options.body!==undefined) headers["Content-Type"]="application/json";
    const r=await fetch(API+path,{...options,headers}); const d=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d.message||`Request failed (${r.status})`); return d;
  }
  let jobs=[], applications=[];
  const msg=(text,bad=false)=>{ if($("adminMessage")){$("adminMessage").textContent=text;$("adminMessage").style.color=bad?"#b91c1c":"#15803d";} };
  async function init(){
    const user=getUser();
    if(!getToken()||!user){alert("Please log in as an admin.");location.href="login.html";return;}
    if(user.role!=="admin"){alert("Admin access required.");location.href="index.html";return;}
    try { await Promise.all([loadJobs(),loadApplications()]); }
    catch(e){msg(e.message,true);}
  }
  async function loadJobs(){
    const d=await api("/jobs"); jobs=(d.jobs||[]).map(j=>({...j,skills:skills(j.required_skills),type:j.job_type||"Internship"})); renderJobs();
  }
  async function loadApplications(){
    const d=await api("/admin/applications"); applications=d.applications||[]; renderApplications();
  }
  function renderStats(){
    $("totalJobs").textContent=jobs.length;
    $("totalApplications").textContent=applications.length;
    $("pendingApplications").textContent=applications.filter(a=>a.status==="Pending").length;
  }
  function renderJobs(){
    const box=$("adminJobsContainer"); box.innerHTML="";
    if(!jobs.length) box.innerHTML="<p>No jobs in the database yet.</p>";
    jobs.forEach(j=>{
      const card=document.createElement("div");card.className="job-item";
      card.innerHTML=`<h3>${esc(j.title)}</h3><p><b>Company:</b> ${esc(j.company)}</p><p><b>Type:</b> ${esc(j.type)}</p><p><b>Location:</b> ${esc(j.location)}</p><p><b>Skills:</b> ${esc(j.skills.join(", "))}</p>
      <button class="edit-btn" data-edit="${j.id}">Edit</button><button class="delete-btn" data-delete="${j.id}">Delete</button>`;
      box.appendChild(card);
    });
    renderStats();
  }
  function renderApplications(){
    const box=$("adminApplicationsContainer");box.innerHTML="";
    if(!applications.length) box.innerHTML="<p>No applications received yet.</p>";
    applications.forEach(a=>{
      const card=document.createElement("div");card.className="application-item";
      card.innerHTML=`<h3>${esc(a.title)} · ${esc(a.company)}</h3><p><b>Student:</b> ${esc(a.full_name)} (${esc(a.email)})</p><p><b>Applied:</b> ${esc(a.applied_at)}</p><label>Status</label>
      <select data-status="${a.id}">${["Pending","Reviewed","Accepted","Rejected"].map(x=>`<option ${x===a.status?"selected":""}>${x}</option>`).join("")}</select>
      <button data-save-status="${a.id}">Update status</button>`;
      box.appendChild(card);
    });
    renderStats();
  }
  function resetForm(){
    $("adminJobForm").reset();$("editingJobId").value="";
    $("jobFormHeading").textContent="Add New Job";$("jobSubmitButton").textContent="Add Job";$("cancelEditButton").hidden=true;
  }
  $("adminJobForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const id=$("editingJobId").value;
    const body={title:$("adminJobTitle").value.trim(),company:$("adminCompany").value.trim(),job_type:$("adminJobType").value,location:$("adminLocation").value.trim(),description:$("adminDescription").value.trim(),required_skills:$("adminSkills").value.split(",").map(x=>x.trim()).filter(Boolean).join(", ")};
    try { await api(id?`/jobs/${id}`:"/jobs",{method:id?"PUT":"POST",body:JSON.stringify(body)});msg(id?"Job updated.":"Job added.");resetForm();await loadJobs(); }
    catch(err){msg(err.message,true);}
  });
  $("cancelEditButton").addEventListener("click",resetForm);
  $("adminJobsContainer").addEventListener("click",async e=>{
    const edit=e.target.closest("[data-edit]"), del=e.target.closest("[data-delete]");
    if(edit){const j=jobs.find(x=>Number(x.id)===Number(edit.dataset.edit));if(!j)return;
      $("editingJobId").value=j.id;$("adminJobTitle").value=j.title;$("adminCompany").value=j.company;$("adminJobType").value=j.type;$("adminLocation").value=j.location||"";$("adminDescription").value=j.description||"";$("adminSkills").value=j.skills.join(", ");$("jobFormHeading").textContent="Edit Job";$("jobSubmitButton").textContent="Update Job";$("cancelEditButton").hidden=false;$("adminJobForm").scrollIntoView({behavior:"smooth"});}
    if(del&&confirm("Delete this job? Applications referencing it may also be affected by your database foreign-key rules.")){try{await api(`/jobs/${del.dataset.delete}`,{method:"DELETE"});msg("Job deleted.");await loadJobs();await loadApplications();}catch(err){msg(err.message,true);}}
  });
  $("adminApplicationsContainer").addEventListener("click",async e=>{
    const btn=e.target.closest("[data-save-status]");if(!btn)return;
    const id=btn.dataset.saveStatus;
    const select=btn.parentElement.querySelector(`[data-status="${id}"]`);
    try{await api(`/applications/${id}`,{method:"PUT",body:JSON.stringify({status:select.value})});msg("Application status updated.");await loadApplications();}
    catch(err){msg(err.message,true);}
  });
  const importButton = $("importJobsButton");
  if (importButton) importButton.addEventListener("click", async () => {
    const provider = $("jobBoardProvider").value;
    const board = $("jobBoardName").value.trim();
    if (!board) { $("importMessage").textContent = "Enter the company's board identifier."; return; }
    importButton.disabled = true;
    $("importMessage").textContent = "Importing public listings…";
    try {
      const result = await api(`/admin/import/${provider}/${encodeURIComponent(board)}`, {method:"POST", body:JSON.stringify({})});
      $("importMessage").textContent = `${result.message} Imported/updated: ${result.imported}.`;
      await loadJobs();
    } catch (err) { $("importMessage").textContent = err.message; }
    finally { importButton.disabled = false; }
  });
  init();
})();