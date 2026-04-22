/* ================================================================
   ANHS E-CLASS RECORD SYSTEM — THREE-TERM (DO 009, s. 2026)
   main.js v4.0
================================================================ */
console.log("MAIN JS LOADED");

const TRANS=[[0,3.99,60],[4,7.99,61],[8,11.99,62],[12,15.99,63],[16,19.99,64],[20,23.99,65],[24,27.99,66],[28,31.99,67],[32,35.99,68],[36,39.99,69],[40,43.99,70],[44,47.99,71],[48,51.99,72],[52,55.99,73],[56,59.99,74],[60,61.59,75],[61.6,63.19,76],[63.2,64.79,77],[64.8,66.39,78],[66.4,67.99,79],[68,69.59,80],[69.6,71.19,81],[71.2,72.79,82],[72.8,74.39,83],[74.4,75.99,84],[76,77.59,85],[77.6,79.19,86],[79.2,80.79,87],[80.8,82.39,88],[82.4,83.99,89],[84,85.59,90],[85.6,87.19,91],[87.2,88.79,92],[88.8,90.39,93],[90.4,91.99,94],[92,93.59,95],[93.6,95.19,96],[95.2,96.79,97],[96.8,98.39,98],[98.4,99.99,99],[100,100,100]];
function transmute(v){if(v===null||isNaN(v))return null;if(v>=100)return 100;for(const[lo,hi,g]of TRANS)if(v>=lo&&v<=hi)return g;return v<0?60:100;}
function r2(n){return Math.round(n*100)/100}
function esc(s){return String(s).replace(/'/g,"\\'")}
function escH(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function norm(n){return String(n).trim().replace(/\s+/g,' ').toUpperCase()}
function today(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}

const TERM_DATES={
  1:{name:'Term 1',start:'June 8, 2026',end:'September 15, 2026',days:69},
  2:{name:'Term 2',start:'September 16, 2026',end:'December 18, 2026',days:65},
  3:{name:'Term 3',start:'January 4, 2027',end:'April 8, 2027',days:67}
};

// ── APP STATE ──
let CURRENT_USER=null;
let APP={role:null,ac:{grade:'',section:'',sy:'2026-2027'},cd:{},imported:[],page:'home',rbtab:'setup',gt:1,aq:0,attDate:today(),hlStudent:null,activeSF:'sf1'};

function ck(){const u=CURRENT_USER?CURRENT_USER.empId:'guest';return`${u}_${APP.ac.grade}_${APP.ac.section}_${APP.ac.sy}`.replace(/\s+/g,'_');}
function getCD(){
  const k=ck();
  if(!APP.cd[k]){APP.cd[k]={
    school:{name:CURRENT_USER?.school||'',id:CURRENT_USER?.schoolId||'',region:CURRENT_USER?.region||'',division:CURRENT_USER?.division||'',section:APP.ac.section,teacher:CURRENT_USER?`${CURRENT_USER.lastName}, ${CURRENT_USER.firstName}`:'',subject:'',year:APP.ac.sy,grade:APP.ac.grade,sy:APP.ac.sy},
    students:{male:[],female:[]},
    hps:{1:{ww:Array(10).fill(null),pt:Array(10).fill(null),te:null},2:{ww:Array(10).fill(null),pt:Array(10).fill(null),te:null},3:{ww:Array(10).fill(null),pt:Array(10).fill(null),te:null}},
    grades:{1:{},2:{},3:{}},att:{},diag:{items:0,hso:0,lso:0}
  };}
  const cd=APP.cd[k];
  for(let t=1;t<=3;t++){
    if(!cd.hps[t])cd.hps[t]={ww:Array(10).fill(null),pt:Array(10).fill(null),te:null};
    while(cd.hps[t].ww.length<10)cd.hps[t].ww.push(null);
    while(cd.hps[t].pt.length<10)cd.hps[t].pt.push(null);
    if(!cd.grades[t])cd.grades[t]={};
  }
  if(!cd.att)cd.att={};
  if(!cd.diag)cd.diag={items:0,hso:0,lso:0};
  return cd;
}
function allStu(){const cd=getCD();return[...cd.students.male.map(n=>({name:n,g:'male'})),...cd.students.female.map(n=>({name:n,g:'female'}))];}
function hasClass(){return APP.ac.grade&&APP.ac.section}

// ── AUTH ──
function getUsers(){try{return JSON.parse(localStorage.getItem('anhs_users')||'[]')}catch(e){return[]}}
function saveUsers(u){try{localStorage.setItem('anhs_users',JSON.stringify(u))}catch(e){}}
function doLogin(){
  const uid=document.getElementById('liEmail').value.trim();
  const pass=document.getElementById('liPass').value;
  const err=document.getElementById('liErr');
  if(!uid||!pass){err.textContent='Please enter employee ID and password.';return;}
  const users=getUsers();const user=users.find(u=>u.empId===uid);
  if(!user||user.password!==btoa(pass)){err.textContent='Invalid employee ID or password.';return;}
  CURRENT_USER=user;try{localStorage.setItem('anhs_current_user',JSON.stringify(user))}catch(e){}
  err.textContent='';startApp(user);
}
function doRegister(){
  const first=document.getElementById('regFirst').value.trim();
  const last=document.getElementById('regLast').value.trim();
  const empId=document.getElementById('regEmpId').value.trim();
  const school=document.getElementById('regSchool').value.trim();
  const schoolId=document.getElementById('regSchoolId').value.trim();
  const region=document.getElementById('regRegion').value.trim();
  const division=document.getElementById('regDivision').value.trim();
  const role=document.getElementById('regRole').value;
  const pass=document.getElementById('regPass').value;
  const pass2=document.getElementById('regPass2').value;
  const err=document.getElementById('regErr');
  if(!first||!last||!empId||!pass){err.textContent='Please fill in all required fields.';return;}
  if(pass!==pass2){err.textContent='Passwords do not match.';return;}
  if(pass.length<6){err.textContent='Password must be at least 6 characters.';return;}
  const users=getUsers();
  if(users.find(u=>u.empId===empId)){err.textContent='Employee ID already registered.';return;}
  const newUser={empId,firstName:first,lastName:last,school:school||'Angono National High School',schoolId:schoolId||'301417',region:region||'IV-A CALABARZON',division:division||'Rizal',role,password:btoa(pass),createdAt:new Date().toISOString()};
  users.push(newUser);saveUsers(users);
  err.style.color='var(--green)';err.textContent='Account created! You can now sign in.';
  setTimeout(()=>{err.textContent='';err.style.color='';showLogin();},1500);
}
function guestLogin(){CURRENT_USER={empId:'guest',firstName:'Guest',lastName:'Teacher',school:'Angono National High School',schoolId:'301417',region:'IV-A CALABARZON',division:'Rizal',role:'subject',isGuest:true};startApp(CURRENT_USER);}
function doLogout(){if(!confirm('Sign out? Make sure you saved your data first.'))return;CURRENT_USER=null;try{localStorage.removeItem('anhs_current_user')}catch(e){}document.getElementById('app').classList.remove('visible');document.getElementById('roleScreen').style.display='none';document.getElementById('authScreen').style.display='flex';APP.role=null;}
function startApp(user){
  document.getElementById('authScreen').style.display='none';
  load();
  const pill=document.getElementById('userPill');if(pill)pill.textContent=user.isGuest?'Guest':`${user.lastName}, ${user.firstName.charAt(0)}.`;
  if(user.role&&!APP.role)APP.role=user.role;
  if(APP.role){
    document.getElementById('roleScreen').style.display='none';
    document.getElementById('app').classList.add('visible');
    updateRoleUI();buildNav();loadZoom();loadDarkMode();restoreClass();showPage(APP.page||'home');
  }else{document.getElementById('roleScreen').style.display='flex';}
}
function showLogin(){document.getElementById('paneLogin').style.display='block';document.getElementById('paneReg').style.display='none';}
function showRegister(){document.getElementById('paneLogin').style.display='none';document.getElementById('paneReg').style.display='block';}

// ── PERSISTENCE ──
function save(){try{const key=CURRENT_USER?`anhs_v4_${CURRENT_USER.empId}`:'anhs_v4_guest';localStorage.setItem(key,JSON.stringify(APP));}catch(e){}}
function load(){
  try{
    const key=CURRENT_USER?`anhs_v4_${CURRENT_USER.empId}`:'anhs_v4_guest';
    const d=localStorage.getItem(key);if(!d)return;
    const p=JSON.parse(d);APP={...APP,...p};
    Object.keys(APP.cd||{}).forEach(k=>{
      const cd=APP.cd[k];
      for(let t=1;t<=3;t++){
        if(!cd.hps[t])cd.hps[t]={ww:Array(10).fill(null),pt:Array(10).fill(null),te:null};
        while(cd.hps[t].ww.length<10)cd.hps[t].ww.push(null);
        while(cd.hps[t].pt.length<10)cd.hps[t].pt.push(null);
        if(!cd.grades[t])cd.grades[t]={};
      }
      if(!cd.att)cd.att={};if(!cd.students)cd.students={male:[],female:[]};if(!cd.diag)cd.diag={items:0,hso:0,lso:0};
    });
    if(!APP.imported)APP.imported=[];
  }catch(e){}
}
function saveFile(){
  const cd=hasClass()?getCD():null;
  const blob=new Blob([JSON.stringify({app:APP,user:CURRENT_USER?.empId,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  const nm=cd?`ANHS_${(cd.school.subject||'Class').replace(/\s+/g,'_').substring(0,12)}_${APP.ac.grade.replace(/\s/g,'')}_${APP.ac.section}_${APP.ac.sy}.json`:`ANHS_Backup_${today()}.json`;
  a.download=nm;a.click();URL.revokeObjectURL(a.href);toast('✓ File exported');
}
function loadFile(inp){
  const f=inp.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=e=>{
    try{
      const data=JSON.parse(e.target.result);
      if(data.app){
        APP={...APP,...data.app};
        Object.keys(APP.cd||{}).forEach(k=>{
          const cd=APP.cd[k];
          for(let t=1;t<=3;t++){if(!cd.hps[t])cd.hps[t]={ww:Array(10).fill(null),pt:Array(10).fill(null),te:null};while(cd.hps[t].ww.length<10)cd.hps[t].ww.push(null);while(cd.hps[t].pt.length<10)cd.hps[t].pt.push(null);if(!cd.grades[t])cd.grades[t]={};}
          if(!cd.att)cd.att={};if(!cd.students)cd.students={male:[],female:[]};
        });
        if(!APP.imported)APP.imported=[];
        save();restoreClass();buildNav();showPage(APP.page||'home');toast('✓ File loaded');
      }else{toast('✗ Invalid file format');}
    }catch(err){toast('✗ Could not read file');}
    inp.value='';
  };
  r.readAsText(f);
}
function restoreClass(){
  if(APP.ac.grade){
    const gs=document.getElementById('csGrade');if(gs)gs.value=APP.ac.grade;
    const ss=document.getElementById('csSection');if(ss)ss.value=APP.ac.section;
    const sy=document.getElementById('csSY');if(sy)sy.value=APP.ac.sy||'2026-2027';
    updateClassBadge();updateTermBar();rebuildSavedClassDropdown();
  }
}

// ── ZOOM & DARK MODE ──
const ZOOM_LEVELS=[90,100,110,120,130,140,150];let currentZoom=100;
function applyZoom(l){currentZoom=l;document.documentElement.setAttribute('data-zoom',l);const lb=document.getElementById('zoomLabel');if(lb)lb.textContent=l+'%';try{localStorage.setItem('anhs_zoom',l)}catch(e){}}
function zoomIn(){const i=ZOOM_LEVELS.indexOf(currentZoom);if(i<ZOOM_LEVELS.length-1)applyZoom(ZOOM_LEVELS[i+1]);else toast('Maximum zoom')}
function zoomOut(){const i=ZOOM_LEVELS.indexOf(currentZoom);if(i>0)applyZoom(ZOOM_LEVELS[i-1]);else toast('Minimum zoom')}
function loadZoom(){try{const s=localStorage.getItem('anhs_zoom');if(s)applyZoom(parseInt(s))}catch(e){}}
let darkMode=false;
function toggleDarkMode(){darkMode=!darkMode;document.body.classList.toggle('dark-mode',darkMode);const b=document.getElementById('dmBtn');if(b)b.textContent=darkMode?'☀️':'🌙';try{localStorage.setItem('anhs_dark',darkMode?'1':'0')}catch(e){}toast(darkMode?'🌙 Dark mode on':'☀️ Light mode on')}
function loadDarkMode(){try{const s=localStorage.getItem('anhs_dark');if(s==='1'){darkMode=true;document.body.classList.add('dark-mode');const b=document.getElementById('dmBtn');if(b)b.textContent='☀️';}}catch(e){}}

// ── ROLE & NAV ──
function selectRole(role){APP.role=role;save();document.getElementById('roleScreen').style.display='none';document.getElementById('app').classList.add('visible');updateRoleUI();buildNav();showPage('home');}
function switchRole(){document.getElementById('roleScreen').style.display='flex';document.getElementById('app').classList.remove('visible');APP.role=null;save();}
function updateRoleUI(){const rl=document.getElementById('roleLabel');if(rl)rl.textContent=APP.role==='advisory'?'Advisory Teacher':'Subject Teacher';}
function buildNav(){
  const nav=document.getElementById('mainNav');if(!nav)return;
  const subItems=[{id:'home',icon:'🏠',label:'Home'},{id:'recordbook',icon:'📝',label:'Record Book'},{id:'gradesummary',icon:'📊',label:'Grade Summary'},{id:'dailyatt',icon:'📅',label:'Daily Att.'},{id:'attsummary',icon:'📋',label:'Att. Summary'},{id:'sfforms',icon:'🗂',label:'SF Forms'}];
  const advItems=[{id:'home',icon:'🏠',label:'Home'},{id:'recordbook',icon:'📝',label:'Record Book'},{id:'gradesummary',icon:'📊',label:'Grade Summary'},{id:'consolidated',icon:'🔀',label:'Consolidated'},{id:'dailyatt',icon:'📅',label:'Daily Att.'},{id:'attsummary',icon:'📋',label:'Att. Summary'},{id:'sfforms',icon:'🗂',label:'SF Forms'},{id:'registrar',icon:'📬',label:'Registrar'}];
  const items=APP.role==='advisory'?advItems:subItems;
  nav.innerHTML=items.map(it=>`<button class="mnbtn ${APP.page===it.id?'active':''}" onclick="showPage('${it.id}')">${it.icon} ${it.label}</button>`).join('');
}
function showPage(name){
  APP.page=name;save();
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const pg=document.getElementById('page-'+name);if(pg)pg.classList.add('active');
  buildNav();
  if(name==='home')renderHome();
  else if(name==='recordbook')showRB(APP.rbtab||'setup');
  else if(name==='gradesummary'){renderGradeSummaryPage();renderGSLOA();}
  else if(name==='dailyatt')renderDailyAtt();
  else if(name==='attsummary')renderAttSum();
  else if(name==='consolidated')renderCons();
  else if(name==='sfforms')renderSF(APP.activeSF||'sf1');
  else if(name==='registrar')renderRegistrar();
}

// ── CLASS SELECTOR & TERM BAR ──
function applyClass(){
  const g=document.getElementById('csGrade').value;
  const s=document.getElementById('csSection').value.trim().toUpperCase();
  const sy=document.getElementById('csSY').value.trim();
  if(!g||!s){toast('Please select grade and enter section');return;}
  APP.ac={grade:g,section:s,sy:sy||'2026-2027'};save();updateClassBadge();updateTermBar();rebuildSavedClassDropdown();showPage(APP.page||'home');toast(`✓ Class loaded: ${g} – ${s}`);
}
function updateClassBadge(){const b=document.getElementById('classBadge');if(b)b.textContent=APP.ac.grade?`${APP.ac.grade} · ${APP.ac.section}`:'No class';const info=document.getElementById('csInfo');if(info&&hasClass())info.textContent=`Active: ${APP.ac.grade} – ${APP.ac.section} · SY ${APP.ac.sy}`;}
function updateTermBar(){const bar=document.getElementById('tbarSY');if(bar)bar.textContent=`SY ${APP.ac.sy||'2026-2027'} · 201 class days`;}
function setActiveTerm(t){APP.gt=t;save();document.querySelectorAll('.ttab').forEach((btn,i)=>btn.classList.toggle('active',i+1===t));if(APP.page==='recordbook'&&(APP.rbtab==='gradeentry'||APP.rbtab==='loa'))showRB(APP.rbtab);}
function rebuildSavedClassDropdown(){
  const sel=document.getElementById('savedClassSelect');if(!sel)return;
  try{const key=CURRENT_USER?`anhs_v4_${CURRENT_USER.empId}`:'anhs_v4_guest';const d=localStorage.getItem(key);if(!d){sel.innerHTML='<option value="">Saved classes…</option>';return;}const data=JSON.parse(d);const classes=Object.keys(data.cd||{});sel.innerHTML='<option value="">Saved classes…</option>'+classes.map(k=>{const cd=data.cd[k];return`<option value="${k}">${cd.school.grade||''} – ${cd.school.section||''} (${cd.school.sy||''})</option>`;}).join('');}catch(e){}
}
function pickSavedClass(){
  const sel=document.getElementById('savedClassSelect');const k=sel?.value;if(!k)return;
  const cd=APP.cd[k];if(!cd)return;
  APP.ac.grade=cd.school.grade||'';APP.ac.section=cd.school.section||'';APP.ac.sy=cd.school.sy||cd.school.year||'2026-2027';
  const gs=document.getElementById('csGrade');if(gs)gs.value=APP.ac.grade;
  const ss=document.getElementById('csSection');if(ss)ss.value=APP.ac.section;
  const sy=document.getElementById('csSY');if(sy)sy.value=APP.ac.sy;
  save();updateClassBadge();updateTermBar();showPage(APP.page);toast(`✓ Switched to ${APP.ac.grade} – ${APP.ac.section}`);
}

// ── GRADE CALCULATION — THREE-TERM ──
const W={ww:0.30,pt:0.50,te:0.20};
function calcT(name,t){
  const cd=getCD();const h=cd.hps[t];const g=(cd.grades[t]&&cd.grades[t][name])||{};
  const ww=g.ww||Array(10).fill(null);const pt=g.pt||Array(10).fill(null);const te=g.te!==undefined?g.te:null;
  const wwHT=h.ww.reduce((a,v)=>a+(v||0),0);const ptHT=h.pt.reduce((a,v)=>a+(v||0),0);
  let wwT=null,wwPS=null,wwWS=null,ptT=null,ptPS=null,ptWS=null,tePS=null,teWS=null;
  let wwS=0,wwA=false;ww.forEach((v,i)=>{if(v!==null&&!isNaN(v)&&h.ww[i]){wwS+=parseFloat(v);wwA=true;}});
  if(wwA&&wwHT){wwT=r2(wwS);wwPS=r2((wwT/wwHT)*100);wwWS=r2(wwPS*W.ww);}
  let ptS=0,ptA=false;pt.forEach((v,i)=>{if(v!==null&&!isNaN(v)&&h.pt[i]){ptS+=parseFloat(v);ptA=true;}});
  if(ptA&&ptHT){ptT=r2(ptS);ptPS=r2((ptT/ptHT)*100);ptWS=r2(ptPS*W.pt);}
  if(te!==null&&!isNaN(te)&&h.te){tePS=r2((parseFloat(te)/h.te)*100);teWS=r2(tePS*W.te);}
  let initial=null,termGrade=null;
  if(wwWS!==null||ptWS!==null||teWS!==null){initial=r2((wwWS||0)+(ptWS||0)+(teWS||0));termGrade=transmute(initial);}
  return{wwT,wwPS,wwWS,ptT,ptPS,ptWS,tePS,teWS,initial,termGrade,quarterly:termGrade};
}
function calcFinal(name){const terms=[1,2,3].map(t=>calcT(name,t).termGrade).filter(v=>v!==null);return terms.length?Math.round(terms.reduce((a,b)=>a+b,0)/terms.length):null;}

// ── SETUP ──
function showRB(tab){
  APP.rbtab=tab;save();
  document.querySelectorAll('.rbtab').forEach(d=>d.style.display='none');
  document.querySelectorAll('#rbNav .stab').forEach(b=>b.classList.remove('active'));
  const el=document.getElementById('rb-'+tab);if(el)el.style.display='block';
  const idx=['setup','gradeentry','bulkentry','summary','analytics','loa','instructions'].indexOf(tab);
  document.querySelectorAll('#rbNav .stab')[idx]?.classList.add('active');
  if(tab==='setup')renderSetup();
  else if(tab==='gradeentry')renderGradeEntry();
  else if(tab==='bulkentry')renderBulkEntry();
  else if(tab==='summary')renderRBSummary();
  else if(tab==='analytics')renderAnalytics();
  else if(tab==='loa')renderLOA();
  else if(tab==='instructions')renderInstructions();
}

function renderSetup(){
  const el=document.getElementById('rb-setup');
  if(!hasClass()){el.innerHTML='<div class="ws"><h2>Select a class first</h2><p>Use the class selector bar above.</p></div>';return;}
  const cd=getCD();const s=cd.school;
  el.innerHTML=`
  <div class="ebar">
    <span class="elbl">💾 Save:</span>
    <button class="btn bg bsm" onclick="saveSetup()">✓ Save Setup</button>
    <button class="btn ba bsm" onclick="saveFile()">📥 Export .json</button>
    <label class="btn bo bsm" style="cursor:pointer">📂 Load File<input type="file" accept=".json" style="display:none" onchange="loadFile(this)"></label>
  </div>
  <div class="g2" style="margin-bottom:.9rem">
    <div class="card">
      <div class="ch"><div class="ct">🏫 School Information</div></div>
      <div class="g2" style="margin-bottom:.7rem">
        <div><div class="lbl">School Name</div><input class="inp" id="ss_name" value="${escH(s.name)}" placeholder="Angono National High School"></div>
        <div><div class="lbl">School ID</div><input class="inp" id="ss_id" value="${escH(s.id)}" placeholder="301417"></div>
      </div>
      <div class="g2" style="margin-bottom:.7rem">
        <div><div class="lbl">Region</div><input class="inp" id="ss_region" value="${escH(s.region)}" placeholder="IV-A CALABARZON"></div>
        <div><div class="lbl">Division</div><input class="inp" id="ss_division" value="${escH(s.division)}" placeholder="Rizal"></div>
      </div>
      <div class="g2" style="margin-bottom:.7rem">
        <div><div class="lbl">Grade & Section</div><input class="inp" id="ss_grade" value="${escH(s.grade)}" readonly style="background:var(--surf2)"></div>
        <div><div class="lbl">School Year</div><input class="inp" id="ss_sy" value="${escH(s.year||s.sy||APP.ac.sy)}" placeholder="2026-2027"></div>
      </div>
      <div class="g2">
        <div><div class="lbl">Teacher Name</div><input class="inp" id="ss_teacher" value="${escH(s.teacher)}" placeholder="DELA CRUZ, JUAN A."></div>
        <div><div class="lbl">Subject</div><input class="inp" id="ss_subject" value="${escH(s.subject)}" placeholder="Mathematics 10"></div>
      </div>
    </div>
    <div class="card">
      <div class="ch"><div class="ct">📅 Three-Term Calendar Reference</div><div class="cs">DO 009, s. 2026 — SY 2026-2027</div></div>
      ${[1,2,3].map(t=>`<div style="display:flex;align-items:center;gap:.7rem;padding:.6rem 0;border-bottom:1px solid var(--bdr)">
        <div class="tag tt${t}" style="min-width:60px;justify-content:center">Term ${t}</div>
        <div><div style="font-size:.82rem;font-weight:600">${TERM_DATES[t].start} – ${TERM_DATES[t].end}</div><div style="font-size:.7rem;color:var(--tx3)">${TERM_DATES[t].days} class days</div></div>
      </div>`).join('')}
      <div style="padding:.6rem 0;font-size:.75rem;color:var(--tx2);line-height:1.7"><strong>Grading:</strong> WW 30% + PT 50% + Term Exam 20% = Term Grade<br><strong>Final Grade</strong> = Average of Term 1 + Term 2 + Term 3</div>
    </div>
  </div>
  <div class="card" style="margin-bottom:.9rem">
    <div class="ch"><div class="ct">📐 HPS (Highest Possible Score) — Per Term</div><div class="cs">Enter max score per item. Leave blank if not used for that term.</div></div>
    ${[1,2,3].map(t=>`
    <div style="margin-bottom:1rem;padding:.9rem;background:var(--term${t}-2);border-radius:var(--rs);border:1px solid var(--term${t})">
      <div style="font-size:.85rem;font-weight:700;color:var(--term${t});margin-bottom:.65rem">Term ${t} — ${TERM_DATES[t].name}</div>
      <div class="lbl">Written Works (WW1–WW10)</div>
      <div class="hps10" style="margin-bottom:.6rem">${cd.hps[t].ww.map((v,i)=>`<div><div class="hpl">WW${i+1}</div><input class="hpi" type="number" min="0" id="hps_t${t}_ww_${i}" value="${v||''}" onchange="saveHPS()"></div>`).join('')}</div>
      <div class="lbl">Performance Tasks (PT1–PT10)</div>
      <div class="hps10" style="margin-bottom:.6rem">${cd.hps[t].pt.map((v,i)=>`<div><div class="hpl">PT${i+1}</div><input class="hpi" type="number" min="0" id="hps_t${t}_pt_${i}" value="${v||''}" onchange="saveHPS()"></div>`).join('')}</div>
      <div class="g2">
        <div><div class="lbl">Term Examination (TE) — Total max score</div><input class="inp" type="number" min="0" id="hps_t${t}_te" value="${cd.hps[t].te||''}" placeholder="e.g. 100" onchange="saveHPS()"></div>
        <div><div class="lbl">WW Total HPS</div><div style="padding:.5rem .7rem;background:var(--surf2);border-radius:var(--rs);border:1px solid var(--bdr);font-family:'DM Mono',monospace;font-size:.85rem">${cd.hps[t].ww.reduce((a,v)=>a+(v||0),0)||'—'}</div></div>
      </div>
    </div>`).join('')}
  </div>
  <div class="g2">
    <div class="card">
      <div class="ch"><div class="ct">👦 Male Students</div><div class="cs">${cd.students.male.length}</div></div>
      <ul class="sl">${cd.students.male.map((n,i)=>`<li class="si"><span class="sn">${i+1}</span><span class="st">${escH(n)}</span><button class="sd" onclick="removeStu('male',${i})">✕</button></li>`).join('')}</ul>
      <div class="ar"><input class="inp" id="addMale" placeholder="DELA CRUZ, JUAN" style="flex:1" onkeydown="if(event.key==='Enter')addStu('male')"><button class="btn bp bsm" onclick="addStu('male')">+ Add</button></div>
    </div>
    <div class="card">
      <div class="ch"><div class="ct">👧 Female Students</div><div class="cs">${cd.students.female.length}</div></div>
      <ul class="sl">${cd.students.female.map((n,i)=>`<li class="si"><span class="sn">${i+1}</span><span class="st">${escH(n)}</span><button class="sd" onclick="removeStu('female',${i})">✕</button></li>`).join('')}</ul>
      <div class="ar"><input class="inp" id="addFemale" placeholder="REYES, MARIA" style="flex:1" onkeydown="if(event.key==='Enter')addStu('female')"><button class="btn bp bsm" onclick="addStu('female')">+ Add</button></div>
    </div>
  </div>`;
}

function saveSetup(){const cd=getCD();const s=cd.school;s.name=document.getElementById('ss_name')?.value||s.name;s.id=document.getElementById('ss_id')?.value||s.id;s.region=document.getElementById('ss_region')?.value||s.region;s.division=document.getElementById('ss_division')?.value||s.division;s.teacher=document.getElementById('ss_teacher')?.value||s.teacher;s.subject=document.getElementById('ss_subject')?.value||s.subject;s.year=document.getElementById('ss_sy')?.value||s.year;s.sy=s.year;saveHPS();save();toast('✓ Setup saved');}
function saveHPS(){const cd=getCD();for(let t=1;t<=3;t++){for(let i=0;i<10;i++){const ww=document.getElementById(`hps_t${t}_ww_${i}`);cd.hps[t].ww[i]=ww&&ww.value?parseFloat(ww.value)||null:null;const pt=document.getElementById(`hps_t${t}_pt_${i}`);cd.hps[t].pt[i]=pt&&pt.value?parseFloat(pt.value)||null:null;}const te=document.getElementById(`hps_t${t}_te`);cd.hps[t].te=te&&te.value?parseFloat(te.value)||null:null;}save();}
function addStu(gender){const inp=document.getElementById(gender==='male'?'addMale':'addFemale');const name=inp.value.trim().toUpperCase();if(!name)return;const cd=getCD();if(cd.students[gender].includes(name)){toast('Student already in list');return;}cd.students[gender].push(name);save();inp.value='';renderSetup();}
function removeStu(gender,idx){const cd=getCD();const name=cd.students[gender][idx];if(!confirm(`Remove ${name}?`))return;cd.students[gender].splice(idx,1);for(let t=1;t<=3;t++){delete cd.grades[t][name];}save();renderSetup();}


// ══════════════════════════════════════════════
// 10. GRADE ENTRY MODULE
// ══════════════════════════════════════════════
function renderGradeEntry(){
  const el=document.getElementById('rb-gradeentry');
  if(!hasClass()){el.innerHTML='<div class="ws"><h2>Select a class first</h2></div>';return;}
  const cd=getCD();const t=APP.gt;const h=cd.hps[t];const stu=allStu();
  if(!stu.length){el.innerHTML='<div class="ws"><h2>No students yet</h2><p>Add students in the Setup tab first.</p></div>';return;}
  const wwC=Math.max(h.ww.filter(v=>v).length,1);
  const ptC=Math.max(h.pt.filter(v=>v).length,1);
  const hasTE=!!h.te;
  const termTabs=`<div class="ttabs">${[1,2,3].map(ti=>`<button class="ttab2 ${ti===t?`active-t${ti}`:''}" onclick="setActiveTerm(${ti})">${TERM_DATES[ti].name}<span>${TERM_DATES[ti].start.split(',')[0]}</span></button>`).join('')}</div>`;
  let hdr1=`<tr>
    <th class="numc" rowspan="2">#</th>
    <th class="nc" style="text-align:left" rowspan="2">Learner's Name</th>
    <th class="sww sh-t${t}" colspan="${wwC+3}">Written Works (30%) — Term ${t}</th>
    <th class="spt sh-t${t}" colspan="${ptC+3}">Performance Tasks (50%) — Term ${t}</th>
    ${hasTE?`<th class="ste sh-t${t}" colspan="3">Term Examination (20%)</th>`:''}
    <th class="sg" rowspan="2">Initial</th>
    <th class="sg" rowspan="2">Term ${t}</th>
  </tr><tr>
    ${Array.from({length:wwC},(_,i)=>`<th>WW${i+1}</th>`).join('')}<th>Total</th><th>PS</th><th>WS</th>
    ${Array.from({length:ptC},(_,i)=>`<th>PT${i+1}</th>`).join('')}<th>Total</th><th>PS</th><th>WS</th>
    ${hasTE?'<th>Score</th><th>PS</th><th>WS</th>':''}
  </tr>`;
  const wwHT=h.ww.reduce((a,v)=>a+(v||0),0);const ptHT=h.pt.reduce((a,v)=>a+(v||0),0);
  let hpsRow=`<tr class="hrow"><td></td><td class="lc">Highest Possible Score</td>
    ${h.ww.slice(0,wwC).map(v=>`<td>${v||''}</td>`).join('')}<td>${wwHT}</td><td>100</td><td>30%</td>
    ${h.pt.slice(0,ptC).map(v=>`<td>${v||''}</td>`).join('')}<td>${ptHT}</td><td>100</td><td>50%</td>
    ${hasTE?`<td>${h.te}</td><td>100</td><td>20%</td>`:''}
    <td></td><td></td></tr>`;
  let rows='';let lastG=null;
  stu.forEach((s,idx)=>{
    if(s.g!==lastG){rows+=`<tr class="grph ${s.g==='male'?'m':'f'}"><td></td><td colspan="20">${s.g==='male'?'👦 MALE':'👧 FEMALE'}</td></tr>`;lastG=s.g;}
    const num=(s.g==='male'?cd.students.male:cd.students.female).indexOf(s.name)+1;
    const g=(cd.grades[t]&&cd.grades[t][s.name])||{};
    const ww=g.ww||Array(10).fill(null);const pt=g.pt||Array(10).fill(null);const te=g.te!==undefined?g.te:'';
    const c=calcT(s.name,t);
    const hl=APP.hlStudent===s.name?'background:var(--amber2)':'';
    rows+=`<tr class="${s.g==='male'?'rm':'rf'}" style="${hl}" id="row_${idx}">
      <td class="numc">${num}</td>
      <td class="nc">${escH(s.name)}</td>
      ${Array.from({length:wwC},(_,i)=>`<td class="gc"><input type="number" min="0" max="${h.ww[i]||999}" value="${ww[i]!==null&&ww[i]!==undefined?ww[i]:''}" onchange="setGrade('${esc(s.name)}',${t},'ww',${i},this.value)" onclick="this.select()"></td>`).join('')}
      <td class="cc bold">${c.wwT!==null?c.wwT:''}</td><td class="cc">${c.wwPS!==null?c.wwPS:''}</td><td class="cc">${c.wwWS!==null?c.wwWS:''}</td>
      ${Array.from({length:ptC},(_,i)=>`<td class="gc"><input type="number" min="0" max="${h.pt[i]||999}" value="${pt[i]!==null&&pt[i]!==undefined?pt[i]:''}" onchange="setGrade('${esc(s.name)}',${t},'pt',${i},this.value)" onclick="this.select()"></td>`).join('')}
      <td class="cc bold">${c.ptT!==null?c.ptT:''}</td><td class="cc">${c.ptPS!==null?c.ptPS:''}</td><td class="cc">${c.ptWS!==null?c.ptWS:''}</td>
      ${hasTE?`<td class="gc"><input type="number" min="0" max="${h.te||999}" value="${te}" onchange="setGrade('${esc(s.name)}',${t},'te',0,this.value)" onclick="this.select()"></td><td class="cc">${c.tePS!==null?c.tePS:''}</td><td class="cc">${c.teWS!==null?c.teWS:''}</td>`:''}
      <td class="cc">${c.initial!==null?c.initial:''}</td>
      <td class="cc ${c.termGrade?(c.termGrade>=75?'pass':'fail'):''}" style="font-size:.88rem;font-weight:700">${c.termGrade||''}</td>
    </tr>`;
  });
  el.innerHTML=`${termTabs}
  <div style="padding:.5rem .85rem;background:var(--term${t}-2);border:1px solid var(--term${t});border-radius:var(--rs);margin-bottom:.7rem;font-size:.78rem;font-weight:600;color:var(--term${t})">
    📝 Term ${t} — ${escH(cd.school.subject||'Subject')} · ${APP.ac.grade} ${APP.ac.section} · ${TERM_DATES[t].start} – ${TERM_DATES[t].end}
  </div>
  <div class="twrap"><table class="gtbl"><thead>${hdr1}${hpsRow}</thead><tbody>${rows}</tbody></table></div>`;
  if(APP.hlStudent){const idx2=stu.findIndex(s=>s.name===APP.hlStudent);if(idx2>=0)setTimeout(()=>{document.getElementById('row_'+idx2)?.scrollIntoView({behavior:'smooth',block:'center'});},200);APP.hlStudent=null;}
}
function setGrade(name,t,type,idx,val){
  const cd=getCD();if(!cd.grades[t])cd.grades[t]={};
  if(!cd.grades[t][name])cd.grades[t][name]={ww:Array(10).fill(null),pt:Array(10).fill(null),te:null};
  const v=val===''||val===null?null:parseFloat(val);
  if(type==='ww')cd.grades[t][name].ww[idx]=v;
  else if(type==='pt')cd.grades[t][name].pt[idx]=v;
  else if(type==='te')cd.grades[t][name].te=v;
  save();
}

// ══════════════════════════════════════════════
// 11. BULK ENTRY MODULE
// ══════════════════════════════════════════════
function renderBulkEntry(){
  const el=document.getElementById('rb-bulkentry');
  if(!hasClass()){el.innerHTML='<div class="ws"><h2>Select a class first</h2></div>';return;}
  const cd=getCD();const t=APP.gt;
  const termTabs=`<div class="ttabs">${[1,2,3].map(ti=>`<button class="ttab2 ${ti===t?`active-t${ti}`:''}" onclick="setActiveTerm(${ti})">${TERM_DATES[ti].name}</button>`).join('')}</div>`;
  el.innerHTML=`${termTabs}
  <div class="card">
    <div class="ch"><div class="ct">⚡ Bulk Entry — Term ${t}</div><div class="cs">Enter scores for one activity for all students at once</div></div>
    <div class="fl">
      <div><div class="lbl">Gender</div><select class="inp" id="be_gender" style="width:100px"><option value="all">All</option><option value="male">Male</option><option value="female">Female</option></select></div>
      <div><div class="lbl">Category</div><select class="inp" id="be_cat" style="width:140px" onchange="renderBulkFields()"><option value="ww">Written Works</option><option value="pt">Performance Tasks</option><option value="te">Term Examination</option></select></div>
      <div id="be_item_wrap"><div class="lbl">Item #</div><select class="inp" id="be_item" style="width:80px">${Array.from({length:10},(_,i)=>`<option value="${i}">WW${i+1}</option>`).join('')}</select></div>
      <button class="btn bp bsm" onclick="loadBulkStudents()">Load Students</button>
    </div>
  </div>
  <div id="bulkArea"></div>`;
}
function renderBulkFields(){const cat=document.getElementById('be_cat')?.value;const wrap=document.getElementById('be_item_wrap');if(cat==='te'){if(wrap)wrap.style.display='none';}else{if(wrap){wrap.style.display='';const sel=document.getElementById('be_item');if(sel)sel.innerHTML=Array.from({length:10},(_,i)=>`<option value="${i}">${cat==='ww'?'WW':'PT'}${i+1}</option>`).join('');}}}
function loadBulkStudents(){
  const cd=getCD();const t=APP.gt;
  const gender=document.getElementById('be_gender')?.value||'all';
  const cat=document.getElementById('be_cat')?.value||'ww';
  const itemIdx=parseInt(document.getElementById('be_item')?.value||'0');
  const area=document.getElementById('bulkArea');if(!area)return;
  let stuList=[];
  if(gender==='all'||gender==='male')stuList=[...stuList,...cd.students.male.map(n=>({name:n,g:'male'}))];
  if(gender==='all'||gender==='female')stuList=[...stuList,...cd.students.female.map(n=>({name:n,g:'female'}))];
  const label=cat==='te'?'Term Examination':cat==='ww'?`WW${itemIdx+1}`:`PT${itemIdx+1}`;
  const hps=cat==='te'?cd.hps[t].te:cat==='ww'?cd.hps[t].ww[itemIdx]:cd.hps[t].pt[itemIdx];
  area.innerHTML=`<div class="card">
    <div class="ch"><div class="ct">${label} — Max: ${hps||'Not set'}</div><div class="cs">${stuList.length} students</div></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:.45rem;margin-bottom:.9rem">
      ${stuList.map((s,i)=>{const g=(cd.grades[t]&&cd.grades[t][s.name])||{};let curVal='';if(cat==='te')curVal=g.te!==null&&g.te!==undefined?g.te:'';else if(cat==='ww')curVal=g.ww&&g.ww[itemIdx]!==null&&g.ww[itemIdx]!==undefined?g.ww[itemIdx]:'';else curVal=g.pt&&g.pt[itemIdx]!==null&&g.pt[itemIdx]!==undefined?g.pt[itemIdx]:'';
        return`<div style="display:flex;align-items:center;gap:.55rem;padding:.4rem .65rem;background:var(--surf);border:1px solid var(--bdr);border-radius:var(--rs)">
          <div style="width:20px;height:20px;border-radius:50%;background:${s.g==='male'?'var(--blue2)':'var(--pink2)'};display:flex;align-items:center;justify-content:center;font-size:.62rem;font-weight:700;color:${s.g==='male'?'var(--blue)':'var(--pink)'};flex-shrink:0">${i+1}</div>
          <div style="flex:1;font-size:.82rem;font-weight:500">${escH(s.name)}</div>
          <input type="number" min="0" max="${hps||999}" class="inp" id="be_inp_${i}" value="${curVal}" style="width:72px;font-family:'DM Mono',monospace;text-align:center" onclick="this.select()">
        </div>`;}).join('')}
    </div>
    <button class="btn bg" onclick="saveBulkEntry(${JSON.stringify(stuList.map(s=>s.name))},${t},'${cat}',${itemIdx})">✓ Save All Grades</button>
  </div>`;
}
function saveBulkEntry(names,t,cat,itemIdx){const cd=getCD();let saved=0,blank=0;names.forEach((name,i)=>{const inp=document.getElementById(`be_inp_${i}`);const val=inp?.value;if(!cd.grades[t])cd.grades[t]={};if(!cd.grades[t][name])cd.grades[t][name]={ww:Array(10).fill(null),pt:Array(10).fill(null),te:null};if(val===''||val===null){blank++;return;}const v=parseFloat(val);if(cat==='te')cd.grades[t][name].te=v;else if(cat==='ww')cd.grades[t][name].ww[itemIdx]=v;else cd.grades[t][name].pt[itemIdx]=v;saved++;});save();toast(`✓ Saved ${saved} grades (${blank} left blank)`);}

// ══════════════════════════════════════════════
// 12. SUMMARY MODULE
// ══════════════════════════════════════════════
function renderRBSummary(){
  const el=document.getElementById('rb-summary');
  if(!hasClass()){el.innerHTML='<div class="ws"><h2>Select a class first</h2></div>';return;}
  const cd=getCD();const stu=allStu();
  let rows='';let lastG=null;
  stu.forEach(s=>{
    if(s.g!==lastG){rows+=`<tr><td colspan="7" style="background:${s.g==='male'?'var(--blue2)':'var(--pink2)'};font-weight:700;font-size:.72rem;padding:.32rem .65rem;color:${s.g==='male'?'var(--blue)':'var(--pink)'}">${s.g==='male'?'👦 MALE':'👧 FEMALE'}</td></tr>`;lastG=s.g;}
    const num=(s.g==='male'?cd.students.male:cd.students.female).indexOf(s.name)+1;
    const t1=calcT(s.name,1).termGrade,t2=calcT(s.name,2).termGrade,t3=calcT(s.name,3).termGrade;
    const vt=[t1,t2,t3].filter(v=>v!==null);const final=vt.length?Math.round(vt.reduce((a,b)=>a+b,0)/vt.length):null;
    const rem=final!==null?(final>=75?'PASSED':'FAILED'):'';
    rows+=`<tr><td style="text-align:center;padding:.35rem;font-size:.72rem;color:var(--tx3)">${num}</td><td style="padding:.35rem .65rem;font-size:.85rem;font-weight:500">${escH(s.name)}</td>
      ${[t1,t2,t3].map(v=>`<td style="text-align:center;font-family:'DM Mono',monospace;font-weight:600;color:${v?(v>=75?'var(--green)':'var(--red)'):'var(--tx3)'}">${v||'—'}</td>`).join('')}
      <td style="text-align:center;font-family:'DM Mono',monospace;font-size:.92rem;font-weight:700;color:${final?(final>=75?'var(--blue)':'var(--red)'):'var(--tx3)'}">${final||'—'}</td>
      <td style="text-align:center">${rem?`<span class="${rem==='PASSED'?'bpass':'bfail'}">${rem}</span>`:''}</td></tr>`;
  });
  el.innerHTML=`<div class="ebar"><span class="elbl">Export:</span><button class="btn br bsm" onclick="pdfSummary()">📄 PDF</button><button class="btn bg bsm" onclick="excelGrades()">📊 Excel</button><button class="btn ba bsm" onclick="jsonExport()">📦 JSON for Advisory</button></div>
  <div class="card"><div class="ch"><div class="ct">Term Grade Summary</div><div class="cs">${escH(cd.school.subject||'Subject')} · ${APP.ac.grade} ${APP.ac.section} · SY ${APP.ac.sy}</div></div>
  <div style="overflow-x:auto"><table class="stbl"><thead><tr><th style="width:26px">#</th><th style="text-align:left;min-width:170px">Learner's Name</th>
    <th><span class="tag tt1">Term 1</span></th><th><span class="tag tt2">Term 2</span></th><th><span class="tag tt3">Term 3</span></th>
    <th>Final</th><th>Remark</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

// ══════════════════════════════════════════════
// 13. ANALYTICS MODULE
// ══════════════════════════════════════════════
function renderAnalytics(){
  const el=document.getElementById('rb-analytics');
  if(!hasClass()){el.innerHTML='<div class="ws"><h2>Select a class first</h2></div>';return;}
  el.innerHTML=`<div class="ebar"><span class="elbl">Filter:</span>
    <div class="ttabs">${['All Terms','Term 1','Term 2','Term 3'].map((l,i)=>`<button class="ttab2 ${i===APP.aq?`active-t${i||1}`:''}" onclick="selAQ(${i})">${l}</button>`).join('')}</div>
  </div><div id="analContent"></div>`;
  renderAnalContent();
}
function selAQ(q){APP.aq=q;save();renderAnalContent();}
function renderAnalContent(){
  const area=document.getElementById('analContent');if(!area)return;
  const stu=allStu();const cd=getCD();const q=APP.aq;
  if(!stu.length){area.innerHTML='<div class="ws"><h2>No students</h2></div>';return;}
  const stuWithGrade=[];const stuMissing=[];
  stu.forEach(s=>{
    let g=null;
    if(q===0){const vt=[1,2,3].map(t=>calcT(s.name,t).termGrade).filter(v=>v!==null);g=vt.length?Math.round(vt.reduce((a,b)=>a+b,0)/vt.length):null;}
    else{g=calcT(s.name,q).termGrade;}
    if(g!==null)stuWithGrade.push({name:s.name,gender:s.g,grade:g});
    else stuMissing.push({name:s.name,gender:s.g});
  });
  const grades=stuWithGrade.map(s=>s.grade);
  if(!grades.length){area.innerHTML=`<div class="card" style="border:2px solid var(--red)"><div class="ch"><div class="ct" style="color:var(--red)">⚠ No grades for ${q===0?'any term':'Term '+q}</div></div><div style="display:flex;flex-wrap:wrap;gap:.35rem">${stu.map(s=>`<span style="background:var(--red2);color:var(--red);padding:.18rem .55rem;border-radius:99px;font-size:.75rem">${escH(s.name)}</span>`).join('')}</div></div>`;return;}
  const avg=r2(grades.reduce((a,b)=>a+b,0)/grades.length);const hi=Math.max(...grades);const lo=Math.min(...grades);
  const pass=grades.filter(g=>g>=75).length;const fail=grades.filter(g=>g<75).length;const miss=stuMissing.length;
  const bands=[{l:'96–100',mn:96,mx:100,c:'#0d9488'},{l:'91–95',mn:91,mx:95,c:'#0284c7'},{l:'86–90',mn:86,mx:90,c:'#7c3aed'},{l:'81–85',mn:81,mx:85,c:'#d97706'},{l:'76–80',mn:76,mx:80,c:'#f59e0b'},{l:'75',mn:75,mx:75,c:'#84cc16'},{l:'Below 75',mn:0,mx:74,c:'#dc2626'}].map(b=>({...b,cnt:grades.filter(g=>g>=b.mn&&g<=b.mx).length,students:stuWithGrade.filter(s=>s.grade>=b.mn&&s.grade<=b.mx)}));
  const mx=Math.max(...bands.map(b=>b.cnt),1);
  window._analyticsBands=bands;window._analyticsQ=q;
  area.innerHTML=`
  <div class="ag4">
    <div class="sc"><div class="sn2" style="color:var(--blue)">${avg}</div><div class="sl2">Class Average</div></div>
    <div class="sc"><div class="sn2" style="color:var(--green)">${hi}</div><div class="sl2">Highest</div></div>
    <div class="sc"><div class="sn2" style="color:var(--red)">${lo}</div><div class="sl2">Lowest</div></div>
    <div class="sc"><div class="sn2" style="color:var(--amber)">${grades.length}/${stu.length}</div><div class="sl2">Graded</div></div>
  </div>
  <div class="g2" style="margin-bottom:.9rem">
    <div class="card">
      <div class="ch"><div class="ct">📊 Performance Bands</div><div class="cs">Click band to see students</div></div>
      ${bands.map((b,i)=>`<div class="brow" style="cursor:${b.cnt>0?'pointer':'default'}" onclick="${b.cnt>0?`showBandStudents(${i})`:''}"><div class="bla">${b.l}</div><div class="bbw"><div class="bb" style="width:${Math.round((b.cnt/mx)*100)}%;background:${b.c}"></div></div><div class="bcnt">${b.cnt}</div></div>`).join('')}
      ${miss>0?`<div class="brow"><div class="bla" style="color:var(--red);font-weight:600">⚠ Missing</div><div class="bbw"><div class="bb" style="width:${Math.round((miss/stu.length)*100)}%;background:#fee2e2"></div></div><div class="bcnt" style="color:var(--red);font-weight:600">${miss}</div></div>`:''}
    </div>
    <div class="card">
      <div class="ch"><div class="ct">✅ Pass / Fail</div></div>
      ${[{l:'Passing (≥75)',v:pass,c:'var(--green)'},{l:'Below 75',v:fail,c:'var(--red)'}].map(r=>`<div style="margin-bottom:.9rem"><div class="fl" style="margin-bottom:.35rem;justify-content:space-between"><span style="font-size:.82rem;color:${r.c};font-weight:600">${r.l}</span><span style="font-family:'DM Mono',monospace;font-size:.82rem">${r.v}/${grades.length}</span></div><div style="background:var(--bg);border-radius:99px;height:8px;overflow:hidden"><div style="height:100%;border-radius:99px;background:${r.c};width:${grades.length?Math.round((r.v/grades.length)*100):0}%"></div></div></div>`).join('')}
      <div class="g2"><div style="text-align:center;padding:.7rem;background:var(--blue2);border-radius:var(--rs)"><div style="font-size:.68rem;color:var(--blue);font-weight:600">Top (90+)</div><div style="font-size:1.4rem;font-weight:700;font-family:'DM Mono',monospace;color:var(--blue)">${grades.filter(g=>g>=90).length}</div></div>
      <div style="text-align:center;padding:.7rem;background:${miss>0?'var(--red2)':'var(--green2)'};border-radius:var(--rs)"><div style="font-size:.68rem;color:${miss>0?'var(--red)':'var(--green)'};font-weight:600">Missing</div><div style="font-size:1.4rem;font-weight:700;font-family:'DM Mono',monospace;color:${miss>0?'var(--red)':'var(--green)'}">${miss}</div></div></div>
    </div>
  </div>
  ${miss>0?`<div class="card" style="border:2px solid var(--red);margin-bottom:.9rem">
    <div class="ch"><div class="ct" style="color:var(--red)">⚠ Students with Missing Grades (${miss})</div><span style="background:var(--red2);color:var(--red);padding:.22rem .65rem;border-radius:99px;font-size:.78rem;font-weight:700">${miss}</span></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:.45rem;margin-bottom:.65rem">
      ${stuMissing.map((s,i)=>`<div style="display:flex;align-items:center;gap:.55rem;padding:.45rem .65rem;background:var(--red2);border:1px solid rgba(220,38,38,.2);border-radius:var(--rs)">
        <div style="width:20px;height:20px;border-radius:50%;background:var(--red);color:#fff;font-size:.65rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i+1}</div>
        <div style="flex:1"><div style="font-size:.82rem;font-weight:600">${escH(s.name)}</div><div style="font-size:.68rem;color:var(--tx3)">${s.gender==='male'?'Male':'Female'}</div></div>
        <button class="btn bsm" style="padding:.25rem .55rem;font-size:.68rem;background:var(--red);color:#fff;border:none" onclick="goToMissingStudent('${esc(s.name)}',${q===0?1:q})">Go →</button>
      </div>`).join('')}
    </div>
    <div style="padding:.55rem .7rem;background:var(--amber2);border-radius:var(--rs);font-size:.78rem;color:var(--amber);border-left:3px solid var(--amber)">💡 Click Go → to jump to that student's grade entry row.</div>
  </div>`:'<div class="card" style="border:2px solid var(--green);text-align:center;padding:1rem"><div style="font-size:1.3rem">✅</div><div style="font-size:.9rem;font-weight:600;color:var(--green)">All students have grades!</div></div>'}
  <div class="card"><div class="ch" style="cursor:pointer" onclick="toggleAnalStudentList()"><div><div class="ct">👤 Full Student Grade List</div><div class="cs">${grades.length} students, sorted highest to lowest</div></div><span id="analListToggle" style="font-size:.78rem;color:var(--blue);font-weight:600">▼ Show</span></div>
    <div id="analStudentList" style="display:none"><div style="overflow-x:auto"><table class="stbl"><thead><tr><th style="width:30px">#</th><th style="text-align:left">Name</th><th>Grade</th><th>Band</th><th>Remark</th></tr></thead>
    <tbody>${[...stuWithGrade].sort((a,b)=>b.grade-a.grade).map((s,i)=>{const band=bands.find(b=>s.grade>=b.mn&&s.grade<=b.mx);return`<tr><td style="text-align:center;font-family:'DM Mono',monospace;font-size:.72rem;color:var(--tx3)">${i+1}</td><td style="font-weight:500;font-size:.82rem">${escH(s.name)}</td><td style="text-align:center;font-family:'DM Mono',monospace;font-size:.88rem;font-weight:700;color:${s.grade>=75?'var(--green)':'var(--red)'}">${s.grade}</td><td style="text-align:center"><span style="font-size:.68rem;font-weight:600;padding:.12rem .45rem;border-radius:99px;background:${band?band.c+'22':''};color:${band?band.c:''}">${band?band.l:'—'}</span></td><td style="text-align:center"><span class="${s.grade>=75?'bpass':'bfail'}">${s.grade>=75?'PASSED':'FAILED'}</span></td></tr>`;}).join('')}</tbody></table></div></div>
  </div>`;
}
function toggleAnalStudentList(){const el=document.getElementById('analStudentList');const tog=document.getElementById('analListToggle');if(!el||!tog)return;const open=el.style.display==='none';el.style.display=open?'block':'none';tog.textContent=open?'▲ Hide':'▼ Show';}
function showBandStudents(i){if(!window._analyticsBands)return;const b=window._analyticsBands[i];if(!b||!b.students.length)return;const q=window._analyticsQ;const html=`<div style="margin-bottom:.65rem;font-size:.85rem;color:var(--tx2)">${b.students.length} student${b.students.length>1?'s':''} — <strong>${b.l}</strong></div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.45rem">${b.students.map(s=>`<div style="display:flex;align-items:center;gap:.55rem;padding:.45rem .65rem;background:${b.c}22;border:1px solid ${b.c}55;border-radius:var(--rs)"><div style="width:34px;height:34px;border-radius:50%;background:${b.c};color:#fff;font-size:.85rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${s.grade}</div><div><div style="font-size:.85rem;font-weight:600">${escH(s.name)}</div><div style="font-size:.68rem;color:var(--tx3)">${s.gender==='male'?'Male':'Female'}</div></div></div>`).join('')}</div>`;const cd=getCD();openModal(`${b.l} — ${b.students.length} Student${b.students.length>1?'s':''}`,`${escH(cd.school.subject||'')} · ${q===0?'Final':'Term '+q}`,html);}
function goToMissingStudent(name,t){APP.gt=t;APP.hlStudent=name;showRB('gradeentry');showPage('recordbook');toast('📍 Jumping to '+name);}

// ══════════════════════════════════════════════
// 14. LOA REPORTS MODULE
// ══════════════════════════════════════════════
function renderLOA(){
  const el=document.getElementById('rb-loa');
  if(!hasClass()){el.innerHTML='<div class="ws"><h2>Select a class first</h2></div>';return;}
  const cd=getCD();const t=APP.gt;
  const termTabs=`<div class="ttabs">${[1,2,3].map(ti=>`<button class="ttab2 ${ti===t?`active-t${ti}`:''}" onclick="setActiveTerm(${ti})">${TERM_DATES[ti].name}</button>`).join('')}</div>`;
  el.innerHTML=`<div class="ebar"><span class="elbl">Export:</span><button class="btn br bsm" onclick="pdfLOA()">📄 PDF</button><button class="btn bg bsm" onclick="excelLOA()">📊 LOA Excel</button><div class="sp"></div><span style="font-size:.72rem;color:var(--tx3)">Auto-computed from grade entries</span></div>
  <div class="card" style="margin-bottom:.9rem"><div class="ch"><div class="ct">📋 Diagnostic Test Configuration</div></div>
    <div class="g3">
      <div><div class="lbl">Number of Items</div><input class="inp" type="number" min="0" id="diag_items" value="${cd.diag?.items||''}" placeholder="50" onchange="saveDiag()"></div>
      <div><div class="lbl">Highest Score</div><input class="inp" type="number" min="0" id="diag_hso" value="${cd.diag?.hso||''}" placeholder="48" onchange="saveDiag()"></div>
      <div><div class="lbl">Lowest Score</div><input class="inp" type="number" min="0" id="diag_lso" value="${cd.diag?.lso||''}" placeholder="12" onchange="saveDiag()"></div>
    </div>
  </div>
  ${termTabs}
  <div id="loaContent"></div>`;
  renderLOAContent();
}
function saveDiag(){const cd=getCD();cd.diag={items:parseFloat(document.getElementById('diag_items').value)||0,hso:parseFloat(document.getElementById('diag_hso').value)||0,lso:parseFloat(document.getElementById('diag_lso').value)||0};save();renderLOAContent();}
function renderLOAContent(){
  const area=document.getElementById('loaContent');if(!area)return;
  const cd=getCD();const stu=allStu();const t=APP.gt;const h=cd.hps[t];
  if(!stu.length){area.innerHTML='<div class="ws"><h2>No students</h2></div>';return;}
  const section=`${APP.ac.grade} – ${APP.ac.section}`;
  function profBands(scores){const r={np:0,lp:0,np2:0,p:0,hp:0,miss:0};scores.forEach(v=>{if(v===null)r.miss++;else if(v>=90)r.hp++;else if(v>=75)r.p++;else if(v>=50)r.np2++;else if(v>=25)r.lp++;else r.np++;});return r;}
  function descBands(scores){const r={dnm:0,fs:0,s:0,vs:0,o1:0,o2:0,o3:0,miss:0};scores.forEach(v=>{if(v===null)r.miss++;else if(v>=98)r.o3++;else if(v>=95)r.o2++;else if(v>=90)r.o1++;else if(v>=85)r.vs++;else if(v>=80)r.s++;else if(v>=75)r.fs++;else r.dnm++;});return r;}
  function pct(n,tot){return tot?r2((n/tot)*100):0}
  const stuData=stu.map(s=>({name:s.name,g:s.g,c:calcT(s.name,t)}));
  const wwPS=stuData.map(s=>s.c.wwPS);const ptPS=stuData.map(s=>s.c.ptPS);const tePS=stuData.map(s=>s.c.tePS);const tGrades=stuData.map(s=>s.c.termGrade);
  const wwBands=profBands(wwPS);const ptBands=descBands(ptPS);const teBands=profBands(tePS);const tgBands=descBands(tGrades);
  const N=stu.length;
  function profHdr(){return`<tr><th colspan="2" class="loa-np">Not Proficient (0–24%)</th><th colspan="2" class="loa-lp">Low Proficient (25–49%)</th><th colspan="2" class="loa-nep">Nearly Proficient (50–74%)</th><th colspan="2" class="loa-p">Proficient (75–89%)</th><th colspan="2" class="loa-hp">Highly Proficient (90–100%)</th></tr><tr>${['No.','%','No.','%','No.','%','No.','%','No.','%'].map(h=>`<th>${h}</th>`).join('')}</tr>`;}
  function descHdr(){return`<tr><th colspan="2" style="background:#fee2e2;color:#991b1b">Did Not Meet (≤74%)</th><th colspan="2" style="background:#fef9c3;color:#713f12">Fairly Satisfactory (75–79%)</th><th colspan="2" style="background:#dcfce7;color:#14532d">Satisfactory (80–84%)</th><th colspan="2" style="background:#d1fae5;color:#065f46">Very Satisfactory (85–89%)</th><th colspan="6" style="background:#dbeafe;color:#1e40af">Outstanding</th></tr><tr>${['No.','%','No.','%','No.','%','No.','%'].map(h=>`<th>${h}</th>`).join('')}<th colspan="2" style="font-size:.62rem">90–94%</th><th colspan="2" style="font-size:.62rem">95–97%</th><th colspan="2" style="font-size:.62rem">98–100%</th></tr>`;}
  function profRow(b,N){return`<td>${b.np}</td><td>${pct(b.np,N)}%</td><td>${b.lp}</td><td>${pct(b.lp,N)}%</td><td>${b.np2}</td><td>${pct(b.np2,N)}%</td><td>${b.p}</td><td>${pct(b.p,N)}%</td><td>${b.hp}</td><td>${pct(b.hp,N)}%</td>`;}
  function descRow(b,N){return`<td>${b.dnm}</td><td>${pct(b.dnm,N)}%</td><td>${b.fs}</td><td>${pct(b.fs,N)}%</td><td>${b.s}</td><td>${pct(b.s,N)}%</td><td>${b.vs}</td><td>${pct(b.vs,N)}%</td><td>${b.o1}</td><td>${pct(b.o1,N)}%</td><td>${b.o2}</td><td>${pct(b.o2,N)}%</td><td>${b.o3}</td><td>${pct(b.o3,N)}%</td>`;}
  const diagItems=cd.diag?.items||0;const diagHSO=cd.diag?.hso||0;const diagMPS=diagItems?r2((diagHSO/diagItems)*100):0;
  const wwHT=h.ww.reduce((a,v)=>a+(v||0),0);const wwValid=wwPS.filter(v=>v!==null);const wwHSO=wwValid.length?Math.max(...wwValid):0;const wwLSO=wwValid.length?Math.min(...wwValid):0;const wwMean=wwValid.length?r2(wwValid.reduce((a,b)=>a+b,0)/wwValid.length):0;
  area.innerHTML=`
  <div style="font-size:.78rem;font-weight:600;color:var(--tx2);margin-bottom:.85rem;padding:.5rem .75rem;background:var(--surf2);border-radius:var(--rs);border:1px solid var(--bdr)">
    📊 ${escH(cd.school.subject||'Subject')} · ${section} · <span class="tag tt${t}">Term ${t}</span> · ${escH(cd.school.teacher||'Teacher')} · SY ${APP.ac.sy}
  </div>
  <div class="card" style="margin-bottom:.9rem">
    <div class="loa-group-hdr" style="background:var(--blue2);color:var(--blue)">📝 Section 1 — Diagnostic Test Results</div>
    <div style="overflow-x:auto"><table class="loa-full-table"><thead><tr><th class="sec-col" rowspan="3">Section</th><th rowspan="3">Learners</th><th rowspan="3">Items</th><th rowspan="3">HSO</th><th rowspan="3">LSO</th><th rowspan="3">MPS%</th>${profHdr()}</thead>
    <tbody><tr><td class="sec-col">${section}</td><td>${N}</td><td>${diagItems}</td><td>${diagHSO}</td><td>${cd.diag?.lso||0}</td><td>${diagMPS}%</td>${profRow(wwBands,N)}</tr>
    <tr class="total-row"><td class="sec-col">Total</td><td>${N}</td><td>${diagItems}</td><td>${diagHSO}</td><td>${cd.diag?.lso||0}</td><td>${diagMPS}%</td>${profRow(wwBands,N)}</tr></tbody></table></div>
  </div>
  <div class="card" style="margin-bottom:.9rem">
    <div class="loa-group-hdr" style="background:var(--amber2);color:var(--amber)">✏️ Section 2 — Written Works (30%)</div>
    <div style="overflow-x:auto"><table class="loa-full-table"><thead><tr><th class="sec-col" rowspan="3">Section</th><th rowspan="3">Learners</th><th rowspan="3">HPS</th><th rowspan="3">HSO%</th><th rowspan="3">LSO%</th><th rowspan="3">Mean%</th><th rowspan="3">MPS%</th>${profHdr()}</thead>
    <tbody><tr><td class="sec-col">${section}</td><td>${N}</td><td>${wwHT}</td><td>${wwHSO.toFixed(1)}%</td><td>${wwLSO.toFixed(1)}%</td><td>${wwMean}%</td><td>${wwMean}%</td>${profRow(wwBands,N)}</tr>
    <tr class="total-row"><td class="sec-col">Total</td><td>${N}</td><td>${wwHT}</td><td>${wwHSO.toFixed(1)}%</td><td>${wwLSO.toFixed(1)}%</td><td>${wwMean}%</td><td>${wwMean}%</td>${profRow(wwBands,N)}</tr></tbody></table></div>
  </div>
  <div class="card" style="margin-bottom:.9rem">
    <div class="loa-group-hdr" style="background:var(--green2);color:var(--green)">🎯 Section 3 — Performance Tasks (50%) — Descriptor Bands</div>
    <div style="overflow-x:auto"><table class="loa-full-table"><thead><tr><th class="sec-col" rowspan="3">Section</th><th rowspan="3">Learners</th>${descHdr()}</thead>
    <tbody><tr><td class="sec-col">${section}</td><td>${N}</td>${descRow(ptBands,N)}</tr>
    <tr class="total-row"><td class="sec-col">Total</td><td>${N}</td>${descRow(ptBands,N)}</tr></tbody></table></div>
  </div>
  ${h.te?`<div class="card" style="margin-bottom:.9rem"><div class="loa-group-hdr" style="background:var(--purple2);color:var(--purple)">📄 Section 4 — Term Examination (20%)</div>
    <div style="overflow-x:auto"><table class="loa-full-table"><thead><tr><th class="sec-col" rowspan="3">Section</th><th rowspan="3">Learners</th><th rowspan="3">HPS</th>${profHdr()}</thead>
    <tbody><tr><td class="sec-col">${section}</td><td>${N}</td><td>${h.te}</td>${profRow(teBands,N)}</tr>
    <tr class="total-row"><td class="sec-col">Total</td><td>${N}</td><td>${h.te}</td>${profRow(teBands,N)}</tr></tbody></table></div>
  </div>`:''}
  <div class="card"><div class="loa-group-hdr" style="background:var(--teal2);color:var(--teal)">🎓 Section 5 — Term ${t} Grades (Transmuted) — Descriptor Bands</div>
    <div style="overflow-x:auto"><table class="loa-full-table"><thead><tr><th class="sec-col" rowspan="3">Section</th><th rowspan="3">Learners</th>${descHdr()}</thead>
    <tbody><tr><td class="sec-col">${section}</td><td>${N}</td>${descRow(tgBands,N)}</tr>
    <tr class="total-row"><td class="sec-col">Total</td><td>${N}</td>${descRow(tgBands,N)}</tr></tbody></table></div>
  </div>`;
}
function excelLOA(){toast('Use the main Excel export for LOA data — it includes a dedicated LOA SUMMARY sheet.');excelGrades();}

// ══════════════════════════════════════════════
// 15. GRADE SUMMARY PAGE
// ══════════════════════════════════════════════
function showGSTab(tab){
  const tabMap={table:'gstabTable',loa:'gstabLOA',student:'gstabStudent'};
  const btnMap={table:'gsTbl',loa:'gsLOA',student:'gsStud'};
  ['table','loa','student'].forEach(t=>{const el=document.getElementById(tabMap[t]);if(el)el.style.display=t===tab?'block':'none';const btn=document.getElementById(btnMap[t]);if(btn)btn.classList.toggle('active',t===tab);});
  if(tab==='loa')renderGSLOA();if(tab==='student')renderGSStudent();
}
function renderGradeSummaryPage(){
  const el=document.getElementById('gradeSummaryCard');
  if(!hasClass()){el.innerHTML='<div class="ws"><h2>Select a class first</h2></div>';return;}
  const cd=getCD();const stu=allStu();let rows='';let lastG=null;
  stu.forEach(s=>{
    if(s.g!==lastG){rows+=`<tr><td colspan="8" style="background:${s.g==='male'?'var(--blue2)':'var(--pink2)'};font-weight:700;font-size:.72rem;padding:.3rem .65rem;color:${s.g==='male'?'var(--blue)':'var(--pink)'}">${s.g==='male'?'👦 MALE':'👧 FEMALE'}</td></tr>`;lastG=s.g;}
    const num=(s.g==='male'?cd.students.male:cd.students.female).indexOf(s.name)+1;
    const t1=calcT(s.name,1).termGrade,t2=calcT(s.name,2).termGrade,t3=calcT(s.name,3).termGrade;
    const vt=[t1,t2,t3].filter(v=>v!==null);const final=vt.length?Math.round(vt.reduce((a,b)=>a+b,0)/vt.length):null;const rem=final!==null?(final>=75?'PASSED':'FAILED'):'';
    rows+=`<tr><td style="text-align:center;font-size:.72rem;color:var(--tx3)">${num}</td><td style="padding:.35rem .65rem;font-size:.85rem;font-weight:500">${escH(s.name)}</td>${[t1,t2,t3].map(v=>`<td style="text-align:center;font-family:'DM Mono',monospace;font-weight:600;color:${v?(v>=75?'var(--green)':'var(--red)'):'var(--tx3)'}">${v||'—'}</td>`).join('')}<td style="text-align:center;font-family:'DM Mono',monospace;font-size:.92rem;font-weight:700;color:${final?(final>=75?'var(--blue)':'var(--red)'):'var(--tx3)'}">${final||'—'}</td><td style="text-align:center">${rem?`<span class="${rem==='PASSED'?'bpass':'bfail'}">${rem}</span>`:''}</td></tr>`;
  });
  el.innerHTML=`<div style="font-size:.72rem;color:var(--tx3);margin-bottom:.7rem">${escH(cd.school.subject||'—')} · ${APP.ac.grade} ${APP.ac.section} · ${escH(cd.school.teacher||'—')} · SY ${APP.ac.sy}</div>
  <div style="overflow-x:auto"><table class="stbl"><thead><tr><th style="width:26px">#</th><th style="text-align:left;min-width:170px">Learner's Name</th><th style="text-align:center"><span class="tag tt1">Term 1</span></th><th style="text-align:center"><span class="tag tt2">Term 2</span></th><th style="text-align:center"><span class="tag tt3">Term 3</span></th><th style="text-align:center">Final</th><th style="text-align:center">Remark</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function renderGSLOA(){
  const el=document.getElementById('gsLOAContent');if(!hasClass()||!el)return;
  const cd=getCD();const stu=allStu();const N=stu.length;
  if(!N){el.innerHTML='<div class="ws"><h2>No students</h2></div>';return;}
  const section=`${APP.ac.grade} – ${APP.ac.section}`;
  function descB(scores){const r={dnm:0,fs:0,s:0,vs:0,o1:0,o2:0,o3:0,miss:0};scores.forEach(v=>{if(v===null||v===undefined){r.miss++;return;}if(v>=98)r.o3++;else if(v>=95)r.o2++;else if(v>=90)r.o1++;else if(v>=85)r.vs++;else if(v>=80)r.s++;else if(v>=75)r.fs++;else r.dnm++;});return r;}
  function pct(n,t){return t?r2((n/t)*100):0}
  const finals=stu.map(s=>{const vt=[1,2,3].map(t=>calcT(s.name,t).termGrade).filter(v=>v!==null);return vt.length?Math.round(vt.reduce((a,b)=>a+b,0)/vt.length):null;});
  const fb=descB(finals);const pass=finals.filter(v=>v!==null&&v>=75).length;const wg=finals.filter(v=>v!==null).length;const avg=wg?r2(finals.filter(v=>v!==null).reduce((a,b)=>a+b,0)/wg):0;
  const tSum=[1,2,3].map(t=>{const tg=stu.map(s=>calcT(s.name,t).termGrade);const vld=tg.filter(v=>v!==null);const qb=descB(tg);return{t,avg:vld.length?r2(vld.reduce((a,b)=>a+b,0)/vld.length):null,pass:vld.filter(v=>v>=75).length,fail:vld.filter(v=>v<75).length,total:vld.length,b:qb};});
  const bDefs=[{k:'dnm',lb:'Did Not Meet',rng:'≤74',clr:'#991b1b',bg:'#fee2e2'},{k:'fs',lb:'Fairly Satisfactory',rng:'75–79',clr:'#92400e',bg:'#fef3c7'},{k:'s',lb:'Satisfactory',rng:'80–84',clr:'#14532d',bg:'#dcfce7'},{k:'vs',lb:'Very Satisfactory',rng:'85–89',clr:'#065f46',bg:'#d1fae5'},{k:'o1',lb:'Outstanding',rng:'90–94',clr:'#1e40af',bg:'#dbeafe'},{k:'o2',lb:'Outstanding',rng:'95–97',clr:'#1d4ed8',bg:'#bfdbfe'},{k:'o3',lb:'Outstanding',rng:'98–100',clr:'#1e3a8a',bg:'#93c5fd'}];
  el.innerHTML=`<div style="font-size:.78rem;color:var(--tx2);padding:.5rem .75rem;background:var(--surf2);border:1px solid var(--bdr);border-radius:var(--rs);margin-bottom:.9rem;font-weight:500">📊 LOA Overview — ${escH(cd.school.subject||'Subject')} · ${escH(section)} · SY ${APP.ac.sy}</div>
  <div class="ag4"><div class="sc"><div class="sn2" style="color:var(--blue)">${avg}</div><div class="sl2">Overall Avg</div></div><div class="sc"><div class="sn2" style="color:var(--green)">${pass}</div><div class="sl2">Passing</div></div><div class="sc"><div class="sn2" style="color:var(--red)">${N-pass}</div><div class="sl2">Below 75</div></div><div class="sc"><div class="sn2" style="color:var(--tx2)">${wg}/${N}</div><div class="sl2">With Final Grade</div></div></div>
  <div class="card" style="margin-bottom:.9rem"><div class="ch"><div class="ct">Final Grade Distribution</div></div>
    <div style="overflow-x:auto"><table class="loa-full-table"><thead><tr><th class="sec-col" rowspan="2">Section</th><th rowspan="2">Learners</th>${bDefs.map(b=>`<th colspan="2" style="background:${b.bg};color:${b.clr};font-size:.62rem">${b.lb}<br><span style="font-weight:400">${b.rng}</span></th>`).join('')}</tr><tr>${bDefs.map(()=>'<th style="font-size:.62rem">No.</th><th style="font-size:.62rem">%</th>').join('')}</tr></thead>
    <tbody><tr><td class="sec-col">${escH(section)}</td><td>${N}</td>${bDefs.map(b=>`<td>${fb[b.k]||0}</td><td>${pct(fb[b.k]||0,N)}%</td>`).join('')}</tr><tr class="total-row"><td class="sec-col">Total</td><td>${N}</td>${bDefs.map(b=>`<td>${fb[b.k]||0}</td><td>${pct(fb[b.k]||0,N)}%</td>`).join('')}</tr></tbody></table></div>
  </div>
  <div class="g3">${tSum.map(ts=>`<div class="card"><div class="ch"><div class="ct"><span class="tag tt${ts.t}">Term ${ts.t}</span></div><div class="cs">${ts.total} graded</div></div>
    <div style="display:flex;gap:.5rem;margin-bottom:.7rem">
      <div style="flex:1;text-align:center;padding:.45rem;background:var(--blue2);border-radius:var(--rs)"><div style="font-size:.62rem;color:var(--blue);font-weight:600">Avg</div><div style="font-size:1.1rem;font-weight:700;font-family:'DM Mono',monospace;color:var(--blue)">${ts.avg||'—'}</div></div>
      <div style="flex:1;text-align:center;padding:.45rem;background:var(--green2);border-radius:var(--rs)"><div style="font-size:.62rem;color:var(--green);font-weight:600">Pass</div><div style="font-size:1.1rem;font-weight:700;font-family:'DM Mono',monospace;color:var(--green)">${ts.pass}</div></div>
      <div style="flex:1;text-align:center;padding:.45rem;background:var(--red2);border-radius:var(--rs)"><div style="font-size:.62rem;color:var(--red);font-weight:600">Fail</div><div style="font-size:1.1rem;font-weight:700;font-family:'DM Mono',monospace;color:var(--red)">${ts.fail}</div></div>
    </div>
    ${bDefs.map(b=>`<div style="display:flex;align-items:center;gap:4px;padding:.18rem 0;border-bottom:1px solid var(--bdr)"><div style="width:7px;height:7px;border-radius:2px;background:${b.bg};border:1px solid ${b.clr};flex-shrink:0"></div><div style="font-size:.68rem;flex:1;color:var(--tx2)">${b.lb} <span style="color:var(--tx4)">${b.rng}</span></div><div style="font-family:'DM Mono',monospace;font-size:.72rem;font-weight:600;width:20px;text-align:right">${ts.b[b.k]||0}</div><div style="font-size:.65rem;color:var(--tx3);width:28px;text-align:right">${pct(ts.b[b.k]||0,N)}%</div></div>`).join('')}
  </div>`).join('')}</div>`;
}
function renderGSStudent(){
  const el=document.getElementById('gsStudContent');if(!el)return;
  if(!hasClass()){el.innerHTML='<div class="ws"><h2>Select a class first</h2></div>';return;}
  const cd=getCD();
  el.innerHTML=`<div class="card" style="margin-bottom:.9rem"><div class="ch"><div class="ct">Student Detail</div></div><div class="fl">
    <div><div class="lbl">Term</div><select class="inp" id="gssdT" style="width:100px" onchange="renderGSSD()"><option value="1">Term 1</option><option value="2">Term 2</option><option value="3">Term 3</option></select></div>
    <div><div class="lbl">Student</div><select class="inp" id="gssdName" style="width:260px" onchange="renderGSSD()"><option value="">-- Select --</option>${cd.students.male.map(n=>`<option>[M] ${escH(n)}</option>`).join('')}${cd.students.female.map(n=>`<option>[F] ${escH(n)}</option>`).join('')}</select></div>
    <button class="btn bp bsm" onclick="goToStudRow2()">📍 Go to Row</button>
  </div></div>
  <div id="gssdArea"><div class="ws"><h2>Select a student above</h2></div></div>`;
}
function renderGSSD(){
  const rawVal=document.getElementById('gssdName')?.value;const name=rawVal?rawVal.replace(/^\[.\] /,''):'';
  const t=parseInt(document.getElementById('gssdT')?.value||'1');
  const area=document.getElementById('gssdArea');if(!area||!name)return;
  const cd=getCD();const h=cd.hps[t];const g=(cd.grades[t]&&cd.grades[t][name])||{};
  const ww=g.ww||Array(10).fill(null);const pt=g.pt||Array(10).fill(null);const te=g.te!==undefined?g.te:null;
  const c=calcT(name,t);const wwC=Math.max(h.ww.filter(v=>v).length,1);const ptC=Math.max(h.pt.filter(v=>v).length,1);
  const allT=[1,2,3].map(ti=>({t:ti,c:calcT(name,ti)}));const vt=allT.map(a=>a.c.termGrade).filter(v=>v!==null);const final=vt.length?Math.round(vt.reduce((a,b)=>a+b,0)/vt.length):null;
  area.innerHTML=`<div class="card"><div class="ch"><div><div class="ct">${escH(name)}</div><div class="cs">${APP.ac.grade} ${APP.ac.section} · Term ${t}</div></div>
    <div class="fl">${allT.map(a=>`<div style="text-align:center;padding:.5rem .85rem;background:${a.t===t?`var(--term${a.t}-2)`:'var(--surf2)'};border:${a.t===t?`2px solid var(--term${a.t})`:'1px solid var(--bdr)'};border-radius:var(--rs)"><div style="font-size:.62rem;color:${a.t===t?`var(--term${a.t})`:'var(--tx3)'};font-weight:700">Term ${a.t}</div><div style="font-size:1.1rem;font-weight:700;font-family:'DM Mono',monospace;color:${a.c.termGrade?(a.c.termGrade>=75?'var(--green)':'var(--red)'):'var(--tx3)'}">${a.c.termGrade||'—'}</div></div>`).join('')}
    <div style="text-align:center;padding:.5rem .85rem;background:var(--blue2);border:2px solid var(--blue);border-radius:var(--rs)"><div style="font-size:.62rem;color:var(--blue);font-weight:700">FINAL</div><div style="font-size:1.2rem;font-weight:700;font-family:'DM Mono',monospace;color:${final?(final>=75?'var(--green)':'var(--red)'):'var(--tx3)'}">${final||'—'}</div>${final?`<div style="font-size:.62rem;color:${final>=75?'var(--green)':'var(--red)'};font-weight:700">${final>=75?'PASSED':'FAILED'}</div>`:''}</div></div></div>
    <div style="margin-bottom:.8rem"><div class="fl" style="margin-bottom:.4rem"><span class="tag tb">WW (30%)</span><span style="font-size:.75rem;color:var(--tx2)">Total: ${c.wwT!==null?c.wwT:'—'} · PS: ${c.wwPS!==null?c.wwPS:'—'}% · WS: ${c.wwWS!==null?c.wwWS:'—'}</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:3px">${Array.from({length:wwC},(_,i)=>`<div style="text-align:center;padding:.3rem .2rem;border:1px solid var(--bdr);border-radius:var(--rss);min-width:44px;background:var(--surf)"><div style="font-size:.62rem;color:var(--tx3)">WW${i+1}${h.ww[i]?'<br>/'+h.ww[i]:''}</div><div style="font-size:.85rem;font-weight:600;font-family:'DM Mono',monospace">${ww[i]!==null&&ww[i]!==undefined?ww[i]:'—'}</div></div>`).join('')}</div></div>
    <div style="margin-bottom:.8rem"><div class="fl" style="margin-bottom:.4rem"><span class="tag ta">PT (50%)</span><span style="font-size:.75rem;color:var(--tx2)">Total: ${c.ptT!==null?c.ptT:'—'} · PS: ${c.ptPS!==null?c.ptPS:'—'}% · WS: ${c.ptWS!==null?c.ptWS:'—'}</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:3px">${Array.from({length:ptC},(_,i)=>`<div style="text-align:center;padding:.3rem .2rem;border:1px solid var(--bdr);border-radius:var(--rss);min-width:44px;background:var(--surf)"><div style="font-size:.62rem;color:var(--tx3)">PT${i+1}${h.pt[i]?'<br>/'+h.pt[i]:''}</div><div style="font-size:.85rem;font-weight:600;font-family:'DM Mono',monospace">${pt[i]!==null&&pt[i]!==undefined?pt[i]:'—'}</div></div>`).join('')}</div></div>
    ${h.te?`<div style="margin-bottom:.8rem"><div class="fl" style="margin-bottom:.4rem"><span class="tag tg">Term Exam (20%)</span><span style="font-size:.75rem;color:var(--tx2)">Score: ${te!==null?te:'—'} / ${h.te} · PS: ${c.tePS!==null?c.tePS:'—'}% · WS: ${c.teWS!==null?c.teWS:'—'}</span></div></div>`:''}
    <div style="padding:.65rem .9rem;background:var(--surf2);border-radius:var(--r);border:1px solid var(--bdr);display:flex;gap:.9rem;flex-wrap:wrap">${[['WW WS',c.wwWS],['PT WS',c.ptWS],['TE WS',c.teWS],['Initial',c.initial]].map(([l,v])=>`<div><div style="font-size:.65rem;color:var(--tx3)">${l}</div><div style="font-size:.85rem;font-weight:600;font-family:'DM Mono',monospace">${v!==null?v:'—'}</div></div>`).join('')}
    <div><div style="font-size:.65rem;color:var(--tx3)">Term ${t} Grade</div><div style="font-size:1.15rem;font-weight:700;font-family:'DM Mono',monospace;color:${c.termGrade?(c.termGrade>=75?'var(--green)':'var(--red)'):'var(--tx3)'}">${c.termGrade||'—'}</div></div></div>
  </div>`;
}
function goToStudRow2(){const rawVal=document.getElementById('gssdName')?.value;const name=rawVal?rawVal.replace(/^\[.\] /,''):'';const t=parseInt(document.getElementById('gssdT')?.value||'1');if(!name){toast('Select a student');return;}APP.gt=t;APP.hlStudent=name;showRB('gradeentry');showPage('recordbook');}

// ══════════════════════════════════════════════
// 16. DAILY ATTENDANCE
// ══════════════════════════════════════════════
function renderDailyAtt(){
  const el=document.getElementById('dailyAttContent');
  if(!hasClass()){el.innerHTML='<div class="ws"><h2>Select a class first</h2></div>';return;}
  const cd=getCD();const stu=allStu();const ds=APP.attDate||today();const att=cd.att[ds]||{};
  let P=0,A=0,L=0;stu.forEach(s=>{const st=att[s.name]||'';if(st==='P')P++;else if(st==='A')A++;else if(st==='L')L++;});
  let rows='';let lastG=null;
  stu.forEach((s,i)=>{
    if(s.g!==lastG){rows+=`<div style="grid-column:1/-1;padding:.28rem .55rem;background:${s.g==='male'?'var(--blue2)':'var(--pink2)'};border-radius:var(--rs);font-size:.68rem;font-weight:700;color:${s.g==='male'?'var(--blue)':'var(--pink)'}">${s.g==='male'?'👦 MALE':'👧 FEMALE'}</div>`;lastG=s.g;}
    const num=(s.g==='male'?cd.students.male:cd.students.female).indexOf(s.name)+1;const st=att[s.name]||'';
    rows+=`<div class="acard"><span class="anum">${num}</span><span class="aname">${escH(s.name)}</span><div class="atog">
      <button class="abtn ${st==='P'?'pres':'off'}" onclick="setAtt('${esc(s.name)}','${ds}','${st==='P'?'':'P'}')">P</button>
      <button class="abtn ${st==='A'?'abs':'off'}" onclick="setAtt('${esc(s.name)}','${ds}','${st==='A'?'':'A'}')">A</button>
      <button class="abtn ${st==='L'?'late':'off'}" onclick="setAtt('${esc(s.name)}','${ds}','${st==='L'?'':'L'}')">L</button>
    </div></div>`;
  });
  el.innerHTML=`<div class="ebar"><span class="elbl">📅 Daily Attendance</span><div class="sp"></div><button class="btn br bsm" onclick="pdfDailyAtt('${ds}')">📄 PDF</button></div>
  <div class="card" style="margin-bottom:.9rem"><div class="fl">
    <div><div class="lbl">Date</div><input type="date" class="inp" id="attDate" value="${ds}" style="width:155px" onchange="APP.attDate=this.value;save();renderDailyAtt()"></div>
    <button class="btn bp bsm" onclick="markAllP('${ds}')">✓ All Present</button>
    <button class="btn bo bsm" onclick="clearDay('${ds}')">Clear Day</button>
    <button class="btn bg bsm" onclick="save();toast('✓ Saved')">💾 Save</button>
    <div class="sp"></div>
    <div style="display:flex;gap:.5rem">
      <div class="astat"><div class="astn" style="color:var(--green)">${P}</div><div class="astl">Present</div></div>
      <div class="astat"><div class="astn" style="color:var(--red)">${A}</div><div class="astl">Absent</div></div>
      <div class="astat"><div class="astn" style="color:var(--amber)">${L}</div><div class="astl">Late</div></div>
      <div class="astat"><div class="astn" style="color:var(--tx3)">${stu.length}</div><div class="astl">Total</div></div>
    </div>
  </div></div>
  <div class="agrid">${rows}</div>`;
}
function setAtt(name,ds,status){const cd=getCD();if(!cd.att[ds])cd.att[ds]={};if(status==='')delete cd.att[ds][name];else cd.att[ds][name]=status;save();renderDailyAtt();}
function markAllP(ds){const cd=getCD();const stu=allStu();if(!cd.att[ds])cd.att[ds]={};stu.forEach(s=>cd.att[ds][s.name]='P');save();renderDailyAtt();}
function clearDay(ds){const cd=getCD();delete cd.att[ds];save();renderDailyAtt();}

// ══════════════════════════════════════════════
// 17. ATTENDANCE SUMMARY
// ══════════════════════════════════════════════
function renderAttSum(){
  const el=document.getElementById('attSumContent');
  if(!hasClass()){el.innerHTML='<div class="ws"><h2>Select a class first</h2></div>';return;}
  const cd=getCD();const stu=allStu();const dates=Object.keys(cd.att).sort().slice(-20);
  if(!dates.length){el.innerHTML='<div class="ws"><h2>No attendance records yet</h2></div>';return;}
  let rows='';let lastG=null;
  stu.forEach(s=>{
    if(s.g!==lastG){rows+=`<tr><td colspan="${dates.length+5}" style="background:${s.g==='male'?'var(--blue2)':'var(--pink2)'};font-weight:700;font-size:.68rem;padding:.28rem .55rem;color:${s.g==='male'?'var(--blue)':'var(--pink)'}">${s.g==='male'?'👦 MALE':'👧 FEMALE'}</td></tr>`;lastG=s.g;}
    const num=(s.g==='male'?cd.students.male:cd.students.female).indexOf(s.name)+1;
    let P=0,A=0,L=0;const cells=dates.map(d=>{const st=(cd.att[d]||{})[s.name]||'';if(st==='P')P++;else if(st==='A')A++;else if(st==='L')L++;return`<td style="text-align:center;color:${st==='P'?'var(--green)':st==='A'?'var(--red)':st==='L'?'var(--amber)':'var(--tx4)'};font-weight:600;font-size:.7rem">${st||'—'}</td>`;}).join('');
    rows+=`<tr><td style="text-align:center;font-size:.65rem;color:var(--tx3)">${num}</td><td style="font-size:.78rem;font-weight:500;white-space:nowrap">${escH(s.name)}</td>${cells}<td style="text-align:center;font-weight:700;color:var(--green)">${P}</td><td style="text-align:center;font-weight:700;color:var(--red)">${A}</td><td style="text-align:center;font-weight:700;color:var(--amber)">${L}</td></tr>`;
  });
  el.innerHTML=`<div class="ebar"><span class="elbl">Export:</span><button class="btn br bsm" onclick="pdfAttSum()">📄 PDF</button><button class="btn bg bsm" onclick="excelAtt()">📊 Excel</button></div>
  <div class="card"><div style="overflow-x:auto"><table class="att-tbl"><thead><tr><th>#</th><th style="text-align:left;min-width:140px">Name</th>${dates.map(d=>`<th style="font-size:.62rem">${d.slice(5)}</th>`).join('')}<th style="color:var(--green)">P</th><th style="color:var(--red)">A</th><th style="color:var(--amber)">L</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

// ══════════════════════════════════════════════
// 18. CONSOLIDATED GRADES
// ══════════════════════════════════════════════
function renderCons(){
  const el=document.getElementById('consContent');if(!el)return;
  if(!APP.imported.length){
    el.innerHTML=`<div class="ebar"><label class="btn bp bsm" style="cursor:pointer">📂 Import Subject Teacher JSONs<input type="file" accept=".json" multiple style="display:none" onchange="handleImportFiles(this)"></label></div>
    <div class="iz" id="consDropZone" ondrop="dropFiles(event)" ondragover="event.preventDefault();this.classList.add('drag')" ondragleave="this.classList.remove('drag')">
      <div class="iz-icon">📦</div><div class="iz-text">Drop JSON files here or click the Import button above</div>
      <div class="iz-sub">Import .json files exported from Subject Teachers (Three-Term format)</div>
    </div>`;return;
  }
  const subjects=APP.imported.map(s=>s.subject||'?');
  const allNames=new Set();APP.imported.forEach(s=>(s.students||[]).forEach(st=>allNames.add(norm(st.name))));
  const nameArr=[...allNames].sort();const lkp={};APP.imported.forEach(s=>{lkp[s.subject]={};(s.students||[]).forEach(st=>lkp[s.subject][norm(st.name)]=st);});
  let rows='';
  nameArr.forEach((name,idx)=>{
    const allTerms=subjects.map(subj=>{const st=lkp[subj][name];if(!st)return{t1:null,t2:null,t3:null,final:null};return{t1:st.terms?.T1||null,t2:st.terms?.T2||null,t3:st.terms?.T3||null,final:st.finalGrade||null};});
    const finals=allTerms.map(t=>t.final).filter(v=>v!==null&&!isNaN(v));
    const ga=finals.length?Math.round(finals.reduce((a,b)=>a+b,0)/finals.length):null;
    const allP=subjects.every(subj=>{const st=lkp[subj][name];return!st||!st.finalGrade||(st.finalGrade>=75);});
    const prom=ga!==null?(ga>=75&&allP?'PROMOTED':'RETAINED'):'';
    rows+=`<tr><td style="text-align:center;font-size:.68rem;color:var(--tx3)">${idx+1}</td><td class="nc" style="font-size:.78rem">${escH(name)}</td>
      ${allTerms.map(t=>[t.t1,t.t2,t.t3,t.final].map(v=>`<td style="text-align:center;font-family:'DM Mono',monospace;font-size:.72rem;font-weight:${v?'600':'400'};color:${v?(v>=75?'var(--green)':'var(--red)'):'var(--tx4)'}">${v||'—'}</td>`).join('')).join('')}
      <td style="text-align:center;font-family:'DM Mono',monospace;font-size:.78rem;font-weight:700;color:var(--blue)">${ga||'—'}</td>
      <td style="text-align:center"><span class="${prom==='PROMOTED'?'bprom':prom==='RETAINED'?'bret':''}">${prom||'—'}</span></td>
    </tr>`;
  });
  el.innerHTML=`<div class="ebar"><span class="elbl">Imported: ${APP.imported.length} subjects</span>
    <label class="btn bp bsm" style="cursor:pointer">+ Add More<input type="file" accept=".json" multiple style="display:none" onchange="handleImportFiles(this)"></label>
    <button class="btn br bsm" onclick="APP.imported=[];save();renderCons()">✕ Clear All</button>
    <div class="sp"></div><button class="btn bg bsm" onclick="pdfCons()">📄 PDF</button><button class="btn ba bsm" onclick="excelCons()">📊 Excel</button>
  </div>
  <div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-bottom:.85rem">${APP.imported.map(s=>`<span style="background:var(--blue2);color:var(--blue);padding:.18rem .55rem;border-radius:99px;font-size:.68rem;font-weight:600">${escH(s.subject||'?')}</span>`).join('')}</div>
  <div class="card"><div style="overflow-x:auto"><table class="ctbl">
    <thead><tr><th style="width:26px">#</th><th class="nc" style="min-width:150px">Learner's Name</th>${subjects.map(subj=>`<th colspan="4" style="font-size:.62rem">${escH(subj)}</th>`).join('')}<th>Gen. Avg</th><th>Status</th></tr>
    <tr><th colspan="2"></th>${subjects.map(()=>'<th style="font-size:.62rem">T1</th><th style="font-size:.62rem">T2</th><th style="font-size:.62rem">T3</th><th style="font-size:.62rem">Final</th>').join('')}<th></th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div></div>`;
}
function handleImportFiles(inp){const files=[...inp.files];let loaded=0;files.forEach(f=>{const r=new FileReader();r.onload=e=>{try{const data=JSON.parse(e.target.result);if(data.exportType==='gradeSummaryJSON'||data.exportType==='termSummaryJSON'){const existing=APP.imported.findIndex(s=>s.subject===data.subject);if(existing>=0)APP.imported.splice(existing,1);APP.imported.push(data);loaded++;save();if(loaded===files.length){renderCons();toast(`✓ Imported ${loaded} file${loaded>1?'s':''}`);}}else{toast('✗ Invalid format: '+f.name);}}catch(err){toast('✗ Error reading: '+f.name);}};r.readAsText(f);});inp.value='';}
function dropFiles(e){e.preventDefault();document.getElementById('consDropZone')?.classList.remove('drag');if(e.dataTransfer.files.length){handleImportFiles({files:e.dataTransfer.files});}}

// ══════════════════════════════════════════════
// SF FORMS RENDERING
// ══════════════════════════════════════════════
function showSF(sf){
  APP.activeSF=sf;save();
  const sfOrder=['sf1','sf2','sf4','sf5','sf9','sf10'];
  document.querySelectorAll('#sfNav .stab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('#sfNav .stab')[sfOrder.indexOf(sf)]?.classList.add('active');
  renderSF(sf);
}
function renderSF(sf){
  const el=document.getElementById('sf-content');if(!el)return;
  if(!hasClass()){el.innerHTML='<div class="ws"><h2>Select a class first</h2><p>School forms auto-fill from your class data.</p></div>';return;}
  const cd=getCD();const stu=allStu();
  if(sf==='sf1')renderSF1(el,cd,stu);
  else if(sf==='sf2')renderSF2(el,cd,stu);
  else if(sf==='sf4')renderSF4(el,cd,stu);
  else if(sf==='sf5')renderSF5(el,cd,stu);
  else if(sf==='sf9')renderSF9(el,cd,stu);
  else if(sf==='sf10')renderSF10(el,cd,stu);
}
function sfMeta(cd){return`<div class="sf-meta-grid"><div class="sf-meta-item"><div class="sf-meta-label">School</div><div class="sf-meta-val">${escH(cd.school.name||'—')}</div></div><div class="sf-meta-item"><div class="sf-meta-label">School ID</div><div class="sf-meta-val">${escH(cd.school.id||'—')}</div></div><div class="sf-meta-item"><div class="sf-meta-label">School Year</div><div class="sf-meta-val">${escH(APP.ac.sy||'—')}</div></div><div class="sf-meta-item"><div class="sf-meta-label">Region</div><div class="sf-meta-val">${escH(cd.school.region||'—')}</div></div><div class="sf-meta-item"><div class="sf-meta-label">Division</div><div class="sf-meta-val">${escH(cd.school.division||'—')}</div></div><div class="sf-meta-item"><div class="sf-meta-label">Grade & Section</div><div class="sf-meta-val">${escH(APP.ac.grade)} – ${escH(APP.ac.section)}</div></div><div class="sf-meta-item"><div class="sf-meta-label">Adviser/Teacher</div><div class="sf-meta-val">${escH(cd.school.teacher||'—')}</div></div><div class="sf-meta-item"><div class="sf-meta-label">Subject</div><div class="sf-meta-val">${escH(cd.school.subject||'—')}</div></div><div class="sf-meta-item"><div class="sf-meta-label">Term System</div><div class="sf-meta-val">Three-Term · DO 009, s. 2026</div></div></div>`;}
function renderSF1(el,cd,stu){let rows='';stu.forEach((s,i)=>{rows+=`<tr><td style="text-align:center">${i+1}</td><td class="sf-nc">${escH(s.name)}</td><td>${s.g==='male'?'M':'F'}</td><td></td><td></td><td></td><td></td><td></td></tr>`;});el.innerHTML=`<div class="sf-export-bar"><button class="btn bg bsm" onclick="excelSF1()">📊 Export Excel</button><button class="btn br bsm" onclick="window.print()">📄 Print/PDF</button></div><div class="sf-form"><div class="sf-header"><div class="sf-title">SF1 — School Register</div><div class="sf-subtitle">Republic of the Philippines · Department of Education · Three-Term Calendar</div></div>${sfMeta(cd)}<div style="overflow-x:auto"><table class="sf-tbl"><thead><tr><th style="width:30px">#</th><th class="sf-nc">Learner's Name (Last, First, Middle)</th><th>Sex</th><th>LRN</th><th>Date of Birth</th><th>Age</th><th>Barangay</th><th>Remarks</th></tr></thead><tbody>${rows}</tbody></table></div><div style="margin-top:.9rem;font-size:.72rem;color:var(--tx2)">Total: ${stu.length} · Male: ${cd.students.male.length} · Female: ${cd.students.female.length}</div></div>`;}
function renderSF2(el,cd,stu){const dates=Object.keys(cd.att).sort();const months=[...new Set(dates.map(d=>d.substring(0,7)))];if(!months.length){el.innerHTML=`<div class="ws"><h2>No attendance records yet</h2></div>`;return;}const mon=months[months.length-1];const monDates=dates.filter(d=>d.startsWith(mon));let rows='';stu.forEach((s,i)=>{let P=0,A=0,L=0;const cells=monDates.map(d=>{const st=(cd.att[d]||{})[s.name]||'';if(st==='P')P++;else if(st==='A')A++;else if(st==='L')L++;return`<td style="text-align:center;font-size:.62rem">${st||''}</td>`;}).join('');rows+=`<tr><td style="text-align:center;font-size:.68rem">${i+1}</td><td class="sf-nc" style="font-size:.72rem">${escH(s.name)}</td>${cells}<td style="text-align:center;font-weight:600;color:var(--green)">${P}</td><td style="text-align:center;font-weight:600;color:var(--red)">${A}</td><td style="text-align:center;font-weight:600;color:var(--amber)">${L}</td></tr>`;});el.innerHTML=`<div class="sf-export-bar"><button class="btn bg bsm" onclick="excelSF2('${mon}')">📊 Export Excel</button><button class="btn br bsm" onclick="window.print()">📄 Print/PDF</button><span style="font-size:.78rem;color:var(--tx3)">Month: ${mon}</span></div><div class="sf-form"><div class="sf-header"><div class="sf-title">SF2 — Daily Attendance Record</div><div class="sf-subtitle">Month: ${mon}</div></div>${sfMeta(cd)}<div style="overflow-x:auto"><table class="sf-tbl"><thead><tr><th>#</th><th class="sf-nc">Learner's Name</th>${monDates.map(d=>`<th style="font-size:.58rem">${d.slice(8)}</th>`).join('')}<th>P</th><th>A</th><th>L</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;}
function renderSF4(el,cd,stu){const dates=Object.keys(cd.att).sort();const months=[...new Set(dates.map(d=>d.substring(0,7)))];let rows='';months.forEach(mon=>{const monDates=dates.filter(d=>d.startsWith(mon));let P=0,A=0,L=0;stu.forEach(s=>{monDates.forEach(d=>{const st=(cd.att[d]||{})[s.name]||'';if(st==='P')P++;else if(st==='A')A++;else if(st==='L')L++;});});rows+=`<tr><td>${mon}</td><td style="text-align:center">${stu.length}</td><td style="text-align:center">${monDates.length}</td><td style="text-align:center;color:var(--green);font-weight:600">${P}</td><td style="text-align:center;color:var(--red);font-weight:600">${A}</td><td style="text-align:center;color:var(--amber);font-weight:600">${L}</td><td></td></tr>`;});el.innerHTML=`<div class="sf-export-bar"><button class="btn bg bsm" onclick="excelSF4()">📊 Export Excel</button><button class="btn br bsm" onclick="window.print()">📄 Print/PDF</button></div><div class="sf-form"><div class="sf-header"><div class="sf-title">SF4 — Monthly Attendance Report</div></div>${sfMeta(cd)}<div style="overflow-x:auto"><table class="sf-tbl"><thead><tr><th>Month</th><th>Enrollment</th><th>School Days</th><th>Total Present</th><th>Total Absent</th><th>Total Late</th><th>Remarks</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;}
function renderSF5(el,cd,stu){let rows='';let prom=0,ret=0;let lastG=null;stu.forEach((s,i)=>{if(s.g!==lastG){rows+=`<tr><td colspan="8" style="background:${s.g==='male'?'#e8f4fd':'#fce8f3'};font-weight:700;font-size:.68rem">${s.g==='male'?'MALE':'FEMALE'}</td></tr>`;lastG=s.g;}const num=(s.g==='male'?cd.students.male:cd.students.female).indexOf(s.name)+1;const t1=calcT(s.name,1).termGrade,t2=calcT(s.name,2).termGrade,t3=calcT(s.name,3).termGrade;const vt=[t1,t2,t3].filter(v=>v!==null);const final=vt.length?Math.round(vt.reduce((a,b)=>a+b,0)/vt.length):null;const status=final!==null?(final>=75?'PROMOTED':'RETAINED'):'';if(status==='PROMOTED')prom++;else if(status==='RETAINED')ret++;rows+=`<tr><td style="text-align:center;font-size:.68rem">${num}</td><td class="sf-nc" style="font-size:.75rem">${escH(s.name)}</td><td style="text-align:center;font-weight:600;color:${t1?(t1>=75?'var(--green)':'var(--red)'):'var(--tx4)'}">${t1||'—'}</td><td style="text-align:center;font-weight:600;color:${t2?(t2>=75?'var(--green)':'var(--red)'):'var(--tx4)'}">${t2||'—'}</td><td style="text-align:center;font-weight:600;color:${t3?(t3>=75?'var(--green)':'var(--red)'):'var(--tx4)'}">${t3||'—'}</td><td style="text-align:center;font-weight:700;color:${final?(final>=75?'var(--blue)':'var(--red)'):'var(--tx4)'}">${final||'—'}</td><td style="text-align:center"><span class="${status==='PROMOTED'?'bprom':status==='RETAINED'?'bret':''}">${status||'—'}</span></td><td></td></tr>`;});el.innerHTML=`<div class="sf-export-bar"><button class="btn bg bsm" onclick="excelSF5()">📊 Export Excel</button><button class="btn br bsm" onclick="window.print()">📄 Print/PDF</button></div><div class="sf-form"><div class="sf-header"><div class="sf-title">SF5 — Promotion and Level of Proficiency</div><div class="sf-subtitle">Three-Term System · DO 009, s. 2026</div></div>${sfMeta(cd)}<div style="display:flex;gap:.7rem;margin-bottom:.9rem"><div class="astat"><div class="astn" style="color:var(--blue)">${prom}</div><div class="astl">Promoted</div></div><div class="astat"><div class="astn" style="color:var(--amber)">${ret}</div><div class="astl">Retained</div></div><div class="astat"><div class="astn" style="color:var(--tx2)">${stu.length}</div><div class="astl">Total</div></div></div><div style="overflow-x:auto"><table class="sf-tbl"><thead><tr><th>#</th><th class="sf-nc">Learner's Name</th><th><span class="tag tt1">Term 1</span></th><th><span class="tag tt2">Term 2</span></th><th><span class="tag tt3">Term 3</span></th><th>Final</th><th>Status</th><th>Remarks</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;}
function renderSF9(el,cd,stu){const t=APP.gt;let cards='';stu.forEach(s=>{const c=calcT(s.name,t);const final=calcFinal(s.name);cards+=`<div style="border:1px solid var(--bdr);border-radius:var(--r);padding:.9rem;margin-bottom:.6rem;background:var(--surf)"><div style="display:flex;justify-content:space-between;margin-bottom:.5rem"><div><div style="font-size:.85rem;font-weight:700">${escH(s.name)}</div><div style="font-size:.68rem;color:var(--tx3)">${s.g==='male'?'Male':'Female'} · ${escH(APP.ac.grade)} ${escH(APP.ac.section)}</div></div><div class="tag tt${t}" style="font-size:.7rem">Term ${t} Report · SY ${APP.ac.sy}</div></div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.4rem;margin-bottom:.5rem">${[['Written Works',c.wwPS!==null?c.wwPS+'%':'—','WW 30%'],['Performance Tasks',c.ptPS!==null?c.ptPS+'%':'—','PT 50%'],['Term Exam',c.tePS!==null?c.tePS+'%':'—','TE 20%'],['Term Grade',c.termGrade||'—','Transmuted']].map(([l,v,s])=>`<div style="background:var(--surf2);border:1px solid var(--bdr);border-radius:var(--rs);padding:.4rem;text-align:center"><div style="font-size:.58rem;color:var(--tx3)">${s}</div><div style="font-size:1rem;font-weight:700;font-family:'DM Mono',monospace">${v}</div><div style="font-size:.62rem;color:var(--tx2)">${l}</div></div>`).join('')}</div><div style="font-size:.68rem;color:var(--tx2)">Final (all terms avg): <strong style="color:${final?(final>=75?'var(--green)':'var(--red)'):'var(--tx3)'}">${final||'—'}</strong> · ${final?(final>=75?'PASSED':'FAILED'):''} · ${escH(cd.school.subject||'—')}</div></div>`;});el.innerHTML=`<div class="sf-export-bar"><div class="ttabs">${[1,2,3].map(ti=>`<button class="ttab2 ${ti===t?`active-t${ti}`:''}" onclick="setActiveTerm(${ti});showSF('sf9')">${TERM_DATES[ti].name}</button>`).join('')}</div><button class="btn br bsm" onclick="window.print()">📄 Print All Cards</button></div><div class="sf-form"><div class="sf-header"><div class="sf-title">SF9 — Term Report Card</div><div class="sf-subtitle">Term ${t} · ${TERM_DATES[t].start} – ${TERM_DATES[t].end}</div></div>${sfMeta(cd)}${cards}</div>`;}

lass="fl" style="margin-bottom:.4rem"><span class="tag ta">PT (50%)</span><span style="font-size:.75rem;color:var(--tx2)">Total: ${c.ptT!==null?c.ptT:'—'} · PS: ${c.ptPS!==null?c.ptPS:'—'}% · WS: ${c.ptWS!==null?c.ptWS:'—'}</span></div>
  <div style="display:flex;flex-wrap:wrap;gap:3px">${Array.from({length:ptC},(_,i)=>`<div style="text-align:center;padding:.3rem .2rem;border:1px solid var(--bdr);border-radius:var(--rss);min-width:44px;background:var(--surf)"><div style="font-size:.6rem;color:var(--tx3)">PT${i+1}${h.pt[i]?'<br>/'+h.pt[i]:''}</div><div style="font-size:.85rem;font-weight:600;font-family:'DM Mono',monospace">${pt[i]!==null&&pt[i]!==undefined?pt[i]:'—'}</div></div>`).join('')}</div></div>
  ${h.te?`<div style="margin-bottom:.8rem"><div class="fl" style="margin-bottom:.4rem"><span class="tag tg">Term Exam (20%)</span><span style="font-size:.75rem;color:var(--tx2)">Score: ${te!==null?te:'—'} / ${h.te} · PS: ${c.tePS!==null?c.tePS:'—'}% · WS: ${c.teWS!==null?c.teWS:'—'}</span></div></div>`:''}
  <div style="padding:.65rem .9rem;background:var(--surf2);border-radius:var(--r);border:1px solid var(--bdr);display:flex;gap:1rem;flex-wrap:wrap">
    ${[['WW WS',c.wwWS],['PT WS',c.ptWS],['TE WS',c.teWS],['Initial',c.initial]].map(([l,v])=>`<div><div style="font-size:.65rem;color:var(--tx3)">${l}</div><div style="font-size:.85rem;font-weight:600;font-family:'DM Mono',monospace">${v!==null?v:'—'}</div></div>`).join('')}
    <div><div style="font-size:.65rem;color:var(--tx3)">Term ${t} Grade</div><div style="font-size:1.1rem;font-weight:700;font-family:'DM Mono',monospace;color:${c.termGrade?(c.termGrade>=75?'var(--green)':'var(--red)'):'var(--tx3)'}">${c.termGrade||'—'}</div></div>
  </div></div>`;
}
function goToStudRow2(){const rawVal=document.getElementById('gssdName')?.value;const name=rawVal?rawVal.replace(/^\[.\] /,''):'';const t=parseInt(document.getElementById('gssdT')?.value||'1');if(!name){toast('Select a student');return;}APP.gt=t;APP.hlStudent=name;showRB('gradeentry');showPage('recordbook');}

// ── DAILY ATTENDANCE ──
function renderDailyAtt(){
  const el=document.getElementById('dailyAttContent');if(!hasClass()){el.innerHTML='<div class="ws"><h2>Select a class first</h2></div>';return;}
  const cd=getCD();const stu=allStu();const ds=APP.attDate||today();const att=cd.att[ds]||{};
  let P=0,A=0,L=0;stu.forEach(s=>{const st=att[s.name]||'';if(st==='P')P++;else if(st==='A')A++;else if(st==='L')L++;});
  el.innerHTML=`<div class="ebar"><span class="elbl">📅 Daily Attendance</span><div class="sp"></div><button class="btn br bsm" onclick="window.print()">📄 Print</button></div>
  <div class="card" style="margin-bottom:.85rem"><div class="fl">
    <div><div class="lbl">Date</div><input type="date" class="inp" id="attDate" value="${ds}" style="width:155px" onchange="APP.attDate=this.value;save();renderDailyAtt()"></div>
    <button class="btn bp bsm" onclick="markAllP('${ds}')">✓ All Present</button>
    <button class="btn bo bsm" onclick="clearDay('${ds}')">Clear Day</button>
    <button class="btn bg bsm" onclick="save();toast('✓ Saved')">💾 Save</button>
    <div class="sp"></div>
    <div class="fl"><div class="astat"><div class="astn" style="color:var(--green)">${P}</div><div class="astl">Present</div></div><div class="astat"><div class="astn" style="color:var(--red)">${A}</div><div class="astl">Absent</div></div><div class="astat"><div class="astn" style="color:var(--amber)">${L}</div><div class="astl">Late</div></div><div class="astat"><div class="astn" style="color:var(--tx3)">${stu.length}</div><div class="astl">Total</div></div></div>
  </div></div>
  <div class="agrid">${buildAttGrid(stu,att,ds)}</div>`;
}
function buildAttGrid(stu,att,ds){let rows='';let lastG=null;stu.forEach((s,i)=>{if(s.g!==lastG){rows+=`<div style="grid-column:1/-1;padding:.28rem .5rem;background:${s.g==='male'?'var(--blue2)':'var(--pink2)'};border-radius:var(--rs);font-size:.68rem;font-weight:700;color:${s.g==='male'?'var(--blue)':'var(--pink)'}">${s.g==='male'?'👦 MALE':'👧 FEMALE'}</div>`;lastG=s.g;}const num=(s.g==='male'?getCD().students.male:getCD().students.female).indexOf(s.name)+1;const st=att[s.name]||'';rows+=`<div class="acard"><span class="anum">${num}</span><span class="aname">${escH(s.name)}</span><div class="atog"><button class="abtn ${st==='P'?'pres':'off'}" onclick="setAtt('${esc(s.name)}','${ds}','${st==='P'?'':'P'}')">P</button><button class="abtn ${st==='A'?'abs':'off'}" onclick="setAtt('${esc(s.name)}','${ds}','${st==='A'?'':'A'}')">A</button><button class="abtn ${st==='L'?'late':'off'}" onclick="setAtt('${esc(s.name)}','${ds}','${st==='L'?'':'L'}')">L</button></div></div>`;});return rows;}
function setAtt(name,ds,status){const cd=getCD();if(!cd.att[ds])cd.att[ds]={};if(status==='')delete cd.att[ds][name];else cd.att[ds][name]=status;save();renderDailyAtt();}
function markAllP(ds){const cd=getCD();const stu=allStu();if(!cd.att[ds])cd.att[ds]={};stu.forEach(s=>cd.att[ds][s.name]='P');save();renderDailyAtt();}
function clearDay(ds){const cd=getCD();delete cd.att[ds];save();renderDailyAtt();}

// ── ATTENDANCE SUMMARY ──
function renderAttSum(){
  const el=document.getElementById('attSumContent');if(!hasClass()){el.innerHTML='<div class="ws"><h2>Select a class first</h2></div>';return;}
  const cd=getCD();const stu=allStu();const dates=Object.keys(cd.att).sort().slice(-20);
  if(!dates.length){el.innerHTML='<div class="ws"><h2>No attendance records yet</h2></div>';return;}
  let rows='';let lastG=null;
  stu.forEach(s=>{if(s.g!==lastG){rows+=`<tr><td colspan="${dates.length+5}" style="background:${s.g==='male'?'var(--blue2)':'var(--pink2)'};font-weight:700;font-size:.68rem;padding:.28rem .5rem;color:${s.g==='male'?'var(--blue)':'var(--pink)'}">${s.g==='male'?'👦 MALE':'👧 FEMALE'}</td></tr>`;lastG=s.g;}
  const num=(s.g==='male'?cd.students.male:cd.students.female).indexOf(s.name)+1;let P=0,A=0,L=0;
  const cells=dates.map(d=>{const st=(cd.att[d]||{})[s.name]||'';if(st==='P')P++;else if(st==='A')A++;else if(st==='L')L++;return`<td style="text-align:center;color:${st==='P'?'var(--green)':st==='A'?'var(--red)':st==='L'?'var(--amber)':'var(--tx4)'};font-weight:600;font-size:.68rem">${st||'—'}</td>`;}).join('');
  rows+=`<tr><td style="text-align:center;font-size:.65rem;color:var(--tx3)">${num}</td><td style="font-size:.78rem;font-weight:500;white-space:nowrap">${escH(s.name)}</td>${cells}<td style="text-align:center;font-weight:700;color:var(--green)">${P}</td><td style="text-align:center;font-weight:700;color:var(--red)">${A}</td><td style="text-align:center;font-weight:700;color:var(--amber)">${L}</td></tr>`;});
  el.innerHTML=`<div class="ebar"><span class="elbl">Export:</span><button class="btn br bsm" onclick="window.print()">📄 Print</button><button class="btn bg bsm" onclick="excelAtt()">📊 Excel</button></div>
  <div class="card"><div style="overflow-x:auto"><table class="att-tbl"><thead><tr><th>#</th><th style="text-align:left;min-width:140px">Name</th>${dates.map(d=>`<th style="font-size:.62rem">${d.slice(5)}</th>`).join('')}<th style="color:var(--green)">P</th><th style="color:var(--red)">A</th><th style="color:var(--amber)">L</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

// ── CONSOLIDATED GRADES ──
function renderCons(){
  const el=document.getElementById('consContent');if(!el)return;
  if(!APP.imported.length){el.innerHTML=`<div class="ebar"><label class="btn bp bsm" style="cursor:pointer">📂 Import Subject Teacher JSONs<input type="file" accept=".json" multiple style="display:none" onchange="handleImportFiles(this)"></label></div>
  <div class="iz" ondrop="dropFiles(event)" ondragover="event.preventDefault();this.classList.add('drag')" ondragleave="this.classList.remove('drag')"><div class="iz-icon">📦</div><div class="iz-text">Drop JSON files here or click above to select</div><div class="iz-sub">Import JSON files exported by Subject Teachers (Three-Term format)</div></div>`;return;}
  const subjects=APP.imported.map(s=>s.subject||'?');const allNames=new Set();APP.imported.forEach(s=>(s.students||[]).forEach(st=>allNames.add(norm(st.name))));const nameArr=[...allNames].sort();const lkp={};APP.imported.forEach(s=>{lkp[s.subject]={};(s.students||[]).forEach(st=>lkp[s.subject][norm(st.name)]=st);});
  let rows='';nameArr.forEach((name,idx)=>{const allTerms=subjects.map(subj=>{const st=lkp[subj][name];if(!st)return{t1:'',t2:'',t3:'',final:''};return{t1:st.terms?.T1||'',t2:st.terms?.T2||'',t3:st.terms?.T3||'',final:st.finalGrade||''};});const finals=allTerms.map(t=>t.final).filter(v=>v!==''&&!isNaN(v));const ga=finals.length?Math.round(finals.reduce((a,b)=>a+Number(b),0)/finals.length):null;const allP=subjects.every(subj=>{const st=lkp[subj][name];return!st||!st.finalGrade||(st.finalGrade>=75);});const prom=ga!==null?(ga>=75&&allP?'PROMOTED':'RETAINED'):'';rows+=`<tr><td style="text-align:center;font-size:.68rem;color:var(--tx3)">${idx+1}</td><td class="nc" style="font-size:.78rem">${escH(name)}</td>${allTerms.map(t=>[t.t1,t.t2,t.t3,t.final].map(v=>`<td style="text-align:center;font-family:'DM Mono',monospace;font-size:.75rem;font-weight:${v?'600':'400'};color:${v?(Number(v)>=75?'var(--green)':'var(--red)'):'var(--tx4)'}">${v||'—'}</td>`).join('')).join('')}<td style="text-align:center;font-family:'DM Mono',monospace;font-size:.82rem;font-weight:700;color:var(--blue)">${ga||'—'}</td><td style="text-align:center"><span class="${prom==='PROMOTED'?'bprom':prom==='RETAINED'?'bret':''}">${prom||'—'}</span></td></tr>`;});
  el.innerHTML=`<div class="ebar"><span class="elbl">Imported: ${APP.imported.length} subjects</span><label class="btn bp bsm" style="cursor:pointer">+ Add More<input type="file" accept=".json" multiple style="display:none" onchange="handleImportFiles(this)"></label><button class="btn br bsm" onclick="APP.imported=[];save();renderCons()">✕ Clear</button><div class="sp"></div><button class="btn bg bsm" onclick="pdfCons()">📄 PDF</button><button class="btn ba bsm" onclick="excelCons()">📊 Excel</button></div>
  <div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-bottom:.85rem">${APP.imported.map(s=>`<span style="background:var(--blue2);color:var(--blue);padding:.18rem .5rem;border-radius:99px;font-size:.68rem;font-weight:600">${escH(s.subject||'?')}</span>`).join('')}</div>
  <div class="card"><div style="overflow-x:auto"><table class="ctbl"><thead><tr><th style="width:26px">#</th><th class="nc" style="min-width:160px">Learner's Name</th>${subjects.map(subj=>`<th colspan="4" style="font-size:.62rem">${escH(subj)}</th>`).join('')}<th>Gen. Avg</th><th>Status</th></tr><tr><th colspan="2"></th>${subjects.map(()=>'<th style="font-size:.6rem">T1</th><th style="font-size:.6rem">T2</th><th style="font-size:.6rem">T3</th><th style="font-size:.6rem">Final</th>').join('')}<th></th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
function handleImportFiles(inp){const files=[...inp.files];let loaded=0;files.forEach(f=>{const r=new FileReader();r.onload=e=>{try{const data=JSON.parse(e.target.result);if(data.exportType==='termSummaryJSON'||data.exportType==='gradeSummaryJSON'){const existing=APP.imported.findIndex(s=>s.subject===data.subject);if(existing>=0)APP.imported.splice(existing,1);APP.imported.push(data);loaded++;save();if(loaded===files.length){renderCons();toast(`✓ Imported ${loaded} file${loaded>1?'s':''}`);}}}catch(err){toast('✗ Invalid file: '+f.name);}};r.readAsText(f);});inp.value='';}
function dropFiles(e){e.preventDefault();e.target.closest('.iz')?.classList.remove('drag');const fakeInp={files:e.dataTransfer.files};handleImportFiles(fakeInp);}

// ── SF FORMS ──
function showSF(sf){APP.activeSF=sf;save();document.querySelectorAll('#sfNav .stab').forEach(b=>b.classList.remove('active'));const sfOrder=['sf1','sf2','sf4','sf5','sf9','sf10'];const idx=sfOrder.indexOf(sf);document.querySelectorAll('#sfNav .stab')[idx]?.classList.add('active');renderSF(sf);}
function renderSF(sf){const el=document.getElementById('sf-content');if(!el)return;if(!hasClass()){el.innerHTML='<div class="ws"><h2>Select a class first</h2></div>';return;}const cd=getCD();const stu=allStu();if(sf==='sf1')renderSF1(el,cd,stu);else if(sf==='sf2')renderSF2(el,cd,stu);else if(sf==='sf4')renderSF4(el,cd,stu);else if(sf==='sf5')renderSF5(el,cd,stu);else if(sf==='sf9')renderSF9(el,cd,stu);else if(sf==='sf10')renderSF10(el,cd,stu);}
function sfMeta(cd){return`<div class="sf-meta-grid"><div class="sf-meta-item"><div class="sf-meta-label">School</div><div class="sf-meta-val">${escH(cd.school.name||'—')}</div></div><div class="sf-meta-item"><div class="sf-meta-label">School ID</div><div class="sf-meta-val">${escH(cd.school.id||'—')}</div></div><div class="sf-meta-item"><div class="sf-meta-label">School Year</div><div class="sf-meta-val">${escH(cd.school.sy||cd.school.year||APP.ac.sy||'—')}</div></div><div class="sf-meta-item"><div class="sf-meta-label">Region</div><div class="sf-meta-val">${escH(cd.school.region||'—')}</div></div><div class="sf-meta-item"><div class="sf-meta-label">Division</div><div class="sf-meta-val">${escH(cd.school.division||'—')}</div></div><div class="sf-meta-item"><div class="sf-meta-label">Grade & Section</div><div class="sf-meta-val">${escH(APP.ac.grade)} – ${escH(APP.ac.section)}</div></div><div class="sf-meta-item"><div class="sf-meta-label">Teacher</div><div class="sf-meta-val">${escH(cd.school.teacher||'—')}</div></div><div class="sf-meta-item"><div class="sf-meta-label">Subject</div><div class="sf-meta-val">${escH(cd.school.subject||'—')}</div></div><div class="sf-meta-item"><div class="sf-meta-label">Calendar</div><div class="sf-meta-val">Three-Term · DO 009, s. 2026</div></div></div>`;}
function renderSF1(el,cd,stu){let rows='';stu.forEach((s,i)=>{rows+=`<tr><td style="text-align:center">${i+1}</td><td class="sf-nc">${escH(s.name)}</td><td>${s.g==='male'?'M':'F'}</td><td></td><td></td><td></td><td></td><td></td></tr>`;});el.innerHTML=`<div class="sf-export-bar"><button class="btn bg bsm" onclick="excelSF1()">📊 Excel</button><button class="btn br bsm" onclick="window.print()">📄 Print</button></div><div class="sf-form"><div class="sf-header"><div class="sf-title">School Form 1 (SF1) — School Register</div><div class="sf-subtitle">Republic of the Philippines · Department of Education · Three-Term · DO 009, s. 2026</div></div>${sfMeta(cd)}<div style="overflow-x:auto"><table class="sf-tbl"><thead><tr><th style="width:30px">#</th><th class="sf-nc">Learner's Name (Last, First, Middle)</th><th>Sex</th><th>LRN</th><th>Date of Birth</th><th>Age</th><th>Barangay</th><th>Remarks</th></tr></thead><tbody>${rows}</tbody></table></div><div style="margin-top:.75rem;font-size:.72rem;color:var(--tx2)">Total: ${stu.length} · Male: ${cd.students.male.length} · Female: ${cd.students.female.length}</div></div>`;}
function renderSF2(el,cd,stu){const dates=Object.keys(cd.att).sort();const months=[...new Set(dates.map(d=>d.substring(0,7)))];if(!months.length){el.innerHTML=`<div class="ws"><h2>No attendance records yet</h2></div>`;return;}const mon=months[months.length-1];const monDates=dates.filter(d=>d.startsWith(mon));let rows='';stu.forEach((s,i)=>{let P=0,A=0,L=0;const cells=monDates.map(d=>{const st=(cd.att[d]||{})[s.name]||'';if(st==='P')P++;else if(st==='A')A++;else if(st==='L')L++;return`<td style="text-align:center;font-size:.62rem">${st||''}</td>`;}).join('');rows+=`<tr><td style="text-align:center;font-size:.68rem">${i+1}</td><td class="sf-nc" style="font-size:.72rem">${escH(s.name)}</td>${cells}<td style="text-align:center;font-weight:600;color:var(--green)">${P}</td><td style="text-align:center;font-weight:600;color:var(--red)">${A}</td><td style="text-align:center;font-weight:600;color:var(--amber)">${L}</td></tr>`;});el.innerHTML=`<div class="sf-export-bar"><button class="btn bg bsm" onclick="excelSF2('${mon}')">📊 Excel</button><button class="btn br bsm" onclick="window.print()">📄 Print</button></div><div class="sf-form"><div class="sf-header"><div class="sf-title">SF2 — Daily Attendance Record · ${mon}</div></div>${sfMeta(cd)}<div style="overflow-x:auto"><table class="sf-tbl"><thead><tr><th>#</th><th class="sf-nc">Learner's Name</th>${monDates.map(d=>`<th style="font-size:.6rem">${d.slice(8)}</th>`).join('')}<th>P</th><th>A</th><th>L</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;}
function renderSF4(el,cd,stu){const dates=Object.keys(cd.att).sort();const months=[...new Set(dates.map(d=>d.substring(0,7)))];let rows='';months.forEach(mon=>{const monDates=dates.filter(d=>d.startsWith(mon));let P=0,A=0,L=0;stu.forEach(s=>{monDates.forEach(d=>{const st=(cd.att[d]||{})[s.name]||'';if(st==='P')P++;else if(st==='A')A++;else if(st==='L')L++;});});rows+=`<tr><td>${mon}</td><td style="text-align:center">${stu.length}</td><td style="text-align:center">${monDates.length}</td><td style="text-align:center;color:var(--green);font-weight:600">${P}</td><td style="text-align:center;color:var(--red);font-weight:600">${A}</td><td style="text-align:center;color:var(--amber);font-weight:600">${L}</td><td></td></tr>`;});el.innerHTML=`<div class="sf-export-bar"><button class="btn bg bsm" onclick="excelSF4()">📊 Excel</button><button class="btn br bsm" onclick="window.print()">📄 Print</button></div><div class="sf-form"><div class="sf-header"><div class="sf-title">SF4 — Monthly Attendance Report</div></div>${sfMeta(cd)}<table class="sf-tbl"><thead><tr><th>Month</th><th>Enrollment</th><th>School Days</th><th>Total Present</th><th>Total Absent</th><th>Total Late</th><th>Remarks</th></tr></thead><tbody>${rows}</tbody></table></div>`;}
function renderSF5(el,cd,stu){let rows='';let prom=0,ret=0;let lastG=null;stu.forEach((s,i)=>{if(s.g!==lastG){rows+=`<tr><td colspan="8" style="background:${s.g==='male'?'#e8f4fd':'#fce8f3'};font-weight:700;font-size:.68rem;padding:.25rem .5rem">${s.g==='male'?'MALE':'FEMALE'}</td></tr>`;lastG=s.g;}const num=(s.g==='male'?cd.students.male:cd.students.female).indexOf(s.name)+1;const t1=calcT(s.name,1).termGrade,t2=calcT(s.name,2).termGrade,t3=calcT(s.name,3).termGrade;const vt=[t1,t2,t3].filter(v=>v!==null);const final=vt.length?Math.round(vt.reduce((a,b)=>a+b,0)/vt.length):null;const status=final!==null?(final>=75?'PROMOTED':'RETAINED'):'';if(status==='PROMOTED')prom++;else if(status==='RETAINED')ret++;rows+=`<tr><td style="text-align:center;font-size:.65rem">${num}</td><td class="sf-nc" style="font-size:.75rem">${escH(s.name)}</td><td style="text-align:center;font-weight:600;color:${t1?(t1>=75?'var(--green)':'var(--red)'):'var(--tx4)'}">${t1||'—'}</td><td style="text-align:center;font-weight:600;color:${t2?(t2>=75?'var(--green)':'var(--red)'):'var(--tx4)'}">${t2||'—'}</td><td style="text-align:center;font-weight:600;color:${t3?(t3>=75?'var(--green)':'var(--red)'):'var(--tx4)'}">${t3||'—'}</td><td style="text-align:center;font-weight:700;color:${final?(final>=75?'var(--blue)':'var(--red)'):'var(--tx4)'}">${final||'—'}</td><td style="text-align:center"><span class="${status==='PROMOTED'?'bprom':status==='RETAINED'?'bret':''}">${status||'—'}</span></td><td></td></tr>`;});el.innerHTML=`<div class="sf-export-bar"><button class="btn bg bsm" onclick="excelSF5()">📊 Excel</button><button class="btn br bsm" onclick="window.print()">📄 Print</button></div><div class="sf-form"><div class="sf-header"><div class="sf-title">SF5 — Report on Promotion and Level of Proficiency</div><div class="sf-subtitle">Three-Term System · DO 009, s. 2026</div></div>${sfMeta(cd)}<div style="display:flex;gap:.85rem;margin-bottom:.85rem"><div class="astat"><div class="astn" style="color:var(--blue)">${prom}</div><div class="astl">Promoted</div></div><div class="astat"><div class="astn" style="color:var(--amber)">${ret}</div><div class="astl">Retained</div></div><div class="astat"><div class="astn" style="color:var(--tx2)">${stu.length}</div><div class="astl">Total</div></div></div><table class="sf-tbl"><thead><tr><th>#</th><th class="sf-nc">Learner's Name</th><th><span class="tag tt1">Term 1</span></th><th><span class="tag tt2">Term 2</span></th><th><span class="tag tt3">Term 3</span></th><th>Final</th><th>Status</th><th>Remarks</th></tr></thead><tbody>${rows}</tbody></table></div>`;}
/* ================================================================
   ANHS E-CLASS RECORD SYSTEM — THREE-TERM (DO 009, s. 2026)
   main.js v4.0
================================================================ */

const TRANS=[[0,3.99,60],[4,7.99,61],[8,11.99,62],[12,15.99,63],[16,19.99,64],[20,23.99,65],[24,27.99,66],[28,31.99,67],[32,35.99,68],[36,39.99,69],[40,43.99,70],[44,47.99,71],[48,51.99,72],[52,55.99,73],[56,59.99,74],[60,61.59,75],[61.6,63.19,76],[63.2,64.79,77],[64.8,66.39,78],[66.4,67.99,79],[68,69.59,80],[69.6,71.19,81],[71.2,72.79,82],[72.8,74.39,83],[74.4,75.99,84],[76,77.59,85],[77.6,79.19,86],[79.2,80.79,87],[80.8,82.39,88],[82.4,83.99,89],[84,85.59,90],[85.6,87.19,91],[87.2,88.79,92],[88.8,90.39,93],[90.4,91.99,94],[92,93.59,95],[93.6,95.19,96],[95.2,96.79,97],[96.8,98.39,98],[98.4,99.99,99],[100,100,100]];
function transmute(v){if(v===null||isNaN(v))return null;if(v>=100)return 100;for(const[lo,hi,g]of TRANS)if(v>=lo&&v<=hi)return g;return v<0?60:100;}
function r2(n){return Math.round(n*100)/100}
function esc(s){return String(s).replace(/'/g,"\\'")}
function escH(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function norm(n){return String(n).trim().replace(/\s+/g,' ').toUpperCase()}
function today(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}

const TERM_DATES={
  1:{name:'Term 1',start:'June 8, 2026',end:'September 15, 2026',days:69},
  2:{name:'Term 2',start:'September 16, 2026',end:'December 18, 2026',days:65},
  3:{name:'Term 3',start:'January 4, 2027',end:'April 8, 2027',days:67}
};

// ── APP STATE ──
let CURRENT_USER=null;
let APP={role:null,ac:{grade:'',section:'',sy:'2026-2027'},cd:{},imported:[],page:'home',rbtab:'setup',gt:1,aq:0,attDate:today(),hlStudent:null,activeSF:'sf1'};

function ck(){const u=CURRENT_USER?CURRENT_USER.empId:'guest';return`${u}_${APP.ac.grade}_${APP.ac.section}_${APP.ac.sy}`.replace(/\s+/g,'_');}
function getCD(){
  const k=ck();
  if(!APP.cd[k]){APP.cd[k]={
    school:{name:CURRENT_USER?.school||'',id:CURRENT_USER?.schoolId||'',region:CURRENT_USER?.region||'',division:CURRENT_USER?.division||'',section:APP.ac.section,teacher:CURRENT_USER?`${CURRENT_USER.lastName}, ${CURRENT_USER.firstName}`:'',subject:'',year:APP.ac.sy,grade:APP.ac.grade,sy:APP.ac.sy},
    students:{male:[],female:[]},
    hps:{1:{ww:Array(10).fill(null),pt:Array(10).fill(null),te:null},2:{ww:Array(10).fill(null),pt:Array(10).fill(null),te:null},3:{ww:Array(10).fill(null),pt:Array(10).fill(null),te:null}},
    grades:{1:{},2:{},3:{}},att:{},diag:{items:0,hso:0,lso:0}
  };}
  const cd=APP.cd[k];
  for(let t=1;t<=3;t++){
    if(!cd.hps[t])cd.hps[t]={ww:Array(10).fill(null),pt:Array(10).fill(null),te:null};
    while(cd.hps[t].ww.length<10)cd.hps[t].ww.push(null);
    while(cd.hps[t].pt.length<10)cd.hps[t].pt.push(null);
    if(!cd.grades[t])cd.grades[t]={};
  }
  if(!cd.att)cd.att={};
  if(!cd.diag)cd.diag={items:0,hso:0,lso:0};
  return cd;
}
function allStu(){const cd=getCD();return[...cd.students.male.map(n=>({name:n,g:'male'})),...cd.students.female.map(n=>({name:n,g:'female'}))];}
function hasClass(){return APP.ac.grade&&APP.ac.section}

// ── AUTH ──
function getUsers(){try{return JSON.parse(localStorage.getItem('anhs_users')||'[]')}catch(e){return[]}}
function saveUsers(u){try{localStorage.setItem('anhs_users',JSON.stringify(u))}catch(e){}}
function doLogin(){
  const uid=document.getElementById('liEmail').value.trim();
  const pass=document.getElementById('liPass').value;
  const err=document.getElementById('liErr');
  if(!uid||!pass){err.textContent='Please enter employee ID and password.';return;}
  const users=getUsers();const user=users.find(u=>u.empId===uid);
  if(!user||user.password!==btoa(pass)){err.textContent='Invalid employee ID or password.';return;}
  CURRENT_USER=user;try{localStorage.setItem('anhs_current_user',JSON.stringify(user))}catch(e){}
  err.textContent='';startApp(user);
}
function doRegister(){
  const first=document.getElementById('regFirst').value.trim();
  const last=document.getElementById('regLast').value.trim();
  const empId=document.getElementById('regEmpId').value.trim();
  const school=document.getElementById('regSchool').value.trim();
  const schoolId=document.getElementById('regSchoolId').value.trim();
  const region=document.getElementById('regRegion').value.trim();
  const division=document.getElementById('regDivision').value.trim();
  const role=document.getElementById('regRole').value;
  const pass=document.getElementById('regPass').value;
  const pass2=document.getElementById('regPass2').value;
  const err=document.getElementById('regErr');
  if(!first||!last||!empId||!pass){err.textContent='Please fill in all required fields.';return;}
  if(pass!==pass2){err.textContent='Passwords do not match.';return;}
  if(pass.length<6){err.textContent='Password must be at least 6 characters.';return;}
  const users=getUsers();
  if(users.find(u=>u.empId===empId)){err.textContent='Employee ID already registered.';return;}
  const newUser={empId,firstName:first,lastName:last,school:school||'Angono National High School',schoolId:schoolId||'301417',region:region||'IV-A CALABARZON',division:division||'Rizal',role,password:btoa(pass),createdAt:new Date().toISOString()};
  users.push(newUser);saveUsers(users);
  err.style.color='var(--green)';err.textContent='Account created! You can now sign in.';
  setTimeout(()=>{err.textContent='';err.style.color='';showLogin();},1500);
}
function guestLogin(){CURRENT_USER={empId:'guest',firstName:'Guest',lastName:'Teacher',school:'Angono National High School',schoolId:'301417',region:'IV-A CALABARZON',division:'Rizal',role:'subject',isGuest:true};startApp(CURRENT_USER);}
function doLogout(){if(!confirm('Sign out? Make sure you saved your data first.'))return;CURRENT_USER=null;try{localStorage.removeItem('anhs_current_user')}catch(e){}document.getElementById('app').classList.remove('visible');document.getElementById('roleScreen').style.display='none';document.getElementById('authScreen').style.display='flex';APP.role=null;}
function startApp(user){
  document.getElementById('authScreen').style.display='none';
  load();
  const pill=document.getElementById('userPill');if(pill)pill.textContent=user.isGuest?'Guest':`${user.lastName}, ${user.firstName.charAt(0)}.`;
  if(user.role&&!APP.role)APP.role=user.role;
  if(APP.role){
    document.getElementById('roleScreen').style.display='none';
    document.getElementById('app').classList.add('visible');
    updateRoleUI();buildNav();loadZoom();loadDarkMode();restoreClass();showPage(APP.page||'home');
  }else{document.getElementById('roleScreen').style.display='flex';}
}
function showLogin(){document.getElementById('loginCard').style.display='';document.getElementById('registerCard').style.display='none';}
function showRegister(){document.getElementById('loginCard').style.display='none';document.getElementById('registerCard').style.display='';}

// ── PERSISTENCE ──
function save(){try{const key=CURRENT_USER?`anhs_v4_${CURRENT_USER.empId}`:'anhs_v4_guest';localStorage.setItem(key,JSON.stringify(APP));}catch(e){}}
function load(){
  try{
    const key=CURRENT_USER?`anhs_v4_${CURRENT_USER.empId}`:'anhs_v4_guest';
    const d=localStorage.getItem(key);if(!d)return;
    const p=JSON.parse(d);APP={...APP,...p};
    Object.keys(APP.cd||{}).forEach(k=>{
      const cd=APP.cd[k];
      for(let t=1;t<=3;t++){
        if(!cd.hps[t])cd.hps[t]={ww:Array(10).fill(null),pt:Array(10).fill(null),te:null};
        while(cd.hps[t].ww.length<10)cd.hps[t].ww.push(null);
        while(cd.hps[t].pt.length<10)cd.hps[t].pt.push(null);
        if(!cd.grades[t])cd.grades[t]={};
      }
      if(!cd.att)cd.att={};if(!cd.students)cd.students={male:[],female:[]};if(!cd.diag)cd.diag={items:0,hso:0,lso:0};
    });
    if(!APP.imported)APP.imported=[];
  }catch(e){}
}
function saveFile(){
  const cd=hasClass()?getCD():null;
  const blob=new Blob([JSON.stringify({app:APP,user:CURRENT_USER?.empId,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  const nm=cd?`ANHS_${(cd.school.subject||'Class').replace(/\s+/g,'_').substring(0,12)}_${APP.ac.grade.replace(/\s/g,'')}_${APP.ac.section}_${APP.ac.sy}.json`:`ANHS_Backup_${today()}.json`;
  a.download=nm;a.click();URL.revokeObjectURL(a.href);toast('✓ File exported');
}
function loadFile(inp){
  const f=inp.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=e=>{
    try{
      const data=JSON.parse(e.target.result);
      if(data.app){
        APP={...APP,...data.app};
        Object.keys(APP.cd||{}).forEach(k=>{
          const cd=APP.cd[k];
          for(let t=1;t<=3;t++){if(!cd.hps[t])cd.hps[t]={ww:Array(10).fill(null),pt:Array(10).fill(null),te:null};while(cd.hps[t].ww.length<10)cd.hps[t].ww.push(null);while(cd.hps[t].pt.length<10)cd.hps[t].pt.push(null);if(!cd.grades[t])cd.grades[t]={};}
          if(!cd.att)cd.att={};if(!cd.students)cd.students={male:[],female:[]};
        });
        if(!APP.imported)APP.imported=[];
        save();restoreClass();buildNav();showPage(APP.page||'home');toast('✓ File loaded');
      }else{toast('✗ Invalid file format');}
    }catch(err){toast('✗ Could not read file');}
    inp.value='';
  };
  r.readAsText(f);
}
function restoreClass(){
  if(APP.ac.grade){
    const gs=document.getElementById('csGrade');if(gs)gs.value=APP.ac.grade;
    const ss=document.getElementById('csSection');if(ss)ss.value=APP.ac.section;
    const sy=document.getElementById('csSY');if(sy)sy.value=APP.ac.sy||'2026-2027';
    updateClassBadge();updateTermBar();rebuildSavedClassDropdown();
  }
}

// ── ZOOM & DARK MODE ──
const ZOOM_LEVELS=[90,100,110,120,130,140,150];let currentZoom=100;
function applyZoom(l){currentZoom=l;document.documentElement.setAttribute('data-zoom',l);const lb=document.getElementById('zoomLabel');if(lb)lb.textContent=l+'%';try{localStorage.setItem('anhs_zoom',l)}catch(e){}}
function zoomIn(){const i=ZOOM_LEVELS.indexOf(currentZoom);if(i<ZOOM_LEVELS.length-1)applyZoom(ZOOM_LEVELS[i+1]);else toast('Maximum zoom')}
function zoomOut(){const i=ZOOM_LEVELS.indexOf(currentZoom);if(i>0)applyZoom(ZOOM_LEVELS[i-1]);else toast('Minimum zoom')}
function loadZoom(){try{const s=localStorage.getItem('anhs_zoom');if(s)applyZoom(parseInt(s))}catch(e){}}
let darkMode=false;
function toggleDarkMode(){darkMode=!darkMode;document.body.classList.toggle('dark-mode',darkMode);const b=document.getElementById('dmBtn');if(b)b.textContent=darkMode?'☀️':'🌙';try{localStorage.setItem('anhs_dark',darkMode?'1':'0')}catch(e){}toast(darkMode?'🌙 Dark mode on':'☀️ Light mode on')}
function loadDarkMode(){try{const s=localStorage.getItem('anhs_dark');if(s==='1'){darkMode=true;document.body.classList.add('dark-mode');const b=document.getElementById('dmBtn');if(b)b.textContent='☀️';}}catch(e){}}

// ── ROLE & NAV ──
function selectRole(role){APP.role=role;save();document.getElementById('roleScreen').style.display='none';document.getElementById('app').classList.add('visible');updateRoleUI();buildNav();showPage('home');}
function switchRole(){document.getElementById('roleScreen').style.display='flex';document.getElementById('app').classList.remove('visible');APP.role=null;save();}
function updateRoleUI(){const rl=document.getElementById('roleLabel');if(rl)rl.textContent=APP.role==='advisory'?'Advisory Teacher':'Subject Teacher';}
function buildNav(){
  const nav=document.getElementById('mainNav');if(!nav)return;
  const subItems=[{id:'home',icon:'🏠',label:'Home'},{id:'recordbook',icon:'📝',label:'Record Book'},{id:'gradesummary',icon:'📊',label:'Grade Summary'},{id:'dailyatt',icon:'📅',label:'Daily Att.'},{id:'attsummary',icon:'📋',label:'Att. Summary'},{id:'sfforms',icon:'🗂',label:'SF Forms'}];
  const advItems=[{id:'home',icon:'🏠',label:'Home'},{id:'recordbook',icon:'📝',label:'Record Book'},{id:'gradesummary',icon:'📊',label:'Grade Summary'},{id:'consolidated',icon:'🔀',label:'Consolidated'},{id:'dailyatt',icon:'📅',label:'Daily Att.'},{id:'attsummary',icon:'📋',label:'Att. Summary'},{id:'sfforms',icon:'🗂',label:'SF Forms'},{id:'registrar',icon:'📬',label:'Registrar'}];
  const items=APP.role==='advisory'?advItems:subItems;
  nav.innerHTML=items.map(it=>`<button class="mnbtn ${APP.page===it.id?'active':''}" onclick="showPage('${it.id}')">${it.icon} ${it.label}</button>`).join('');
}
function showPage(name){
  APP.page=name;save();
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const pg=document.getElementById('page-'+name);if(pg)pg.classList.add('active');
  buildNav();
  if(name==='home')renderHome();
  else if(name==='recordbook')showRB(APP.rbtab||'setup');
  else if(name==='gradesummary'){renderGradeSummaryPage();renderGSLOA();}
  else if(name==='dailyatt')renderDailyAtt();
  else if(name==='attsummary')renderAttSum();
  else if(name==='consolidated')renderCons();
  else if(name==='sfforms')renderSF(APP.activeSF||'sf1');
  else if(name==='registrar')renderRegistrar();
}

// ── CLASS SELECTOR & TERM BAR ──
function applyClass(){
  const g=document.getElementById('csGrade').value;
  const s=document.getElementById('csSection').value.trim().toUpperCase();
  const sy=document.getElementById('csSY').value.trim();
  if(!g||!s){toast('Please select grade and enter section');return;}
  APP.ac={grade:g,section:s,sy:sy||'2026-2027'};save();updateClassBadge();updateTermBar();rebuildSavedClassDropdown();showPage(APP.page||'home');toast(`✓ Class loaded: ${g} – ${s}`);
}
function updateClassBadge(){const b=document.getElementById('classBadge');if(b)b.textContent=APP.ac.grade?`${APP.ac.grade} · ${APP.ac.section}`:'No class';const info=document.getElementById('csInfo');if(info&&hasClass())info.textContent=`Active: ${APP.ac.grade} – ${APP.ac.section} · SY ${APP.ac.sy}`;}
function updateTermBar(){const bar=document.getElementById('tbarSY');if(bar)bar.textContent=`SY ${APP.ac.sy||'2026-2027'} · 201 class days`;}
function setActiveTerm(t){APP.gt=t;save();document.querySelectorAll('.ttab').forEach((btn,i)=>btn.classList.toggle('active',i+1===t));if(APP.page==='recordbook'&&(APP.rbtab==='gradeentry'||APP.rbtab==='loa'))showRB(APP.rbtab);}
function rebuildSavedClassDropdown(){
  const sel=document.getElementById('savedClassSelect');if(!sel)return;
  try{const key=CURRENT_USER?`anhs_v4_${CURRENT_USER.empId}`:'anhs_v4_guest';const d=localStorage.getItem(key);if(!d){sel.innerHTML='<option value="">Saved classes…</option>';return;}const data=JSON.parse(d);const classes=Object.keys(data.cd||{});sel.innerHTML='<option value="">Saved classes…</option>'+classes.map(k=>{const cd=data.cd[k];return`<option value="${k}">${cd.school.grade||''} – ${cd.school.section||''} (${cd.school.sy||''})</option>`;}).join('');}catch(e){}
}
function pickSavedClass(){
  const sel=document.getElementById('savedClassSelect');const k=sel?.value;if(!k)return;
  const cd=APP.cd[k];if(!cd)return;
  APP.ac.grade=cd.school.grade||'';APP.ac.section=cd.school.section||'';APP.ac.sy=cd.school.sy||cd.school.year||'2026-2027';
  const gs=document.getElementById('csGrade');if(gs)gs.value=APP.ac.grade;
  const ss=document.getElementById('csSection');if(ss)ss.value=APP.ac.section;
  const sy=document.getElementById('csSY');if(sy)sy.value=APP.ac.sy;
  save();updateClassBadge();updateTermBar();showPage(APP.page);toast(`✓ Switched to ${APP.ac.grade} – ${APP.ac.section}`);
}

// ── GRADE CALCULATION — THREE-TERM ──
const W={ww:0.30,pt:0.50,te:0.20};
function calcT(name,t){
  const cd=getCD();const h=cd.hps[t];const g=(cd.grades[t]&&cd.grades[t][name])||{};
  const ww=g.ww||Array(10).fill(null);const pt=g.pt||Array(10).fill(null);const te=g.te!==undefined?g.te:null;
  const wwHT=h.ww.reduce((a,v)=>a+(v||0),0);const ptHT=h.pt.reduce((a,v)=>a+(v||0),0);
  let wwT=null,wwPS=null,wwWS=null,ptT=null,ptPS=null,ptWS=null,tePS=null,teWS=null;
  let wwS=0,wwA=false;ww.forEach((v,i)=>{if(v!==null&&!isNaN(v)&&h.ww[i]){wwS+=parseFloat(v);wwA=true;}});
  if(wwA&&wwHT){wwT=r2(wwS);wwPS=r2((wwT/wwHT)*100);wwWS=r2(wwPS*W.ww);}
  let ptS=0,ptA=false;pt.forEach((v,i)=>{if(v!==null&&!isNaN(v)&&h.pt[i]){ptS+=parseFloat(v);ptA=true;}});
  if(ptA&&ptHT){ptT=r2(ptS);ptPS=r2((ptT/ptHT)*100);ptWS=r2(ptPS*W.pt);}
  if(te!==null&&!isNaN(te)&&h.te){tePS=r2((parseFloat(te)/h.te)*100);teWS=r2(tePS*W.te);}
  let initial=null,termGrade=null;
  if(wwWS!==null||ptWS!==null||teWS!==null){initial=r2((wwWS||0)+(ptWS||0)+(teWS||0));termGrade=transmute(initial);}
  return{wwT,wwPS,wwWS,ptT,ptPS,ptWS,tePS,teWS,initial,termGrade,quarterly:termGrade};
}
function calcFinal(name){const terms=[1,2,3].map(t=>calcT(name,t).termGrade).filter(v=>v!==null);return terms.length?Math.round(terms.reduce((a,b)=>a+b,0)/terms.length):null;}

// ── SETUP ──
function showRB(tab){
  APP.rbtab=tab;save();
  document.querySelectorAll('.rbtab').forEach(d=>d.style.display='none');
  document.querySelectorAll('#rbNav .stab').forEach(b=>b.classList.remove('active'));
  const el=document.getElementById('rb-'+tab);if(el)el.style.display='block';
  const idx=['setup','gradeentry','bulkentry','summary','analytics','loa','instructions'].indexOf(tab);
  document.querySelectorAll('#rbNav .stab')[idx]?.classList.add('active');
  if(tab==='setup')renderSetup();
  else if(tab==='gradeentry')renderGradeEntry();
  else if(tab==='bulkentry')renderBulkEntry();
  else if(tab==='summary')renderRBSummary();
  else if(tab==='analytics')renderAnalytics();
  else if(tab==='loa')renderLOA();
  else if(tab==='instructions')renderInstructions();
}

function renderSetup(){
  const el=document.getElementById('rb-setup');
  if(!hasClass()){el.innerHTML='<div class="ws"><h2>Select a class first</h2><p>Use the class selector bar above.</p></div>';return;}
  const cd=getCD();const s=cd.school;
  el.innerHTML=`
  <div class="ebar">
    <span class="elbl">💾 Save:</span>
    <button class="btn bg bsm" onclick="saveSetup()">✓ Save Setup</button>
    <button class="btn ba bsm" onclick="saveFile()">📥 Export .json</button>
    <label class="btn bo bsm" style="cursor:pointer">📂 Load File<input type="file" accept=".json" style="display:none" onchange="loadFile(this)"></label>
  </div>
  <div class="g2" style="margin-bottom:.9rem">
    <div class="card">
      <div class="ch"><div class="ct">🏫 School Information</div></div>
      <div class="g2" style="margin-bottom:.7rem">
        <div><div class="lbl">School Name</div><input class="inp" id="ss_name" value="${escH(s.name)}" placeholder="Angono National High School"></div>
        <div><div class="lbl">School ID</div><input class="inp" id="ss_id" value="${escH(s.id)}" placeholder="301417"></div>
      </div>
      <div class="g2" style="margin-bottom:.7rem">
        <div><div class="lbl">Region</div><input class="inp" id="ss_region" value="${escH(s.region)}" placeholder="IV-A CALABARZON"></div>
        <div><div class="lbl">Division</div><input class="inp" id="ss_division" value="${escH(s.division)}" placeholder="Rizal"></div>
      </div>
      <div class="g2" style="margin-bottom:.7rem">
        <div><div class="lbl">Grade & Section</div><input class="inp" id="ss_grade" value="${escH(s.grade)}" readonly style="background:var(--surf2)"></div>
        <div><div class="lbl">School Year</div><input class="inp" id="ss_sy" value="${escH(s.year||s.sy||APP.ac.sy)}" placeholder="2026-2027"></div>
      </div>
      <div class="g2">
        <div><div class="lbl">Teacher Name</div><input class="inp" id="ss_teacher" value="${escH(s.teacher)}" placeholder="DELA CRUZ, JUAN A."></div>
        <div><div class="lbl">Subject</div><input class="inp" id="ss_subject" value="${escH(s.subject)}" placeholder="Mathematics 10"></div>
      </div>
    </div>
    <div class="card">
      <div class="ch"><div class="ct">📅 Three-Term Calendar Reference</div><div class="cs">DO 009, s. 2026 — SY 2026-2027</div></div>
      ${[1,2,3].map(t=>`<div style="display:flex;align-items:center;gap:.7rem;padding:.6rem 0;border-bottom:1px solid var(--bdr)">
        <div class="tag tt${t}" style="min-width:60px;justify-content:center">Term ${t}</div>
        <div><div style="font-size:.82rem;font-weight:600">${TERM_DATES[t].start} – ${TERM_DATES[t].end}</div><div style="font-size:.7rem;color:var(--tx3)">${TERM_DATES[t].days} class days</div></div>
      </div>`).join('')}
      <div style="padding:.6rem 0;font-size:.75rem;color:var(--tx2);line-height:1.7"><strong>Grading:</strong> WW 30% + PT 50% + Term Exam 20% = Term Grade<br><strong>Final Grade</strong> = Average of Term 1 + Term 2 + Term 3</div>
    </div>
  </div>
  <div class="card" style="margin-bottom:.9rem">
    <div class="ch"><div class="ct">📐 HPS (Highest Possible Score) — Per Term</div><div class="cs">Enter max score per item. Leave blank if not used for that term.</div></div>
    ${[1,2,3].map(t=>`
    <div style="margin-bottom:1rem;padding:.9rem;background:var(--term${t}-2);border-radius:var(--rs);border:1px solid var(--term${t})">
      <div style="font-size:.85rem;font-weight:700;color:var(--term${t});margin-bottom:.65rem">Term ${t} — ${TERM_DATES[t].name}</div>
      <div class="lbl">Written Works (WW1–WW10)</div>
      <div class="hps10" style="margin-bottom:.6rem">${cd.hps[t].ww.map((v,i)=>`<div><div class="hpl">WW${i+1}</div><input class="hpi" type="number" min="0" id="hps_t${t}_ww_${i}" value="${v||''}" onchange="saveHPS()"></div>`).join('')}</div>
      <div class="lbl">Performance Tasks (PT1–PT10)</div>
      <div class="hps10" style="margin-bottom:.6rem">${cd.hps[t].pt.map((v,i)=>`<div><div class="hpl">PT${i+1}</div><input class="hpi" type="number" min="0" id="hps_t${t}_pt_${i}" value="${v||''}" onchange="saveHPS()"></div>`).join('')}</div>
      <div class="g2">
        <div><div class="lbl">Term Examination (TE) — Total max score</div><input class="inp" type="number" min="0" id="hps_t${t}_te" value="${cd.hps[t].te||''}" placeholder="e.g. 100" onchange="saveHPS()"></div>
        <div><div class="lbl">WW Total HPS</div><div style="padding:.5rem .7rem;background:var(--surf2);border-radius:var(--rs);border:1px solid var(--bdr);font-family:'DM Mono',monospace;font-size:.85rem">${cd.hps[t].ww.reduce((a,v)=>a+(v||0),0)||'—'}</div></div>
      </div>
    </div>`).join('')}
  </div>
  <div class="g2">
    <div class="card">
      <div class="ch"><div class="ct">👦 Male Students</div><div class="cs">${cd.students.male.length}</div></div>
      <ul class="sl">${cd.students.male.map((n,i)=>`<li class="si"><span class="sn">${i+1}</span><span class="st">${escH(n)}</span><button class="sd" onclick="removeStu('male',${i})">✕</button></li>`).join('')}</ul>
      <div class="ar"><input class="inp" id="addMale" placeholder="DELA CRUZ, JUAN" style="flex:1" onkeydown="if(event.key==='Enter')addStu('male')"><button class="btn bp bsm" onclick="addStu('male')">+ Add</button></div>
    </div>
    <div class="card">
      <div class="ch"><div class="ct">👧 Female Students</div><div class="cs">${cd.students.female.length}</div></div>
      <ul class="sl">${cd.students.female.map((n,i)=>`<li class="si"><span class="sn">${i+1}</span><span class="st">${escH(n)}</span><button class="sd" onclick="removeStu('female',${i})">✕</button></li>`).join('')}</ul>
      <div class="ar"><input class="inp" id="addFemale" placeholder="REYES, MARIA" style="flex:1" onkeydown="if(event.key==='Enter')addStu('female')"><button class="btn bp bsm" onclick="addStu('female')">+ Add</button></div>
    </div>
  </div>`;
}

function saveSetup(){const cd=getCD();const s=cd.school;s.name=document.getElementById('ss_name')?.value||s.name;s.id=document.getElementById('ss_id')?.value||s.id;s.region=document.getElementById('ss_region')?.value||s.region;s.division=document.getElementById('ss_division')?.value||s.division;s.teacher=document.getElementById('ss_teacher')?.value||s.teacher;s.subject=document.getElementById('ss_subject')?.value||s.subject;s.year=document.getElementById('ss_sy')?.value||s.year;s.sy=s.year;saveHPS();save();toast('✓ Setup saved');}
function saveHPS(){const cd=getCD();for(let t=1;t<=3;t++){for(let i=0;i<10;i++){const ww=document.getElementById(`hps_t${t}_ww_${i}`);cd.hps[t].ww[i]=ww&&ww.value?parseFloat(ww.value)||null:null;const pt=document.getElementById(`hps_t${t}_pt_${i}`);cd.hps[t].pt[i]=pt&&pt.value?parseFloat(pt.value)||null:null;}const te=document.getElementById(`hps_t${t}_te`);cd.hps[t].te=te&&te.value?parseFloat(te.value)||null:null;}save();}
function addStu(gender){const inp=document.getElementById(gender==='male'?'addMale':'addFemale');const name=inp.value.trim().toUpperCase();if(!name)return;const cd=getCD();if(cd.students[gender].includes(name)){toast('Student already in list');return;}cd.students[gender].push(name);save();inp.value='';renderSetup();}
function removeStu(gender,idx){const cd=getCD();const name=cd.students[gender][idx];if(!confirm(`Remove ${name}?`))return;cd.students[gender].splice(idx,1);for(let t=1;t<=3;t++){delete cd.grades[t][name];}save();renderSetup();}

// ── GRADE ENTRY ──
="btn br bsm" onclick="window.print()">📄 Print/PDF</button>
  </div>
  <div class="sf-form">
    <div class="sf-header"><div class="sf-title">School Form 9 (SF9) — Term Report Card</div><div class="sf-subtitle">Term ${t} · ${TERM_DATES[t].name} · DO 009, s. 2026</div></div>
    ${sfMeta(cd)}
    ${cards}
  </div>`;
}

function renderSF9(el,cd,stu){
  const t=APP.gt;let cards='';
  stu.forEach(s=>{const c=calcT(s.name,t);const final=calcFinal(s.name);
    cards+=`<div style="border:1px solid var(--bdr);border-radius:var(--r);padding:.9rem;margin-bottom:.6rem;background:var(--surf)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.55rem">
        <div><div style="font-size:.88rem;font-weight:700">${escH(s.name)}</div><div style="font-size:.68rem;color:var(--tx3)">${s.g==='male'?'Male':'Female'} · ${escH(APP.ac.grade)} ${escH(APP.ac.section)}</div></div>
        <div style="text-align:right"><div class="tag tt${t}">Term ${t} Report</div><div style="font-size:.65rem;color:var(--tx3);margin-top:.15rem">SY ${APP.ac.sy}</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:.45rem;margin-bottom:.55rem">
        ${[['Written Works',c.wwPS!==null?c.wwPS+'%':'—','WW 30%'],['Performance Tasks',c.ptPS!==null?c.ptPS+'%':'—','PT 50%'],['Term Exam',c.tePS!==null?c.tePS+'%':'—','TE 20%'],['Term Grade',c.termGrade||'—','Transmuted']].map(([l,v,sub])=>`<div style="background:var(--surf2);border:1px solid var(--bdr);border-radius:var(--rs);padding:.45rem;text-align:center"><div style="font-size:.58rem;color:var(--tx3)">${sub}</div><div style="font-size:.95rem;font-weight:700;font-family:'DM Mono',monospace">${v}</div><div style="font-size:.62rem;color:var(--tx2)">${l}</div></div>`).join('')}
      </div>
      <div style="font-size:.68rem;color:var(--tx2)">Final Grade: <strong style="color:${final?(final>=75?'var(--green)':'var(--red)'):'var(--tx3)'}">${final||'—'}</strong>${final?` · ${final>=75?'PASSED':'FAILED'}`:''}</div>
      <div style="margin-top:.3rem;font-size:.68rem;color:var(--tx3)">Teacher: ${escH(cd.school.teacher||'—')} · Subject: ${escH(cd.school.subject||'—')}</div>
    </div>`;
  });
  el.innerHTML=`<div class="sf-export-bar">
    <div class="ttabs">${[1,2,3].map(ti=>`<button class="ttab2 ${ti===t?`active-t${ti}`:''}" onclick="setActiveTerm(${ti});showSF('sf9')">${TERM_DATES[ti].name}</button>`).join('')}</div>
    <button class="btn br bsm" onclick="window.print()">📄 Print</button>
  </div>
  <div class="sf-form">
    <div class="sf-header"><div class="sf-title">SF9 — Term Report Card · Term ${t}</div><div class="sf-subtitle">${TERM_DATES[t].start} – ${TERM_DATES[t].end} · DO 009, s. 2026</div></div>
    ${sfMeta(cd)}
    ${cards}
  </div>`;
}

function renderSF10(el,cd,stu){
  // SF10 = Learner's Permanent Academic Record
  let rows='';let lastG=null;
  stu.forEach((s,i)=>{
    if(s.g!==lastG){rows+=`<tr><td colspan="7" style="background:${s.g==='male'?'#e8f4fd':'#fce8f3'};font-weight:700;font-size:.68rem;padding:.28rem .5rem">${s.g==='male'?'MALE':'FEMALE'}</td></tr>`;lastG=s.g;}
    const num=(s.g==='male'?cd.students.male:cd.students.female).indexOf(s.name)+1;
    const t1=calcT(s.name,1).termGrade,t2=calcT(s.name,2).termGrade,t3=calcT(s.name,3).termGrade;
    const vt=[t1,t2,t3].filter(v=>v!==null);
    const final=vt.length?Math.round(vt.reduce((a,b)=>a+b,0)/vt.length):null;
    rows+=`<tr>
      <td style="text-align:center;font-size:.68rem">${num}</td>
      <td class="sf-nc" style="font-size:.75rem">${escH(s.name)}</td>
      <td style="text-align:center;font-size:.75rem">${t1||'—'}</td>
      <td style="text-align:center;font-size:.75rem">${t2||'—'}</td>
      <td style="text-align:center;font-size:.75rem">${t3||'—'}</td>
      <td style="text-align:center;font-weight:700;font-size:.8rem;color:${final?(final>=75?'var(--green)':'var(--red)'):'var(--tx4)'}">${final||'—'}</td>
      <td style="text-align:center"><span class="${final?(final>=75?'bpass':'bfail'):''}">${final?(final>=75?'PASSED':'FAILED'):'—'}</span></td>
    </tr>`;
  });
  el.innerHTML=`
  <div class="sf-export-bar"><button class="btn bg bsm" onclick="excelSF10()">📊 Export Excel</button><button class="btn br bsm" onclick="window.print()">📄 Print/PDF</button></div>
  <div class="sf-form">
    <div class="sf-header"><div class="sf-title">School Form 10 (SF10) — Learner's Permanent Academic Record</div><div class="sf-subtitle">Three-Term System · DO 009, s. 2026 · SY ${APP.ac.sy}</div></div>
    ${sfMeta(cd)}
    <div style="overflow-x:auto"><table class="sf-tbl">
      <thead><tr>
        <th>#</th><th class="sf-nc">Learner's Name</th>
        <th><span class="tag tt1">Term 1</span></th>
        <th><span class="tag tt2">Term 2</span></th>
        <th><span class="tag tt3">Term 3</span></th>
        <th>Final Grade</th><th>Remarks</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div style="margin-top:1rem;display:flex;gap:1rem">
      <div><div style="font-size:.68rem;color:var(--tx3)">Prepared by</div><div style="border-top:1px solid var(--tx2);margin-top:1.5rem;padding-top:.2rem;font-size:.72rem;font-weight:600;min-width:160px">${escH(cd.school.teacher||'')}</div><div style="font-size:.65rem;color:var(--tx3)">Teacher</div></div>
      <div style="margin-left:2rem"><div style="font-size:.68rem;color:var(--tx3)">Noted by</div><div style="border-top:1px solid var(--tx2);margin-top:1.5rem;padding-top:.2rem;font-size:.72rem;font-weight:600;min-width:160px"></div><div style="font-size:.65rem;color:var(--tx3)">School Head</div></div>
    </div>
  </div>`;
}

// ══════════════════════════════════════════════
// 20. REGISTRAR SUBMISSION CENTER
// ══════════════════════════════════════════════
function renderRegistrar(){
  const el=document.getElementById('registrarContent');if(!el)return;
  if(!hasClass()){el.innerHTML='<div class="ws"><h2>Select a class first</h2><p>Load a class to prepare records for submission.</p></div>';return;}
  const cd=getCD();const stu=allStu();
  const completedTerms=[1,2,3].filter(t=>{const graded=stu.filter(s=>calcT(s.name,t).termGrade!==null).length;return graded===stu.length&&stu.length>0;});
  const allComplete=completedTerms.length===3;
  const finalCount=stu.filter(s=>calcFinal(s.name)!==null).length;

  el.innerHTML=`
  <div class="home-hero" style="margin-bottom:1.2rem">
    <div class="home-hero-title">📬 Registrar Submission Center</div>
    <div class="home-hero-sub">Package and submit completed term records to the school Registrar. All SF Forms and grade data are bundled into a single submission package.</div>
    <div class="home-hero-meta">
      <span class="home-hero-tag">${APP.ac.grade} ${APP.ac.section}</span>
      <span class="home-hero-tag">SY ${APP.ac.sy}</span>
      <span class="home-hero-tag">${stu.length} Students</span>
      <span class="home-hero-tag">${completedTerms.length}/3 Terms Complete</span>
    </div>
  </div>

  <!-- Readiness Checklist -->
  <div class="card" style="margin-bottom:.9rem">
    <div class="ch"><div class="ct">✅ Submission Readiness Checklist</div><div class="cs">Complete all items before submitting to the Registrar</div></div>
    <div style="display:flex;flex-direction:column;gap:.5rem">
      ${[
        {label:'School information filled in (Setup tab)',done:!!(cd.school.name&&cd.school.teacher&&cd.school.subject)},
        {label:'Student list complete (at least 1 student)',done:stu.length>0},
        {label:'Term 1 — All students graded',done:[1].every(t=>stu.length>0&&stu.every(s=>calcT(s.name,t).termGrade!==null))},
        {label:'Term 2 — All students graded',done:[2].every(t=>stu.length>0&&stu.every(s=>calcT(s.name,t).termGrade!==null))},
        {label:'Term 3 — All students graded',done:[3].every(t=>stu.length>0&&stu.every(s=>calcT(s.name,t).termGrade!==null))},
        {label:'Final grades computed (all 3 terms)',done:finalCount===stu.length&&stu.length>0},
      ].map(item=>`<div style="display:flex;align-items:center;gap:.7rem;padding:.55rem .75rem;background:${item.done?'var(--green2)':'var(--surf2)'};border:1px solid ${item.done?'var(--green)':'var(--bdr)'};border-radius:var(--rs)">
        <div style="width:22px;height:22px;border-radius:50%;background:${item.done?'var(--green)':'var(--bdr)'};color:${item.done?'#fff':'var(--tx3)'};display:flex;align-items:center;justify-content:center;font-size:.8rem;flex-shrink:0">${item.done?'✓':'○'}</div>
        <div style="font-size:.85rem;font-weight:${item.done?'600':'400'};color:${item.done?'var(--green)':'var(--tx2)'}">${item.label}</div>
      </div>`).join('')}
    </div>
  </div>

  <!-- Submission Package -->
  <div class="card" style="margin-bottom:.9rem">
    <div class="ch"><div class="ct">📦 Submission Package Contents</div><div class="cs">What will be included in the submission</div></div>
    <div class="g3">
      ${[
        {icon:'📋',label:'SF1 — School Register',desc:'Complete student list with enrollment data'},
        {icon:'📅',label:'SF2 — Attendance Records',desc:'Daily attendance for all recorded months'},
        {icon:'📊',label:'SF4 — Monthly Attendance',desc:'Monthly attendance summary report'},
        {icon:'🎓',label:'SF5 — Promotion Report',desc:'Promotion/retention status per student'},
        {icon:'📄',label:'SF9 — Term Report Cards',desc:'Report cards for all 3 terms'},
        {icon:'🗂',label:'SF10 — Permanent Records',desc:"Students' permanent academic records"},
        {icon:'📊',label:'E-Class Record',desc:'DepEd format Excel with all term grades'},
        {icon:'📋',label:'LOA Summary',desc:'Level of Achievement reports for all terms'},
      ].map(item=>`<div style="padding:.75rem;background:var(--surf2);border:1px solid var(--bdr);border-radius:var(--rs)">
        <div style="font-size:1.2rem;margin-bottom:.3rem">${item.icon}</div>
        <div style="font-size:.82rem;font-weight:600;color:var(--tx);margin-bottom:.2rem">${item.label}</div>
        <div style="font-size:.72rem;color:var(--tx3)">${item.desc}</div>
      </div>`).join('')}
    </div>
  </div>

  <!-- Submit Actions -->
  <div class="card">
    <div class="ch"><div class="ct">📤 Export & Submit</div></div>
    <div class="g2">
      <div>
        <div style="font-size:.88rem;font-weight:600;margin-bottom:.5rem">Step 1: Export All Records</div>
        <div style="font-size:.78rem;color:var(--tx2);margin-bottom:.9rem;line-height:1.6">Download a complete package of all records as an Excel file. Bring this file to the Registrar's office on a USB drive or send via email.</div>
        <button class="btn bg" onclick="exportFullPackage()" style="width:100%">📦 Export Full Submission Package (.xlsx)</button>
      </div>
      <div>
        <div style="font-size:.88rem;font-weight:600;margin-bottom:.5rem">Step 2: Print Hard Copies</div>
        <div style="font-size:.78rem;color:var(--tx2);margin-bottom:.9rem;line-height:1.6">Print the SF Forms for physical submission to the Registrar. Use the SF Forms section to print each form individually.</div>
        <button class="btn bp" onclick="showPage('sfforms')" style="width:100%">🖨 Go to SF Forms →</button>
      </div>
    </div>
    <div class="inst-tip" style="margin-top:.9rem">
      💡 <strong>Future update:</strong> Direct digital submission to the Registrar's dashboard will be available when the school upgrades to the Mendtrix School Management System.
    </div>
  </div>`;
}

function exportFullPackage(){
  toast('⏳ Building submission package...');
  setTimeout(()=>{
    try{excelGrades();toast('✓ Package exported — bring to Registrar');}
    catch(e){toast('✗ Export failed: '+e.message);}
  },300);
}

// ══════════════════════════════════════════════
// 21. HOME MENU
// ══════════════════════════════════════════════
function renderHome(){
  const el=document.getElementById('homeContent');if(!el)return;
  const user=CURRENT_USER;
  const subjectCards=[
    {id:'recordbook',icon:'📝',title:'Record Book',desc:'Enter grades per term (WW, PT, Term Exam), analytics, LOA reports',badge:'Core Module',bc:'var(--blue2)',btc:'var(--blue)'},
    {id:'gradesummary',icon:'📊',title:'Grade Summary',desc:'View final term grades, LOA overview, and student detail breakdown',badge:'Reports',bc:'var(--green2)',btc:'var(--green)'},
    {id:'dailyatt',icon:'📅',title:'Daily Attendance',desc:'Record student attendance day by day — Present, Absent, Late',badge:'Daily',bc:'var(--amber2)',btc:'var(--amber)'},
    {id:'attsummary',icon:'📋',title:'Attendance Summary',desc:'Monthly attendance table, summary stats, export to Excel/PDF',badge:'Monthly',bc:'var(--teal2)',btc:'var(--teal)'},
    {id:'sfforms',icon:'🗂',title:'School Forms (SF1–SF10)',desc:'Auto-generate SF1 register, SF2 attendance, SF5 promotion, SF9 report cards, SF10 permanent records',badge:'DepEd Forms',bc:'var(--purple2)',btc:'var(--purple)'},
  ];
  const advisoryCards=[...subjectCards,
    {id:'consolidated',icon:'🔀',title:'Consolidated Grades',desc:'Import subject teacher JSONs to generate consolidated term grades and promotion status',badge:'Advisory',bc:'var(--red2)',btc:'var(--red)'},
    {id:'registrar',icon:'📬',title:'Registrar Submission',desc:'Package all records and submit to the school Registrar',badge:'Submit',bc:'var(--pink2)',btc:'var(--pink)'},
  ];
  const cards=APP.role==='advisory'?advisoryCards:subjectCards;

  el.innerHTML=`
  <div class="home-hero">
    <div class="home-hero-title">Welcome, ${user?user.firstName+' '+user.lastName:'Teacher'}!</div>
    <div class="home-hero-sub">ANHS E-Class Record System · Three-Term Calendar · DO 009, s. 2026<br>${hasClass()?`Active class: <strong>${APP.ac.grade} – ${APP.ac.section}</strong> · SY ${APP.ac.sy}`:'<span style="opacity:.7">Select a class in the bar above to begin.</span>'}</div>
    <div class="home-hero-meta">
      <span class="home-hero-tag">${APP.role==='advisory'?'Advisory Teacher':'Subject Teacher'}</span>
      <span class="home-hero-tag">Three-Term · DO 009, s. 2026</span>
      <span class="home-hero-tag">WW 30% · PT 50% · TE 20%</span>
      ${hasClass()?`<span class="home-hero-tag">${allStu().length} students</span>`:''}
    </div>
  </div>

  ${hasClass()?`
  <!-- Quick Stats -->
  <div class="g3" style="margin-bottom:1.2rem">
    ${[1,2,3].map(t=>{
      const stu=allStu();const graded=stu.length?stu.filter(s=>calcT(s.name,t).termGrade!==null).length:0;
      const pct2=stu.length?Math.round((graded/stu.length)*100):0;
      return`<div class="card" style="border-top:3px solid var(--term${t})">
        <div class="ch"><div class="ct"><span class="tag tt${t}">Term ${t}</span></div><div class="cs">${TERM_DATES[t].start.split(',')[0]}</div></div>
        <div style="font-size:1.4rem;font-weight:700;font-family:'DM Mono',monospace;color:var(--term${t})">${graded}/${stu.length}</div>
        <div style="font-size:.72rem;color:var(--tx3);margin-bottom:.5rem">Students graded</div>
        <div style="background:var(--bg);border-radius:99px;height:7px;overflow:hidden">
          <div style="height:100%;border-radius:99px;background:var(--term${t});width:${pct2}%;transition:width .5s"></div>
        </div>
        <div style="font-size:.68rem;color:var(--tx3);margin-top:.2rem">${pct2}% complete</div>
      </div>`;}).join('')}
  </div>`:''}

  <div class="home-grid">
    ${cards.map(c=>`<div class="home-card" onclick="showPage('${c.id}')">
      <div class="home-card-icon">${c.icon}</div>
      <div class="home-card-title">${c.title}</div>
      <div class="home-card-desc">${c.desc}</div>
      <div class="home-card-badge" style="background:${c.bc};color:${c.btc}">${c.badge}</div>
    </div>`).join('')}
  </div>`;
}

// ══════════════════════════════════════════════
// 22. INSTRUCTIONS
// ══════════════════════════════════════════════
function renderInstructions(){
  const el=document.getElementById('rb-instructions');if(!el)return;
  el.innerHTML=`
  <div class="inst-hero">
    <div class="inst-hero-title">📖 User Guide — Three-Term E-Class Record System</div>
    <div class="inst-hero-sub">DO 009, s. 2026 compliant · WW 30% · PT 50% · Term Examination 20% · Final Grade = Average of Term 1 + Term 2 + Term 3</div>
  </div>

  <div class="card" style="margin-bottom:.9rem">
    <div class="ch"><div class="ct">🆕 What Changed from the Old System?</div></div>
    <div class="g2">
      <div style="padding:.75rem;background:var(--red2);border-radius:var(--rs)"><div style="font-size:.78rem;font-weight:700;color:var(--red);margin-bottom:.5rem">❌ OLD (4-Quarter System)</div><div style="font-size:.78rem;color:var(--tx2);line-height:1.8">• Quarter 1, Quarter 2, Quarter 3, Quarter 4<br>• Quarterly Assessment (QA)<br>• Final Grade = Average of Q1 + Q2 + Q3 + Q4<br>• 10 weeks per quarter</div></div>
      <div style="padding:.75rem;background:var(--green2);border-radius:var(--rs)"><div style="font-size:.78rem;font-weight:700;color:var(--green);margin-bottom:.5rem">✅ NEW (Three-Term System — DO 009, s. 2026)</div><div style="font-size:.78rem;color:var(--tx2);line-height:1.8">• Term 1 (Jun 8–Sep 15), Term 2 (Sep 16–Dec 18), Term 3 (Jan 4–Apr 8)<br>• Term Examination (TE) instead of QA<br>• Final Grade = Average of Term 1 + Term 2 + Term 3<br>• 69/65/67 class days per term</div></div>
    </div>
  </div>

  <div class="card" style="margin-bottom:.9rem">
    <div class="ch"><div class="ct">🚀 First-Time Setup</div></div>
    <div class="inst-step">
      <div class="inst-step-num">1</div>
      <div><div class="inst-step-title">Create your account or sign in</div><div class="inst-step-desc">Register with your Employee ID, name, school name, region, division, and role (Subject or Advisory Teacher). Your data is saved to your account so it stays separate from other teachers.</div></div>
    </div>
    <div class="inst-step">
      <div class="inst-step-num">2</div>
      <div><div class="inst-step-title">Select Grade Level, Section, and School Year</div><div class="inst-step-desc">Use the bar at the top of the screen. Select your grade (e.g. Grade 10), type your section (e.g. PEARL), confirm the School Year (2026-2027), then click <strong>Load Class</strong>.</div></div>
    </div>
    <div class="inst-step">
      <div class="inst-step-num">3</div>
      <div><div class="inst-step-title">Go to Setup and fill in school info</div><div class="inst-step-desc">Enter your school name, school ID, region, division, subject, and your name as teacher. Then set the HPS (Highest Possible Score) for each Written Work, Performance Task, and Term Examination for each of the 3 terms.</div></div>
    </div>
    <div class="inst-step">
      <div class="inst-step-num">4</div>
      <div><div class="inst-step-title">Add your students</div><div class="inst-step-desc">Add male students in the left column and female students in the right column. Type the full name in LAST NAME, FIRST NAME format and press Enter or click Add.</div></div>
    </div>
    <div class="inst-step">
      <div class="inst-step-num">5</div>
      <div><div class="inst-step-title">Save Setup and Export your file</div><div class="inst-step-desc">Click Save Setup, then click Export .json File. Save this file to Google Drive, USB, or your email. This is your backup — always export after every session.</div></div>
    </div>
    <div class="inst-tip">✅ Setup is done once per subject per school year. Next time, just sign in and click Load File to restore everything.</div>
  </div>

  <div class="card" style="margin-bottom:.9rem">
    <div class="ch"><div class="ct">✏️ How to Enter Grades (Three-Term)</div></div>
    <div class="inst-step">
      <div class="inst-step-num">1</div>
      <div><div class="inst-step-title">Select the correct term</div><div class="inst-step-desc">At the top of the Term Bar, click <span class="tag tt1">Term 1</span>, <span class="tag tt2">Term 2</span>, or <span class="tag tt3">Term 3</span>. The Grade Entry table will show only the scores for that term.</div></div>
    </div>
    <div class="inst-step">
      <div class="inst-step-num">2</div>
      <div><div class="inst-step-title">Go to Grade Entry and type scores</div><div class="inst-step-desc">Click any score box and type the student's score. The system automatically computes: Total → Percentage Score (PS) → Weighted Score (WS) → Initial Grade → Term Grade (transmuted). No need to press Save — it saves automatically.</div></div>
    </div>
    <div class="inst-step">
      <div class="inst-step-num">3</div>
      <div><div class="inst-step-title">Columns explained</div><div class="inst-step-desc"><strong>WW1–WW10</strong>: Individual Written Work scores · <strong>PT1–PT10</strong>: Individual Performance Task scores · <strong>TE</strong>: Term Examination score (single item at end of term) · <strong>PS</strong>: Percentage Score · <strong>WS</strong>: Weighted Score · <strong>Term Grade</strong>: Transmuted final grade for the term</div></div>
    </div>
    <div class="inst-warn">⚠️ Important: You must set the HPS (Highest Possible Score) in Setup first. Without HPS, grades cannot be computed.</div>
  </div>

  <div class="card" style="margin-bottom:.9rem">
    <div class="ch"><div class="ct">📋 School Forms (SF1–SF10)</div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem">
      ${[['SF1','School Register','Complete student list with enrollment info'],['SF2','Daily Attendance','Monthly attendance record'],['SF4','Monthly Attendance Report','Monthly summary of absences and presence'],['SF5','Promotion Report','Who is promoted or retained after all 3 terms'],['SF9','Term Report Card','Per-student report card per term'],['SF10','Permanent Academic Record','Full academic record for the Registrar']].map(([sf,title,desc])=>`<div style="padding:.65rem;background:var(--surf2);border:1px solid var(--bdr);border-radius:var(--rs)">
        <div class="tag tp" style="margin-bottom:.3rem">${sf}</div>
        <div style="font-size:.82rem;font-weight:600;color:var(--tx);margin-bottom:.2rem">${title}</div>
        <div style="font-size:.72rem;color:var(--tx3)">${desc}</div>
      </div>`).join('')}
    </div>
    <div class="inst-tip" style="margin-top:.75rem">All SF forms are auto-generated from your class data. Go to <strong>SF Forms</strong> in the navigation to view and print them.</div>
  </div>

  <div class="inst-section-title">❓ Frequently Asked Questions</div>
  ${[
    ['Why does my system show Term 1/2/3 instead of Quarters?','The Department of Education issued DO 009, s. 2026 which changes the school calendar from a 4-quarter system to a 3-term system. Term 1 runs June 8–September 15, Term 2 runs September 16–December 18, and Term 3 runs January 4–April 8 of the following year.'],
    ['What is the difference between QA (old) and TE (new)?','QA (Quarterly Assessment) was the old name for the final exam given at the end of each quarter. TE (Term Examination) is the new name under the three-term system. The formula is the same — it still counts for 20% of the term grade.'],
    ['How is the Final Grade computed?','Final Grade = Average of Term 1 + Term 2 + Term 3, rounded to the nearest whole number. For example: (85 + 88 + 90) ÷ 3 = 87.67 → Final Grade: 88.'],
    ['What happens to my old Quarter 1-4 data?','If you have data from the old 4-quarter system, it is kept separately. This new system is designed fresh for the three-term calendar. You will need to re-enter grades for each term.'],
    ['My grades disappeared after opening on a different computer. What do I do?','Sign in with the same account on the new computer, then use Load File to import your exported .json backup file. Your grades will be fully restored.'],
    ['How does an Advisory Teacher use the system?','Select Advisory Teacher when signing in or switching roles. Use the Consolidated Grades module to import JSON files from all subject teachers. The system computes the General Average and promotion/retention status for each student automatically.'],
    ['How do I submit records to the Registrar?','Go to the Registrar Submission Center from the navigation. Export the full submission package as an Excel file. Bring the file to the Registrar on a USB drive or send it via email. Printed SF Forms can also be submitted as physical copies.'],
  ].map(([q,a])=>`<div class="inst-faq">
    <div class="inst-faq-q" onclick="toggleFAQ(this)">${q}<span>▼</span></div>
    <div class="inst-faq-a">${a}</div>
  </div>`).join('')}
  <div class="inst-tip" style="margin-top:.9rem">📞 For technical support, contact Mendtrix IT Services.</div>`;
}

function toggleFAQ(el){const ans=el.nextElementSibling;const isOpen=ans.classList.contains('open');document.querySelectorAll('.inst-faq-a').forEach(a=>a.classList.remove('open'));document.querySelectorAll('.inst-faq-q span').forEach(s=>s.textContent='▼');if(!isOpen){ans.classList.add('open');el.querySelector('span').textContent='▲';}}

// ══════════════════════════════════════════════
// 23. EXCEL EXPORT — THREE-TERM DEPED FORMAT
// ══════════════════════════════════════════════
function excelGrades(){
  const cd=getCD();const wb=XLSX.utils.book_new();
  // INPUT DATA Sheet
  const iRows=[
    ['Official E-Class Record — Three-Term System (DO 009, s. 2026)'],[''],
    ['','REGION',cd.school.region||'','','DIVISION',cd.school.division||''],
    ['','SCHOOL NAME',cd.school.name||'','','SCHOOL ID',cd.school.id||'','SCHOOL YEAR',cd.school.sy||cd.school.year||''],
    [''],['LEARNERS — MALE'],
    ...cd.students.male.map((n,i)=>[i+1,n]),
    [''],['LEARNERS — FEMALE'],
    ...cd.students.female.map((n,i)=>[i+1,n])
  ];
  const wsI=XLSX.utils.aoa_to_sheet(iRows);wsI['!cols']=[{wch:5},{wch:45}];
  XLSX.utils.book_append_sheet(wb,wsI,'INPUT DATA');

  // Per-Term Sheets
  const tNames=['TERM 1 (Jun 8–Sep 15)','TERM 2 (Sep 16–Dec 18)','TERM 3 (Jan 4–Apr 8)'];
  for(let t=1;t<=3;t++){
    const h=cd.hps[t];
    const wwC=Math.max(h.ww.filter(v=>v).length,1);
    const ptC=Math.max(h.pt.filter(v=>v).length,1);
    const hasTE=!!h.te;
    const wwHT=h.ww.reduce((a,v)=>a+(v||0),0);
    const ptHT=h.pt.reduce((a,v)=>a+(v||0),0);
    const rows=[];
    rows.push(['Official E-Class Record — Three-Term System']);
    rows.push(['']);
    rows.push(['','REGION',cd.school.region||'','','DIVISION',cd.school.division||'']);
    rows.push(['','SCHOOL NAME',cd.school.name||'','','SCHOOL ID',cd.school.id||'','SCHOOL YEAR',cd.school.sy||'']);
    rows.push([tNames[t-1],'','GRADE & SECTION:',`${cd.school.grade||''}–${cd.school.section||''}`,'','TEACHER:',cd.school.teacher||'','','SUBJECT:',cd.school.subject||'']);
    rows.push(['']);
    // Group headers
    const hdr1=['','LEARNER\'S NAME'];
    hdr1.push('WRITTEN WORKS (30%)');for(let i=1;i<wwC+3;i++)hdr1.push('');
    hdr1.push('PERFORMANCE TASKS (50%)');for(let i=1;i<ptC+3;i++)hdr1.push('');
    if(hasTE){hdr1.push('TERM EXAMINATION (20%)','','');}
    hdr1.push('Initial Grade','Term Grade');
    rows.push(hdr1);
    // Item numbers
    const hdr2=['',''];
    for(let i=0;i<wwC;i++)hdr2.push(i+1);hdr2.push('Total','PS','WS');
    for(let i=0;i<ptC;i++)hdr2.push(i+1);hdr2.push('Total','PS','WS');
    if(hasTE)hdr2.push('Score','PS','WS');
    hdr2.push('','');
    rows.push(hdr2);
    // HPS row
    const hpsR=['','HIGHEST POSSIBLE SCORE'];
    for(let i=0;i<wwC;i++)hpsR.push(h.ww[i]||'');hpsR.push(wwHT,100,'30%');
    for(let i=0;i<ptC;i++)hpsR.push(h.pt[i]||'');hpsR.push(ptHT,100,'50%');
    if(hasTE)hpsR.push(h.te,100,'20%');
    hpsR.push('','');
    rows.push(hpsR);
    // Student data
    [{n:'MALE',arr:cd.students.male},{n:'FEMALE',arr:cd.students.female}].forEach(({n,arr})=>{
      rows.push(['',n]);
      arr.forEach((sn,idx)=>{
        const g=(cd.grades[t]&&cd.grades[t][sn])||{};
        const ww=g.ww||Array(10).fill(null);const pt=g.pt||Array(10).fill(null);const te=g.te!==undefined&&g.te!==null?g.te:'';
        const c=calcT(sn,t);
        const row=[idx+1,sn];
        for(let j=0;j<wwC;j++)row.push(ww[j]!==null&&ww[j]!==undefined?ww[j]:'');
        row.push(c.wwT!==null?c.wwT:'',c.wwPS!==null?c.wwPS:'',c.wwWS!==null?c.wwWS:'');
        for(let j=0;j<ptC;j++)row.push(pt[j]!==null&&pt[j]!==undefined?pt[j]:'');
        row.push(c.ptT!==null?c.ptT:'',c.ptPS!==null?c.ptPS:'',c.ptWS!==null?c.ptWS:'');
        if(hasTE)row.push(te!==''?te:'',c.tePS!==null?c.tePS:'',c.teWS!==null?c.teWS:'');
        row.push(c.initial!==null?c.initial:'',c.termGrade||'');
        rows.push(row);
      });
    });
    const wsT=XLSX.utils.aoa_to_sheet(rows);
    wsT['!cols']=[{wch:4},{wch:42},...Array(wwC+ptC+12).fill({wch:7})];
    XLSX.utils.book_append_sheet(wb,wsT,`Term_${t}`);
  }

  // SUMMARY Sheet
  const sumR=[
    ['Summary of Term Grades — Three-Term System (DO 009, s. 2026)'],[''],
    ['','REGION',cd.school.region||'','','DIVISION',cd.school.division||''],
    ['','SCHOOL NAME',cd.school.name||'','','SCHOOL ID',cd.school.id||''],
    ['','GRADE & SECTION:',`${cd.school.grade||''}–${cd.school.section||''}`,'','TEACHER:',cd.school.teacher||'','SUBJECT:',cd.school.subject||'','SCHOOL YEAR:',cd.school.sy||''],
    [''],
    ['#','LEARNER\'S NAME','TERM 1','TERM 2','TERM 3','FINAL GRADE','REMARK']
  ];
  [{n:'MALE',arr:cd.students.male},{n:'FEMALE',arr:cd.students.female}].forEach(({n,arr})=>{
    sumR.push(['',n]);
    arr.forEach((sn,i)=>{
      const t1=calcT(sn,1).termGrade,t2=calcT(sn,2).termGrade,t3=calcT(sn,3).termGrade;
      const vt=[t1,t2,t3].filter(v=>v!==null);
      const final=vt.length?Math.round(vt.reduce((a,b)=>a+b,0)/vt.length):null;
      sumR.push([i+1,sn,t1||'',t2||'',t3||'',final||'',final?(final>=75?'PASSED':'FAILED'):'']);
    });
  });
  const wsSum=XLSX.utils.aoa_to_sheet(sumR);wsSum['!cols']=[{wch:4},{wch:42},{wch:9},{wch:9},{wch:9},{wch:11},{wch:10}];
  XLSX.utils.book_append_sheet(wb,wsSum,'SUMMARY');

  // LOA SUMMARY Sheet
  const loaRows=[['LOA SUMMARY — Three-Term System']];
  loaRows.push(['Subject:',cd.school.subject,'Teacher:',cd.school.teacher,'Section:',`${APP.ac.grade} ${APP.ac.section}`,'SY:',APP.ac.sy]);
  loaRows.push(['']);
  const stu=allStu();const N=stu.length;
  function pct(n,t){return t?r2((n/t)*100):0}
  for(let t=1;t<=3;t++){
    loaRows.push([`TERM ${t} — ${TERM_DATES[t].name}`]);
    const wwPS=stu.map(s=>calcT(s.name,t).wwPS);const ptPS=stu.map(s=>calcT(s.name,t).ptPS);
    const tePS=stu.map(s=>calcT(s.name,t).tePS);const tg=stu.map(s=>calcT(s.name,t).termGrade);
    function pB(sc){const r={np:0,lp:0,np2:0,p:0,hp:0};sc.forEach(v=>{if(v===null)return;if(v>=90)r.hp++;else if(v>=75)r.p++;else if(v>=50)r.np2++;else if(v>=25)r.lp++;else r.np++;});return r;}
    function dB(sc){const r={dnm:0,fs:0,s:0,vs:0,o1:0,o2:0,o3:0};sc.forEach(v=>{if(v===null)return;if(v>=98)r.o3++;else if(v>=95)r.o2++;else if(v>=90)r.o1++;else if(v>=85)r.vs++;else if(v>=80)r.s++;else if(v>=75)r.fs++;else r.dnm++;});return r;}
    const wwB=pB(wwPS);const tgB=dB(tg);
    loaRows.push(['WRITTEN WORKS PROFICIENCY']);
    loaRows.push(['Section','Learners','Not Proficient (0-24%)','','Low Proficient (25-49%)','','Nearly Proficient (50-74%)','','Proficient (75-89%)','','Highly Proficient (90-100%)','']);
    loaRows.push(['','','No.','%','No.','%','No.','%','No.','%','No.','%']);
    loaRows.push([`${APP.ac.grade}–${APP.ac.section}`,N,wwB.np,pct(wwB.np,N)+'%',wwB.lp,pct(wwB.lp,N)+'%',wwB.np2,pct(wwB.np2,N)+'%',wwB.p,pct(wwB.p,N)+'%',wwB.hp,pct(wwB.hp,N)+'%']);
    loaRows.push(['TERM GRADE DESCRIPTORS']);
    loaRows.push(['Section','Learners','Did Not Meet (≤74%)','','Fairly Satisfactory (75-79%)','','Satisfactory (80-84%)','','Very Satisfactory (85-89%)','','Outstanding (90-100%)','']);
    loaRows.push(['','','No.','%','No.','%','No.','%','No.','%','No.','%']);
    loaRows.push([`${APP.ac.grade}–${APP.ac.section}`,N,tgB.dnm,pct(tgB.dnm,N)+'%',tgB.fs,pct(tgB.fs,N)+'%',tgB.s,pct(tgB.s,N)+'%',tgB.vs,pct(tgB.vs,N)+'%',tgB.o1+tgB.o2+tgB.o3,pct(tgB.o1+tgB.o2+tgB.o3,N)+'%']);
    loaRows.push(['']);
  }
  const wsLOA=XLSX.utils.aoa_to_sheet(loaRows);wsLOA['!cols']=[{wch:22},{wch:9},...Array(12).fill({wch:9})];
  XLSX.utils.book_append_sheet(wb,wsLOA,'LOA SUMMARY');

  const fn=`EClassRecord_3Term_${(cd.school.subject||'Subject').replace(/\s+/g,'_').substring(0,12)}_${APP.ac.grade.replace(/\s/g,'')}_${APP.ac.section}_SY${APP.ac.sy}.xlsx`;
  XLSX.writeFile(wb,fn);
  toast('✓ E-Class Record exported — Three-Term DepEd format');
}

function excelAtt(){
  const cd=getCD();const stu=allStu();const dates=Object.keys(cd.att).sort();
  const wb=XLSX.utils.book_new();
  const rows=stu.map((s,i)=>{let P=0,A=0,L=0;const cells=dates.map(d=>{const t=(cd.att[d]||{})[s.name]||'';if(t==='P')P++;else if(t==='A')A++;else if(t==='L')L++;return t||'';});return[i+1,s.name,...cells,P,A,L];});
  const ws=XLSX.utils.aoa_to_sheet([['#','Student',...dates,'Total P','Total A','Total L'],...rows]);
  XLSX.utils.book_append_sheet(wb,ws,'Attendance');
  XLSX.writeFile(wb,`Attendance_${APP.ac.grade.replace(/\s/g,'')}_${APP.ac.section}.xlsx`);
  toast('✓ Attendance exported');
}

function excelSF1(){
  const cd=getCD();const wb=XLSX.utils.book_new();
  const rows=[['#','Learner\'s Name (Last, First, Middle)','Sex','LRN','Date of Birth','Age','Barangay','Remarks']];
  cd.students.male.forEach((n,i)=>rows.push([i+1,n,'Male','','','','','']));
  cd.students.female.forEach((n,i)=>rows.push([i+1,n,'Female','','','','','']));
  const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:4},{wch:42},{wch:8},{wch:14},{wch:14},{wch:5},{wch:16},{wch:14}];
  XLSX.utils.book_append_sheet(wb,ws,'SF1 School Register');
  XLSX.writeFile(wb,`SF1_SchoolRegister_${APP.ac.grade.replace(/\s/g,'')}_${APP.ac.section}.xlsx`);
  toast('✓ SF1 exported');
}

function excelSF2(mon){
  const cd=getCD();const stu=allStu();const dates=Object.keys(cd.att).sort().filter(d=>d.startsWith(mon));
  const wb=XLSX.utils.book_new();
  const header=['#','Student',...dates,'P','A','L'];
  const rows=stu.map((s,i)=>{let P=0,A=0,L=0;const cells=dates.map(d=>{const t=(cd.att[d]||{})[s.name]||'';if(t==='P')P++;else if(t==='A')A++;else if(t==='L')L++;return t;});return[i+1,s.name,...cells,P,A,L];});
  const ws=XLSX.utils.aoa_to_sheet([header,...rows]);
  XLSX.utils.book_append_sheet(wb,ws,'SF2 Attendance '+mon);
  XLSX.writeFile(wb,`SF2_Attendance_${mon}_${APP.ac.section}.xlsx`);
  toast('✓ SF2 exported');
}

function excelSF4(){
  const cd=getCD();const stu=allStu();const dates=Object.keys(cd.att).sort();
  const months=[...new Set(dates.map(d=>d.substring(0,7)))];
  const wb=XLSX.utils.book_new();
  const rows=[['Month','Enrollment','School Days','Total Present','Total Absent','Total Late','Remarks']];
  months.forEach(mon=>{const monDates=dates.filter(d=>d.startsWith(mon));let P=0,A=0,L=0;stu.forEach(s=>{monDates.forEach(d=>{const st=(cd.att[d]||{})[s.name]||'';if(st==='P')P++;else if(st==='A')A++;else if(st==='L')L++;});});rows.push([mon,stu.length,monDates.length,P,A,L,'']);});
  const ws=XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb,ws,'SF4 Monthly Attendance');
  XLSX.writeFile(wb,`SF4_Monthly_${APP.ac.section}.xlsx`);
  toast('✓ SF4 exported');
}

function excelSF5(){
  const cd=getCD();const stu=allStu();
  const wb=XLSX.utils.book_new();
  const rows=[['#','Learner\'s Name','Term 1','Term 2','Term 3','Final Grade','Status','Remarks']];
  stu.forEach((s,i)=>{
    const t1=calcT(s.name,1).termGrade,t2=calcT(s.name,2).termGrade,t3=calcT(s.name,3).termGrade;
    const vt=[t1,t2,t3].filter(v=>v!==null);const final=vt.length?Math.round(vt.reduce((a,b)=>a+b,0)/vt.length):null;
    rows.push([i+1,s.name,t1||'',t2||'',t3||'',final||'',final?(final>=75?'PROMOTED':'RETAINED'):'','']);
  });
  const ws=XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb,ws,'SF5 Promotion Report');
  XLSX.writeFile(wb,`SF5_Promotion_${APP.ac.section}.xlsx`);
  toast('✓ SF5 exported');
}

function excelSF10(){
  const cd=getCD();const stu=allStu();
  const wb=XLSX.utils.book_new();
  const rows=[['#','Learner\'s Name','Sex','Term 1','Term 2','Term 3','Final Grade','Remarks']];
  stu.forEach((s,i)=>{
    const t1=calcT(s.name,1).termGrade,t2=calcT(s.name,2).termGrade,t3=calcT(s.name,3).termGrade;
    const vt=[t1,t2,t3].filter(v=>v!==null);const final=vt.length?Math.round(vt.reduce((a,b)=>a+b,0)/vt.length):null;
    rows.push([i+1,s.name,s.g==='male'?'M':'F',t1||'',t2||'',t3||'',final||'',final?(final>=75?'PASSED':'FAILED'):'']);
  });
  const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:4},{wch:42},{wch:5},{wch:9},{wch:9},{wch:9},{wch:11},{wch:10}];
  XLSX.utils.book_append_sheet(wb,ws,'SF10 Permanent Record');
  XLSX.writeFile(wb,`SF10_PermanentRecord_${APP.ac.section}.xlsx`);
  toast('✓ SF10 exported');
}

// ══════════════════════════════════════════════
// 24. JSON EXPORT — TERM FORMAT
// ══════════════════════════════════════════════
function jsonExport(){
  const cd=getCD();const stu=allStu();
  const payload={
    version:'2.0',exportType:'termSummaryJSON',
    school:cd.school.name,teacher:cd.school.teacher,
    subject:cd.school.subject,section:APP.ac.section,
    grade:APP.ac.grade,year:APP.ac.sy,
    exportDate:today(),
    termCalendar:'Three-Term (DO 009, s. 2026)',
    students:stu.map(s=>{
      const t1=calcT(s.name,1),t2=calcT(s.name,2),t3=calcT(s.name,3);
      const vt=[t1,t2,t3].map(c=>c.termGrade).filter(v=>v!==null);
      const final=vt.length?Math.round(vt.reduce((a,b)=>a+b,0)/vt.length):null;
      return{name:s.name,gender:s.g,terms:{T1:t1.termGrade,T2:t2.termGrade,T3:t3.termGrade},finalGrade:final,remark:final?(final>=75?'PASSED':'FAILED'):''};
    })
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=`TermGrades_${(cd.school.subject||'Subject').replace(/\s+/g,'_').substring(0,12)}_${APP.ac.section}.json`;
  a.click();URL.revokeObjectURL(a.href);
  toast('✓ JSON exported — share with Advisory Teacher');
}

// ══════════════════════════════════════════════
// 25. PDF / PRINT FUNCTIONS
// ══════════════════════════════════════════════
function printWin(title,bodyHtml){
  const w=window.open('','_blank','width=900,height=700');
  if(!w)return;
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>
    body{font-family:Arial,sans-serif;font-size:9px;color:#1a1d23;margin:0;padding:12px}
    table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #333;padding:3px 5px;text-align:center}
    thead th{background:#f0f2f5;font-weight:700;font-size:9px}
    .nc{text-align:left;min-width:130px}
    .pass{color:#0d9488;font-weight:700}.fail{color:#dc2626;font-weight:700}
    .bold{font-weight:700}.sh-ww{background:#e8f0fe;color:#1a56db}
    .sh-pt{background:#fef9ec;color:#d97706}.sh-te{background:#e6faf8;color:#0d9488}
    h1{font-size:13px;font-weight:700;margin:0 0 4px}
    .meta{font-size:8px;color:#666;margin-bottom:8px}
    .hrow td{background:#fffbeb}
    .sec{font-weight:700;font-size:9px;padding:3px 7px}
    @page{size:A4 landscape;margin:7mm}
  </style></head><body>${bodyHtml}<script>window.onload=()=>setTimeout(()=>window.print(),350);<\/script></body></html>`);
  w.document.close();
}

function hdr(title){const cd=getCD();return`<h1>${title}</h1><div class="meta">${escH(cd.school.subject||'')} · ${APP.ac.grade} ${APP.ac.section} · ${escH(cd.school.teacher||'')} · SY ${APP.ac.sy} · Three-Term (DO 009, s. 2026)</div>`;}

function pdfSummary(){
  const cd=getCD();const stu=allStu();let rows='';let lastG=null;
  stu.forEach(s=>{
    if(s.g!==lastG){rows+=`<tr><td colspan="7" class="sec" style="background:${s.g==='male'?'#e8f4fd':'#fce8f3'}">${s.g==='male'?'MALE':'FEMALE'}</td></tr>`;lastG=s.g;}
    const num=(s.g==='male'?cd.students.male:cd.students.female).indexOf(s.name)+1;
    const t1=calcT(s.name,1).termGrade,t2=calcT(s.name,2).termGrade,t3=calcT(s.name,3).termGrade;
    const vt=[t1,t2,t3].filter(v=>v!==null);const final=vt.length?Math.round(vt.reduce((a,b)=>a+b,0)/vt.length):null;
    rows+=`<tr><td>${num}</td><td class="nc">${escH(s.name)}</td><td class="${t1?(t1>=75?'pass':'fail'):''}">${t1||'—'}</td><td class="${t2?(t2>=75?'pass':'fail'):''}">${t2||'—'}</td><td class="${t3?(t3>=75?'pass':'fail'):''}">${t3||'—'}</td><td class="bold" style="color:#1a56db">${final||'—'}</td><td class="${final?(final>=75?'pass':'fail'):''}">${final?(final>=75?'PASSED':'FAILED'):'—'}</td></tr>`;
  });
  printWin('Term Grade Summary',`${hdr('Summary of Term Grades')}<table><thead><tr><th>#</th><th class="nc">Learner's Name</th><th>Term 1</th><th>Term 2</th><th>Term 3</th><th>Final</th><th>Remark</th></tr></thead><tbody>${rows}</tbody></table>`);
}

function pdfLOA(){window.print();}
function pdfAttSum(){window.print();}
function pdfDailyAtt(ds){window.print();}
function pdfCons(){window.print();}
function pdfSF1(){window.print();}

function excelCons(){
  if(!APP.imported.length){toast('Import files first');return;}
  const subjects=APP.imported.map(s=>s.subject||'?');
  const allNames=new Set();APP.imported.forEach(s=>(s.students||[]).forEach(st=>allNames.add(norm(st.name))));
  const nameArr=[...allNames].sort();
  const lkp={};APP.imported.forEach(s=>{lkp[s.subject]={};(s.students||[]).forEach(st=>lkp[s.subject][norm(st.name)]=st);});
  const wb=XLSX.utils.book_new();
  const rows=nameArr.map((name,idx)=>{
    const allTerms=subjects.map(subj=>{const st=lkp[subj][name];if(!st)return{t1:'',t2:'',t3:'',final:''};return{t1:st.terms?.T1||'',t2:st.terms?.T2||'',t3:st.terms?.T3||'',final:st.finalGrade||''};});
    const finals=allTerms.map(t=>t.final).filter(v=>v!==''&&!isNaN(v));
    const ga=finals.length?Math.round(finals.reduce((a,b)=>a+Number(b),0)/finals.length):'';
    return[idx+1,name,...allTerms.flatMap(t=>[t.t1,t.t2,t.t3,t.final]),ga,ga!==''?(ga>=75?'PROMOTED':'RETAINED'):''];
  });
  const header=['#','Name',...subjects.flatMap(s=>[`${s} T1`,`${s} T2`,`${s} T3`,`${s} Final`]),'Gen. Average','Status'];
  const ws=XLSX.utils.aoa_to_sheet([header,...rows]);
  XLSX.utils.book_append_sheet(wb,ws,'Consolidated');
  XLSX.writeFile(wb,`Consolidated_${APP.ac.section}_SY${APP.ac.sy}.xlsx`);
  toast('✓ Consolidated grades exported');
}

function excelLOA(){toast('Use LOA Reports tab → LOA Excel for per-term LOA export.');}

// ══════════════════════════════════════════════
// 26. UTILITY
// ══════════════════════════════════════════════
function toast(msg){const t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.style.display='block';clearTimeout(t._t);t._t=setTimeout(()=>{t.style.display='none'},3200);}
function openModal(title,sub,html){const m=document.getElementById('mainModal');document.getElementById('mTitle').textContent=title;document.getElementById('mSub').textContent=sub||'';document.getElementById('mBody').innerHTML=html;m.classList.add('open');}
function closeModal(){document.getElementById('mainModal').classList.remove('open');}

// ══════════════════════════════════════════════
// 27. INIT
// ══════════════════════════════════════════════
function init(){
  // Check for saved session
  try{
    const savedUser=localStorage.getItem('anhs_current_user');
    if(savedUser){
      CURRENT_USER=JSON.parse(savedUser);
      startApp(CURRENT_USER);
      return;
    }
  }catch(e){}

  // Show auth screen
  document.getElementById('authScreen').style.display='flex';
  document.getElementById('app').style.display='none';

  // Modal click outside
  document.getElementById('mainModal').addEventListener('click',function(e){if(e.target===this)closeModal();});

  // Auto-save every 15 minutes
  setInterval(function(){
    if(!APP.role||!APP.ac.grade||!APP.ac.section)return;
    try{
      const cd=getCD();
      if(!cd.students.male.length&&!cd.students.female.length)return;
      const blob=new Blob([JSON.stringify({app:APP,user:CURRENT_USER?.empId,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);
      const subj=(cd.school.subject||'Class').replace(/\s+/g,'_').substring(0,12);
      a.download=`AutoSave_${subj}_${APP.ac.grade.replace(/\s/g,'')}_${APP.ac.section}.json`;
      a.click();URL.revokeObjectURL(a.href);
      toast('⏱ Auto-saved to Downloads');
    }catch(err){}
  },15*60*1000);

  // Warn before close
  window.addEventListener('beforeunload',function(e){
    if(APP.role&&APP.ac.grade){
      e.preventDefault();
      e.returnValue='Did you export your file? Unsaved data may be lost.';
      return e.returnValue;
    }
  });
}

init();
="btn br bsm" onclick="window.print()">📄 Print All Cards</button>
  </div>
  <div class="sf-form">
    <div class="sf-header"><div class="sf-title">School Form 9 (SF9) — Term Report Card</div><div class="sf-subtitle">Term ${t} · ${TERM_DATES[t].start} – ${TERM_DATES[t].end}</div></div>
    ${sfMeta(cd)}
    ${cards}
  </div>`;
}

function renderSF10(el,cd,stu){
  let rows='';
  stu.forEach((s,i)=>{
    const t1=calcT(s.name,1).termGrade,t2=calcT(s.name,2).termGrade,t3=calcT(s.name,3).termGrade;
    const vt=[t1,t2,t3].filter(v=>v!==null);
    const final=vt.length?Math.round(vt.reduce((a,b)=>a+b,0)/vt.length):null;
    rows+=`<tr>
      <td style="text-align:center;font-size:.7rem">${i+1}</td>
      <td class="sf-nc" style="font-size:.78rem">${escH(s.name)}</td>
      <td>${s.g==='male'?'M':'F'}</td>
      <td></td><td></td>
      <td style="text-align:center;font-weight:600;color:${t1?(t1>=75?'var(--green)':'var(--red)'):'var(--tx4)'}">${t1||'—'}</td>
      <td style="text-align:center;font-weight:600;color:${t2?(t2>=75?'var(--green)':'var(--red)'):'var(--tx4)'}">${t2||'—'}</td>
      <td style="text-align:center;font-weight:600;color:${t3?(t3>=75?'var(--green)':'var(--red)'):'var(--tx4)'}">${t3||'—'}</td>
      <td style="text-align:center;font-weight:700;color:${final?(final>=75?'var(--blue)':'var(--red)'):'var(--tx4)'}">${final||'—'}</td>
      <td style="text-align:center"><span class="${final?(final>=75?'bprom':'bret'):''}">${final?(final>=75?'PROMOTED':'RETAINED'):'—'}</span></td>
      <td></td>
    </tr>`;
  });
  el.innerHTML=`
  <div class="sf-export-bar"><button class="btn bg bsm" onclick="excelSF10()">📊 Export Excel</button><button class="btn br bsm" onclick="window.print()">📄 Print/PDF</button></div>
  <div class="sf-form">
    <div class="sf-header"><div class="sf-title">School Form 10 (SF10) — Learner's Permanent Academic Record</div><div class="sf-subtitle">Three-Term System · DO 009, s. 2026</div></div>
    ${sfMeta(cd)}
    <div style="overflow-x:auto"><table class="sf-tbl">
      <thead><tr>
        <th>#</th><th class="sf-nc">Learner's Name</th><th>Sex</th><th>LRN</th><th>Date of Birth</th>
        <th><span class="tag tt1">T1</span></th>
        <th><span class="tag tt2">T2</span></th>
        <th><span class="tag tt3">T3</span></th>
        <th>Final</th><th>Status</th><th>Remarks</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1.5rem;margin-top:2rem;padding-top:1rem;border-top:1px solid var(--bdr)">
      <div style="text-align:center"><div style="height:40px;border-bottom:1px solid var(--tx)"></div><div style="font-size:.72rem;font-weight:600;margin-top:.3rem">${escH(cd.school.teacher||'CLASS ADVISER')}</div><div style="font-size:.65rem;color:var(--tx3)">Class Adviser Signature over Printed Name</div></div>
      <div style="text-align:center"><div style="height:40px;border-bottom:1px solid var(--tx)"></div><div style="font-size:.72rem;font-weight:600;margin-top:.3rem">SCHOOL REGISTRAR</div><div style="font-size:.65rem;color:var(--tx3)">Registrar Signature over Printed Name</div></div>
      <div style="text-align:center"><div style="height:40px;border-bottom:1px solid var(--tx)"></div><div style="font-size:.72rem;font-weight:600;margin-top:.3rem">SCHOOL PRINCIPAL</div><div style="font-size:.65rem;color:var(--tx3)">Principal Signature over Printed Name / Date</div></div>
    </div>
  </div>`;
}

// ══════════════════════════════════════════════
// 20. REGISTRAR SUBMISSION CENTER
// ══════════════════════════════════════════════
function renderRegistrar(){
  const el=document.getElementById('registrarContent');if(!el)return;
  const cd=hasClass()?getCD():null;
  const stu=hasClass()?allStu():[];
  el.innerHTML=`
  <div class="home-hero">
    <div class="home-hero-title">📬 Registrar Submission Center</div>
    <div class="home-hero-sub">Package all completed records and school forms for submission to the Registrar. Download the complete package below.</div>
    <div class="home-hero-meta">
      <div class="home-hero-tag">DO 009, s. 2026</div>
      <div class="home-hero-tag">Three-Term System</div>
      ${cd?`<div class="home-hero-tag">${escH(APP.ac.grade)} – ${escH(APP.ac.section)}</div>`:''}
    </div>
  </div>

  ${!hasClass()?'<div class="ws"><h2>Select a class first</h2><p>Load a class to prepare your submission package.</p></div>':''}

  ${cd?`
  <div class="g2" style="margin-bottom:.9rem">
    <div class="card">
      <div class="ch"><div class="ct">📋 Submission Checklist</div><div class="cs">Complete all items before submitting to Registrar</div></div>
      ${[
        ['SF1 — School Register', stu.length>0, `${stu.length} students registered`],
        ['SF2 — Daily Attendance', Object.keys(cd.att).length>0, `${Object.keys(cd.att).length} days recorded`],
        ['SF5 — Promotion Report', stu.some(s=>calcFinal(s.name)!==null), 'Final grades available'],
        ['SF9 — Term Report Cards', stu.some(s=>calcT(s.name,APP.gt).termGrade!==null), `Term ${APP.gt} grades entered`],
        ['SF10 — Permanent Record', stu.some(s=>calcFinal(s.name)!==null), 'All 3 terms have data'],
        ['Excel E-Class Record', Object.values(cd.grades).some(tg=>Object.keys(tg).length>0), 'Grade data exists'],
      ].map(([label,ok,detail])=>`
      <div style="display:flex;align-items:center;gap:.6rem;padding:.45rem 0;border-bottom:1px solid var(--bdr)">
        <div style="width:20px;height:20px;border-radius:50%;background:${ok?'var(--green2)':'var(--red2)'};color:${ok?'var(--green)':'var(--red)'};display:flex;align-items:center;justify-content:center;font-size:.75rem;flex-shrink:0">${ok?'✓':'✗'}</div>
        <div style="flex:1"><div style="font-size:.82rem;font-weight:600;color:var(--tx)">${label}</div><div style="font-size:.7rem;color:var(--tx3)">${detail}</div></div>
      </div>`).join('')}
    </div>
    <div class="card">
      <div class="ch"><div class="ct">📥 Download Package</div><div class="cs">Individual exports ready for Registrar submission</div></div>
      <div style="display:flex;flex-direction:column;gap:.5rem">
        <button class="btn bg" onclick="excelGrades()">📊 Download E-Class Record Excel (All Terms)</button>
        <button class="btn bp" onclick="jsonExport()">📦 Download Grade Summary JSON</button>
        <button class="btn ba" onclick="showSF('sf1');showPage('sfforms')">📋 View & Print SF1 (School Register)</button>
        <button class="btn bpu" onclick="showSF('sf5');showPage('sfforms')">🎓 View & Print SF5 (Promotion Report)</button>
        <button class="btn btl" onclick="showSF('sf9');showPage('sfforms')">📄 View & Print SF9 (Report Cards)</button>
        <button class="btn bo" onclick="showSF('sf10');showPage('sfforms')">🗂 View & Print SF10 (Permanent Record)</button>
      </div>
      <div class="inst-warn" style="margin-top:.75rem">
        ⚠ <strong>For Phase 2:</strong> Direct digital submission to Registrar requires a backend server connection. Currently, download all forms above and submit physically or via your school's official channel.
      </div>
    </div>
  </div>

  <div class="card">
    <div class="ch"><div class="ct">📧 Submission Summary</div><div class="cs">Auto-generated package summary for Registrar</div></div>
    <div style="font-family:'DM Mono',monospace;font-size:.78rem;color:var(--tx2);background:var(--surf2);border:1px solid var(--bdr);border-radius:var(--rs);padding:1rem;line-height:1.9">
REGISTRAR SUBMISSION PACKAGE<br>
School: ${escH(cd.school.name||'—')}<br>
School ID: ${escH(cd.school.id||'—')}<br>
School Year: ${escH(APP.ac.sy)}<br>
Term System: Three-Term (DO 009, s. 2026)<br>
Grade & Section: ${escH(APP.ac.grade)} – ${escH(APP.ac.section)}<br>
Subject Teacher: ${escH(cd.school.teacher||'—')}<br>
Subject: ${escH(cd.school.subject||'—')}<br>
Total Learners: ${stu.length} (M: ${(cd.students.male||[]).length} / F: ${(cd.students.female||[]).length})<br>
Prepared by: ${CURRENT_USER?`${CURRENT_USER.lastName}, ${CURRENT_USER.firstName}`:'Guest'}<br>
Date Prepared: ${today()}
    </div>
  </div>`:''}`;
}

// ══════════════════════════════════════════════
// 21. HOME MENU
// ══════════════════════════════════════════════
function renderHome(){
  const el=document.getElementById('homeContent');if(!el)return;
  const u=CURRENT_USER;
  const subjectCards=[
    {id:'recordbook',icon:'📝',title:'Record Book',desc:'Enter grades per term, set HPS, manage student list, view analytics and LOA reports',badge:'Grade Entry',bc:'var(--blue2)',btc:'var(--blue)'},
    {id:'gradesummary',icon:'📊',title:'Grade Summary',desc:'View term grades and final grades for all students. Export to Excel, PDF, or JSON for Advisory Teacher',badge:'Export Ready',bc:'var(--green2)',btc:'var(--green)'},
    {id:'dailyatt',icon:'📅',title:'Daily Attendance',desc:'Record student attendance per day. Mark Present, Absent, or Late',badge:'Daily Task',bc:'var(--amber2)',btc:'var(--amber)'},
    {id:'attsummary',icon:'📋',title:'Attendance Summary',desc:'Monthly attendance overview. Generate SF2 and SF4 from recorded data',badge:'Reports',bc:'var(--purple2)',btc:'var(--purple)'},
    {id:'sfforms',icon:'🗂',title:'School Forms (SF1–SF10)',desc:'Generate all DepEd school forms auto-filled from your class data. Print or export to Excel',badge:'SF1–SF10',bc:'var(--teal2)',btc:'var(--teal)'},
  ];
  const advisoryCards=[
    ...subjectCards,
    {id:'consolidated',icon:'🔀',title:'Consolidated Grades',desc:'Import JSON from subject teachers. Compute General Average and generate Promotion Status per student',badge:'Advisory',bc:'var(--pink2)',btc:'var(--pink)'},
    {id:'registrar',icon:'📬',title:'Registrar Submission',desc:'Package all completed records and forms for submission to the school Registrar',badge:'Submit',bc:'var(--red2)',btc:'var(--red)'},
  ];
  const cards=APP.role==='advisory'?advisoryCards:subjectCards;
  const sy=APP.ac.sy||'2026-2027';
  el.innerHTML=`
  <div class="home-hero">
    <div class="home-hero-title">Welcome, ${u?`${u.firstName} ${u.lastName}`:'Teacher'}! 👋</div>
    <div class="home-hero-sub">ANHS E-Class Record System · Three-Term Calendar (DO 009, s. 2026)<br>
    ${hasClass()?`Active class: <strong>${APP.ac.grade} – ${APP.ac.section}</strong> · SY ${sy}`:'Select a class from the bar above to begin.'}
    </div>
    <div class="home-hero-meta">
      <div class="home-hero-tag">SY ${sy}</div>
      <div class="home-hero-tag">Three-Term System</div>
      <div class="home-hero-tag">${APP.role==='advisory'?'Advisory Teacher':'Subject Teacher'}</div>
      ${u&&!u.isGuest?`<div class="home-hero-tag">ID: ${escH(u.empId)}</div>`:'<div class="home-hero-tag" style="background:rgba(255,165,0,.2);border-color:rgba(255,165,0,.4)">Guest Mode</div>'}
    </div>
  </div>

  ${hasClass()?`
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.65rem;margin-bottom:.9rem">
    ${[1,2,3].map(t=>{
      const stu=allStu();const graded=stu.filter(s=>calcT(s.name,t).termGrade!==null).length;
      return`<div style="background:var(--term${t}-2);border:1px solid var(--term${t});border-radius:var(--r);padding:.75rem 1rem;cursor:pointer" onclick="setActiveTerm(${t})">
        <div style="font-size:.72rem;font-weight:700;color:var(--term${t});margin-bottom:.25rem">TERM ${t}</div>
        <div style="font-size:.9rem;font-weight:600;color:var(--tx)">${TERM_DATES[t].start.split(',')[0]} – ${TERM_DATES[t].end.split(',')[0]}</div>
        <div style="font-size:.72rem;color:var(--tx3);margin-top:.2rem">${graded}/${stu.length} students graded</div>
      </div>`;
    }).join('')}
  </div>`:''}

  <div class="home-grid">
    ${cards.map(c=>`<div class="home-card" onclick="showPage('${c.id}')">
      <div class="home-card-icon">${c.icon}</div>
      <div class="home-card-title">${c.title}</div>
      <div class="home-card-desc">${c.desc}</div>
      <div class="home-card-badge" style="background:${c.bc};color:${c.btc}">${c.badge}</div>
    </div>`).join('')}
  </div>`;
}

// ══════════════════════════════════════════════
// 22. INSTRUCTIONS
// ══════════════════════════════════════════════
function renderInstructions(){
  const el=document.getElementById('rb-instructions');if(!el)return;
  el.innerHTML=`
  <div class="inst-hero">
    <div class="inst-hero-title">📖 How to Use the Three-Term E-Class Record System</div>
    <div class="inst-hero-sub">This system follows DO 009, s. 2026 — Three-Term School Calendar.<br>
    Instead of 4 Quarters, there are now 3 Terms: <strong>Term 1</strong> (Jun–Sep), <strong>Term 2</strong> (Sep–Dec), <strong>Term 3</strong> (Jan–Apr).<br>
    The Final Grade is the average of all 3 Term Grades.</div>
  </div>

  <div class="card">
    <div class="ch"><div class="ct">🚀 First Time Setup</div></div>
    ${[
      ['Sign In or Register','Create your teacher account with your Employee ID. Your data is saved privately per account.'],
      ['Select Your Class','Use the Active Class bar at the top. Enter Grade Level, Section, and School Year, then click Load Class.'],
      ['Fill in School Information','Go to Setup tab → fill in school name, your name, subject, and school year. This prints on all exported forms.'],
      ['Set HPS for Each Term','In Setup, enter the Highest Possible Score (HPS) for each Written Work, Performance Task, and Term Examination for all 3 terms.'],
      ['Add Your Students','In Setup, add male students in the left column and female students in the right. Press Enter after each name.'],
      ['Save and Export','Click Save Setup, then Export .json File. Store this file safely — load it at the start of every session.'],
    ].map(([t,d],i)=>`<div class="inst-step"><div class="inst-step-num">${i+1}</div><div><div class="inst-step-title">${t}</div><div class="inst-step-desc">${d}</div></div></div>`).join('')}
  </div>

  <div class="card">
    <div class="ch"><div class="ct">📝 Entering Grades (Three-Term System)</div></div>
    ${[
      ['Select the Active Term','Use the Term bar near the top (Term 1, 2, or 3) to switch between terms. Each term has its own separate set of scores.'],
      ['Go to Grade Entry tab','Click 📝 Grade Entry in the Record Book. The table shows WW1–WW10, PT1–PT10, and Term Examination columns.'],
      ['Type scores directly','Click any score cell and type the student\'s score. All computed values update automatically — no Save button needed for individual cells.'],
      ['Use Bulk Entry for speed','Click ⚡ Bulk Entry to enter one activity\'s scores for all students at once. Much faster than cell-by-cell entry.'],
      ['Check your computed grades','The system auto-computes: PS (Percentage Score), WS (Weighted Score), Initial Grade, and Term Grade using DepEd transmutation.'],
    ].map(([t,d],i)=>`<div class="inst-step"><div class="inst-step-num">${i+1}</div><div><div class="inst-step-title">${t}</div><div class="inst-step-desc">${d}</div></div></div>`).join('')}
    <div class="inst-tip">💡 <strong>Grading Formula:</strong> WW (30%) + PT (50%) + Term Exam (20%) = Initial Grade → Transmuted = Term Grade. Final Grade = Average of Term 1 + Term 2 + Term 3.</div>
  </div>

  <div class="card">
    <div class="ch"><div class="ct">💾 Saving Your Data</div></div>
    ${[
      ['Auto-save every keystroke','All scores save instantly to your browser. No manual save needed during grade entry.'],
      ['Export JSON at end of session','Click 💾 Export .json File in Setup before closing. This is your master backup file.'],
      ['Load file at start of session','Click 📂 Load File to restore your data from the JSON file on any computer.'],
      ['Auto-backup every 15 minutes','The system automatically downloads an AutoSave file every 15 minutes as a safety net.'],
    ].map(([t,d],i)=>`<div class="inst-step"><div class="inst-step-num">${i+1}</div><div><div class="inst-step-title">${t}</div><div class="inst-step-desc">${d}</div></div></div>`).join('')}
    <div class="inst-warn">⚠ Never clear browser history without exporting your JSON file first. Your data lives in the browser unless exported.</div>
  </div>

  <div class="card">
    <div class="ch"><div class="ct">🗂 School Forms (SF1–SF10)</div></div>
    <div class="inst-step-desc" style="padding:.5rem 0;font-size:.85rem;color:var(--tx2);line-height:1.75">
      All school forms are auto-generated from your class data. Go to <strong>SF Forms</strong> in the navigation.<br><br>
      <strong>SF1</strong> — School Register (class list with student names)<br>
      <strong>SF2</strong> — Daily Attendance Record (monthly view)<br>
      <strong>SF4</strong> — Monthly Attendance Report (summary per month)<br>
      <strong>SF5</strong> — Promotion and Proficiency Report (final grades + promotion status)<br>
      <strong>SF9</strong> — Term Report Card (one card per student per term)<br>
      <strong>SF10</strong> — Learner's Permanent Academic Record (complete school year record)<br><br>
      Each form has a <strong>Export Excel</strong> and <strong>Print/PDF</strong> button. Export and submit to your Registrar through your school's official channel.
    </div>
  </div>

  <div class="inst-section-title">❓ Frequently Asked Questions</div>
  ${[
    ['What changed from the 4-Quarter to 3-Term system?','Instead of Q1, Q2, Q3, Q4, there are now Term 1, Term 2, and Term 3. The grading formula (WW 30%, PT 50%, QA 20%) is the same, but Quarterly Assessment is now called Term Examination. The Final Grade is the average of 3 Term Grades instead of 4 Quarterly Grades.'],
    ['My data disappeared when I opened the system. What happened?','This happens when you open the system on a different computer or browser, or if browser history was cleared. Always export your .json file at the end of every session and load it at the start of the next one.'],
    ['Why is the Term Grade not showing?','The Term Grade only computes when the HPS (Highest Possible Score) is set for that term. Go to Setup → HPS section and enter the maximum scores for WW, PT, and Term Examination items.'],
    ['How do I send grades to the Advisory Teacher?','Go to Grade Summary → click 📦 JSON for Advisory. Send that .json file to your Advisory Teacher. They import it in the Consolidated Grades module.'],
    ['What is the difference between Subject Teacher and Advisory Teacher?','Subject Teacher enters grades for one specific subject. Advisory Teacher consolidates grades from all subject teachers and generates SF forms (SF5, SF9, SF10) plus the Registrar submission package.'],
    ['How do I generate school forms for submission?','Go to SF Forms in the navigation. All forms auto-fill from your class data. Click Export Excel or Print/PDF for each form you need.'],
  ].map(([q,a])=>`<div class="inst-faq"><div class="inst-faq-q" onclick="toggleFAQ(this)">${q} <span>▼</span></div><div class="inst-faq-a">${a}</div></div>`).join('')}
  <div class="inst-tip" style="margin-top:1rem">📞 For technical support, contact Mendtrix IT Services.</div>`;
}

function toggleFAQ(el){const ans=el.nextElementSibling;const isOpen=ans.classList.contains('open');document.querySelectorAll('.inst-faq-a').forEach(a=>a.classList.remove('open'));document.querySelectorAll('.inst-faq-q span').forEach(s=>s.textContent='▼');if(!isOpen){ans.classList.add('open');el.querySelector('span').textContent='▲';}}

// ══════════════════════════════════════════════
// 23. EXCEL EXPORT — DepEd Three-Term E-Class Record
// ══════════════════════════════════════════════
function excelGrades(){
  const cd=getCD();const wb=XLSX.utils.book_new();
  // INPUT DATA sheet
  const iRows=[
    ['Official E-Class Record in K to 12 Curriculum — Three-Term System (DO 009, s. 2026)'],[''],
    ['REGION',cd.school.region||'','DIVISION',cd.school.division||''],
    ['SCHOOL NAME',cd.school.name||'','SCHOOL ID',cd.school.id||'','SCHOOL YEAR',cd.school.sy||APP.ac.sy],
    [''],['LEARNERS'],[''],['MALE'],
    ...cd.students.male.map((n,i)=>[i+1,n]),
    [''],['FEMALE'],
    ...cd.students.female.map((n,i)=>[i+1,n])
  ];
  const wsI=XLSX.utils.aoa_to_sheet(iRows);wsI['!cols']=[{wch:5},{wch:45}];
  XLSX.utils.book_append_sheet(wb,wsI,'INPUT DATA');

  // One sheet per term (T1, T2, T3)
  const tNames=['FIRST TERM','SECOND TERM','THIRD TERM'];
  for(let t=1;t<=3;t++){
    const h=cd.hps[t];
    const wwC=Math.max(h.ww.filter(v=>v).length,1);
    const ptC=Math.max(h.pt.filter(v=>v).length,1);
    const hasTE=!!h.te;
    const wwHT=h.ww.reduce((a,v)=>a+(v||0),0);
    const ptHT=h.pt.reduce((a,v)=>a+(v||0),0);
    const rows=[];
    rows.push(['Official E-Class Record in K to 12 Curriculum — Three-Term System (DO 009, s. 2026)']);
    rows.push(['']);
    rows.push(['REGION',cd.school.region||'','DIVISION',cd.school.division||'']);
    rows.push(['SCHOOL NAME',cd.school.name||'','SCHOOL ID',cd.school.id||'','SCHOOL YEAR',cd.school.sy||APP.ac.sy]);
    rows.push([tNames[t-1],'GRADE & SECTION:',`${APP.ac.grade}–${APP.ac.section}`,'TEACHER:',cd.school.teacher||'','SUBJECT:',cd.school.subject||'']);
    rows.push([`Term Dates: ${TERM_DATES[t].start} – ${TERM_DATES[t].end} · ${TERM_DATES[t].days} class days`]);
    rows.push(['']);
    // Header row 1
    const hdr1=['#','LEARNERS\' NAMES','WRITTEN WORKS (30%)'];
    for(let i=1;i<wwC+3;i++)hdr1.push('');
    hdr1.push('PERFORMANCE TASKS (50%)');
    for(let i=1;i<ptC+3;i++)hdr1.push('');
    if(hasTE){hdr1.push('TERM EXAMINATION (20%)','','');}
    hdr1.push('Initial Grade','Term Grade');
    rows.push(hdr1);
    // Header row 2 — item numbers
    const hdr2=['',''];
    for(let i=0;i<wwC;i++)hdr2.push(i+1);
    hdr2.push('Total','PS','WS');
    for(let i=0;i<ptC;i++)hdr2.push(i+1);
    hdr2.push('Total','PS','WS');
    if(hasTE)hdr2.push('Score','PS','WS');
    hdr2.push('','');
    rows.push(hdr2);
    // HPS row
    const hpsR=['','HIGHEST POSSIBLE SCORE'];
    for(let i=0;i<wwC;i++)hpsR.push(h.ww[i]||'');
    hpsR.push(wwHT,100,'30%');
    for(let i=0;i<ptC;i++)hpsR.push(h.pt[i]||'');
    hpsR.push(ptHT,100,'50%');
    if(hasTE)hpsR.push(h.te,100,'20%');
    hpsR.push('','');
    rows.push(hpsR);
    // Student rows
    [{n:'MALE',arr:cd.students.male},{n:'FEMALE',arr:cd.students.female}].forEach(({n,arr})=>{
      rows.push(['',n]);
      arr.forEach((sn,idx)=>{
        const g=(cd.grades[t]&&cd.grades[t][sn])||{};
        const ww=g.ww||Array(10).fill(null);const pt=g.pt||Array(10).fill(null);
        const te=g.te!==undefined&&g.te!==null?g.te:'';
        const c=calcT(sn,t);
        const row=[idx+1,sn];
        for(let j=0;j<wwC;j++)row.push(ww[j]!==null&&ww[j]!==undefined?ww[j]:'');
        row.push(c.wwT!==null?c.wwT:'',c.wwPS!==null?c.wwPS:'',c.wwWS!==null?c.wwWS:'');
        for(let j=0;j<ptC;j++)row.push(pt[j]!==null&&pt[j]!==undefined?pt[j]:'');
        row.push(c.ptT!==null?c.ptT:'',c.ptPS!==null?c.ptPS:'',c.ptWS!==null?c.ptWS:'');
        if(hasTE)row.push(te!==''?te:'',c.tePS!==null?c.tePS:'',c.teWS!==null?c.teWS:'');
        row.push(c.initial!==null?c.initial:'',c.termGrade||'');
        rows.push(row);
      });
    });
    const wsT=XLSX.utils.aoa_to_sheet(rows);
    wsT['!cols']=[{wch:4},{wch:42},...Array(wwC+ptC+12).fill({wch:7})];
    XLSX.utils.book_append_sheet(wb,wsT,`Term_${t}`);
  }
  // FINAL GRADES summary sheet
  const sumR=[
    ['Summary of Term and Final Grades — Three-Term System (DO 009, s. 2026)'],[''],
    ['REGION',cd.school.region||'','DIVISION',cd.school.division||''],
    ['SCHOOL NAME',cd.school.name||'','GRADE & SECTION:',`${APP.ac.grade}–${APP.ac.section}`,'SY:',cd.school.sy||APP.ac.sy],
    ['TEACHER:',cd.school.teacher||'','SUBJECT:',cd.school.subject||''],[''],
    ['#','LEARNER\'S NAME','TERM 1','TERM 2','TERM 3','FINAL GRADE','REMARK']
  ];
  [{n:'MALE',arr:cd.students.male},{n:'FEMALE',arr:cd.students.female}].forEach(({n,arr})=>{
    sumR.push(['',n]);
    arr.forEach((sn,i)=>{
      const t1=calcT(sn,1).termGrade,t2=calcT(sn,2).termGrade,t3=calcT(sn,3).termGrade;
      const vt=[t1,t2,t3].filter(v=>v!==null);
      const final=vt.length?Math.round(vt.reduce((a,b)=>a+b,0)/vt.length):null;
      sumR.push([i+1,sn,t1||'',t2||'',t3||'',final||'',final?(final>=75?'PASSED':'FAILED'):'']);
    });
  });
  const wsSum=XLSX.utils.aoa_to_sheet(sumR);
  wsSum['!cols']=[{wch:4},{wch:42},{wch:9},{wch:9},{wch:9},{wch:11},{wch:10}];
  XLSX.utils.book_append_sheet(wb,wsSum,'FINAL GRADES');

  // LOA Summary sheet
  const loaRows=[['LOA SUMMARY — '+escH(cd.school.subject||'Subject')+' · '+APP.ac.grade+' '+APP.ac.section+' · SY '+APP.ac.sy]];
  loaRows.push(['']);
  const stu=allStu();
  for(let t=1;t<=3;t++){
    const h=cd.hps[t];const N=stu.length;
    loaRows.push([`TERM ${t} — ${TERM_DATES[t].name} (${TERM_DATES[t].start} – ${TERM_DATES[t].end})`]);
    loaRows.push(['']);
    function bands(scores,type){const r=type==='prof'?{np:0,lp:0,np2:0,p:0,hp:0}:{dnm:0,fs:0,s:0,vs:0,o1:0,o2:0,o3:0};scores.forEach(v=>{if(v===null)return;if(type==='prof'){if(v>=90)r.hp++;else if(v>=75)r.p++;else if(v>=50)r.np2++;else if(v>=25)r.lp++;else r.np++;}else{if(v>=98)r.o3++;else if(v>=95)r.o2++;else if(v>=90)r.o1++;else if(v>=85)r.vs++;else if(v>=80)r.s++;else if(v>=75)r.fs++;else r.dnm++;}});return r;}
    function pct(n,t){return t?r2((n/t)*100):0}
    const wwPS=stu.map(s=>calcT(s.name,t).wwPS);
    const ptPS=stu.map(s=>calcT(s.name,t).ptPS);
    const tePS=stu.map(s=>calcT(s.name,t).tePS);
    const tGr=stu.map(s=>calcT(s.name,t).termGrade);
    const wwB=bands(wwPS,'prof');const ptB=bands(ptPS,'desc');const teB=bands(tePS,'prof');const tgB=bands(tGr,'desc');
    loaRows.push(['WRITTEN WORKS PROFICIENCY']);
    loaRows.push(['Section','Learners','Not Proficient (0-24%)','','Low Proficient (25-49%)','','Nearly Proficient (50-74%)','','Proficient (75-89%)','','Highly Proficient (90-100%)','']);
    loaRows.push(['','','No.','%','No.','%','No.','%','No.','%','No.','%']);
    loaRows.push([`${APP.ac.grade}–${APP.ac.section}`,N,wwB.np,pct(wwB.np,N)+'%',wwB.lp,pct(wwB.lp,N)+'%',wwB.np2,pct(wwB.np2,N)+'%',wwB.p,pct(wwB.p,N)+'%',wwB.hp,pct(wwB.hp,N)+'%']);
    loaRows.push(['']);
    loaRows.push(['PERFORMANCE TASKS DESCRIPTORS']);
    loaRows.push(['Section','Learners','Did Not Meet (≤74%)','','Fairly Satisfactory (75-79%)','','Satisfactory (80-84%)','','Very Satisfactory (85-89%)','','Outstanding 90-94%','','Outstanding 95-97%','','Outstanding 98-100%','']);
    loaRows.push(['','','No.','%','No.','%','No.','%','No.','%','No.','%','No.','%','No.','%']);
    loaRows.push([`${APP.ac.grade}–${APP.ac.section}`,N,ptB.dnm,pct(ptB.dnm,N)+'%',ptB.fs,pct(ptB.fs,N)+'%',ptB.s,pct(ptB.s,N)+'%',ptB.vs,pct(ptB.vs,N)+'%',ptB.o1,pct(ptB.o1,N)+'%',ptB.o2,pct(ptB.o2,N)+'%',ptB.o3,pct(ptB.o3,N)+'%']);
    loaRows.push(['']);
    if(h.te){
      loaRows.push(['TERM EXAMINATION PROFICIENCY']);
      loaRows.push(['Section','Learners','Not Proficient (0-24%)','','Low Proficient (25-49%)','','Nearly Proficient (50-74%)','','Proficient (75-89%)','','Highly Proficient (90-100%)','']);
      loaRows.push(['','','No.','%','No.','%','No.','%','No.','%','No.','%']);
      loaRows.push([`${APP.ac.grade}–${APP.ac.section}`,N,teB.np,pct(teB.np,N)+'%',teB.lp,pct(teB.lp,N)+'%',teB.np2,pct(teB.np2,N)+'%',teB.p,pct(teB.p,N)+'%',teB.hp,pct(teB.hp,N)+'%']);
      loaRows.push(['']);
    }
    loaRows.push(['TERM GRADE DESCRIPTORS']);
    loaRows.push(['Section','Learners','Did Not Meet (≤74%)','','Fairly Satisfactory (75-79%)','','Satisfactory (80-84%)','','Very Satisfactory (85-89%)','','Outstanding 90-94%','','Outstanding 95-97%','','Outstanding 98-100%','']);
    loaRows.push(['','','No.','%','No.','%','No.','%','No.','%','No.','%','No.','%','No.','%']);
    loaRows.push([`${APP.ac.grade}–${APP.ac.section}`,N,tgB.dnm,pct(tgB.dnm,N)+'%',tgB.fs,pct(tgB.fs,N)+'%',tgB.s,pct(tgB.s,N)+'%',tgB.vs,pct(tgB.vs,N)+'%',tgB.o1,pct(tgB.o1,N)+'%',tgB.o2,pct(tgB.o2,N)+'%',tgB.o3,pct(tgB.o3,N)+'%']);
    loaRows.push(['','']);
  }
  const wsLOA=XLSX.utils.aoa_to_sheet(loaRows);
  wsLOA['!cols']=Array(18).fill({wch:9});wsLOA['!cols'][0]={wch:22};
  XLSX.utils.book_append_sheet(wb,wsLOA,'LOA SUMMARY');

  const fn=`EClassRecord_ThreeTerm_${(cd.school.subject||'Subject').replace(/\s+/g,'_').substring(0,12)}_${APP.ac.grade.replace(/\s/g,'')}_${APP.ac.section}_${APP.ac.sy}.xlsx`;
  XLSX.writeFile(wb,fn);
  toast('✓ Excel exported — DepEd Three-Term E-Class Record format');
}

// ══════════════════════════════════════════════
// 24. JSON EXPORT for Advisory Teacher
// ══════════════════════════════════════════════
function jsonExport(){
  const cd=getCD();const stu=allStu();
  const payload={
    version:'2.0',exportType:'termSummaryJSON',
    school:cd.school.name,teacher:cd.school.teacher,
    subject:cd.school.subject,section:APP.ac.section,
    grade:APP.ac.grade,sy:APP.ac.sy,
    termSystem:'three-term',doRef:'DO 009, s. 2026',
    exportDate:today(),
    exportedBy:CURRENT_USER?`${CURRENT_USER.lastName}, ${CURRENT_USER.firstName}`:'Guest',
    students:stu.map(s=>{
      const t1=calcT(s.name,1).termGrade,t2=calcT(s.name,2).termGrade,t3=calcT(s.name,3).termGrade;
      const vt=[t1,t2,t3].filter(v=>v!==null);
      const final=vt.length?Math.round(vt.reduce((a,b)=>a+b,0)/vt.length):null;
      return{name:s.name,gender:s.g,terms:{T1:t1,T2:t2,T3:t3},finalGrade:final,remark:final?(final>=75?'PASSED':'FAILED'):''};
    })
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=`TermGrades_${(cd.school.subject||'Subject').replace(/\s+/g,'_').substring(0,12)}_${APP.ac.section}_${APP.ac.sy}.json`;
  a.click();URL.revokeObjectURL(a.href);
  toast('✓ JSON exported — send to Advisory Teacher');
}

// ══════════════════════════════════════════════
// 25. PDF / PRINT EXPORTS
// ══════════════════════════════════════════════
function hdr(title){
  const cd=hasClass()?getCD():null;
  return`<h1 style="font-size:13px;margin-bottom:4px">${title}</h1>
  <div style="font-size:9px;color:#666;margin-bottom:10px">
    ${cd?escH(cd.school.subject||''):''} · ${APP.ac.grade} ${APP.ac.section} · SY ${APP.ac.sy} · Three-Term System (DO 009, s. 2026)
  </div>`;
}

function printWin(title,body){
  const w=window.open('','_blank','width=1000,height=700');
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
  <style>body{font-family:Arial,sans-serif;font-size:9px;color:#1a1d23;margin:0;padding:10px}
  table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:2px 4px;font-size:8px}
  thead th{background:#f0f2f5;font-weight:600}.bold{font-weight:700}
  .pass{color:#0d9488;font-weight:700}.fail{color:#dc2626;font-weight:700}
  .sh-ww{background:#dbeafe;color:#1e40af}.sh-pt{background:#fef9ec;color:#d97706}
  .sh-te{background:#dcfce7;color:#166534}.hrow{background:#fffbeb}
  .t1{background:#e6faf8;color:#0d9488}.t2{background:#f3f0ff;color:#7c3aed}.t3{background:#fffbeb;color:#d97706}
  @page{size:A4 landscape;margin:7mm}</style>
  </head><body>${body}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
  w.document.close();
}

function pdfSummary(){
  if(!hasClass()){toast('Select a class first');return;}
  const cd=getCD();const stu=allStu();
  let rows='';let lastG=null;
  stu.forEach(s=>{
    if(s.g!==lastG){rows+=`<tr><td colspan="8" style="background:${s.g==='male'?'#dbeafe':'#fce7f3'};font-weight:700;font-size:8px">${s.g==='male'?'MALE':'FEMALE'}</td></tr>`;lastG=s.g;}
    const num=(s.g==='male'?cd.students.male:cd.students.female).indexOf(s.name)+1;
    const t1=calcT(s.name,1).termGrade,t2=calcT(s.name,2).termGrade,t3=calcT(s.name,3).termGrade;
    const vt=[t1,t2,t3].filter(v=>v!==null);const final=vt.length?Math.round(vt.reduce((a,b)=>a+b,0)/vt.length):null;
    rows+=`<tr><td style="text-align:center">${num}</td><td style="min-width:140px">${escH(s.name)}</td>
    <td class="${t1?(t1>=75?'pass':'fail'):''}" style="text-align:center">${t1||'—'}</td>
    <td class="${t2?(t2>=75?'pass':'fail'):''}" style="text-align:center">${t2||'—'}</td>
    <td class="${t3?(t3>=75?'pass':'fail'):''}" style="text-align:center">${t3||'—'}</td>
    <td class="${final?(final>=75?'pass':'fail'):''}" style="text-align:center;font-weight:700">${final||'—'}</td>
    <td style="text-align:center">${final?(final>=75?'PASSED':'FAILED'):''}</td></tr>`;
  });
  printWin('Grade Summary',`${hdr('Term Grade Summary')}<table><thead>
    <tr><th>#</th><th style="text-align:left">Learner's Name</th><th class="t1">Term 1</th><th class="t2">Term 2</th><th class="t3">Term 3</th><th>Final</th><th>Remark</th></tr>
  </thead><tbody>${rows}</tbody></table>`);
}

function pdfLOA(){toast('Rendering LOA PDF...');window.print();}
function pdfDailyAtt(ds){
  if(!hasClass())return;
  const cd=getCD();const stu=allStu();const att=cd.att[ds]||{};
  let rows='';let lastG=null;
  stu.forEach((s,i)=>{
    if(s.g!==lastG){rows+=`<tr><td colspan="5" style="background:${s.g==='male'?'#dbeafe':'#fce7f3'};font-weight:700;font-size:8px">${s.g==='male'?'MALE':'FEMALE'}</td></tr>`;lastG=s.g;}
    const num=(s.g==='male'?cd.students.male:cd.students.female).indexOf(s.name)+1;
    const st=att[s.name]||'';
    rows+=`<tr><td style="text-align:center">${num}</td><td style="min-width:140px">${escH(s.name)}</td>
    <td style="text-align:center;color:${st==='P'?'#0d9488':''};font-weight:${st==='P'?700:400}">${st==='P'?'✓':''}</td>
    <td style="text-align:center;color:${st==='A'?'#dc2626':''};font-weight:${st==='A'?700:400}">${st==='A'?'✗':''}</td>
    <td style="text-align:center;color:${st==='L'?'#d97706':''};font-weight:${st==='L'?700:400}">${st==='L'?'L':''}</td></tr>`;
  });
  printWin('Attendance '+ds,`${hdr('Daily Attendance — '+ds)}<table style="max-width:380px"><thead><tr><th>#</th><th style="text-align:left;min-width:140px">Name</th><th>Present</th><th>Absent</th><th>Late</th></tr></thead><tbody>${rows}</tbody></table>`);
}
function pdfAttSum(){
  if(!hasClass())return;
  const cd=getCD();const stu=allStu();const dates=Object.keys(cd.att).sort().slice(-20);
  let rows='';let lastG=null;
  stu.forEach(s=>{
    if(s.g!==lastG){rows+=`<tr><td colspan="${dates.length+4}" style="background:${s.g==='male'?'#dbeafe':'#fce7f3'};font-weight:700;font-size:8px">${s.g==='male'?'MALE':'FEMALE'}</td></tr>`;lastG=s.g;}
    const num=(s.g==='male'?cd.students.male:cd.students.female).indexOf(s.name)+1;
    let P=0,A=0;
    const cells=dates.map(d=>{const t=(cd.att[d]||{})[s.name]||'';if(t==='P')P++;else if(t==='A')A++;return`<td style="text-align:center;color:${t==='P'?'#0d9488':t==='A'?'#dc2626':t==='L'?'#d97706':'#ccc'}">${t||'—'}</td>`;}).join('');
    rows+=`<tr><td>${num}</td><td style="min-width:130px">${escH(s.name)}</td>${cells}<td style="color:#0d9488;font-weight:700">${P}</td><td style="color:#dc2626;font-weight:700">${A}</td></tr>`;
  });
  printWin('Attendance Summary',`${hdr('Attendance Summary')}<table><thead><tr><th>#</th><th style="text-align:left;min-width:130px">Name</th>${dates.map(d=>`<th style="font-size:7px">${d.slice(5)}</th>`).join('')}<th style="color:#0d9488">P</th><th style="color:#dc2626">A</th></tr></thead><tbody>${rows}</tbody></table>`);
}
function pdfCons(){
  if(!APP.imported.length){toast('Import files first');return;}
  const subjects=APP.imported.map(s=>s.subject||'?');
  const allNames=new Set();APP.imported.forEach(s=>(s.students||[]).forEach(st=>allNames.add(norm(st.name))));
  const nameArr=[...allNames].sort();const lkp={};APP.imported.forEach(s=>{lkp[s.subject]={};(s.students||[]).forEach(st=>lkp[s.subject][norm(st.name)]=st);});
  let rows='';
  nameArr.forEach((name,idx)=>{
    const finals=subjects.map(subj=>lkp[subj][name]?.finalGrade);const valid=finals.filter(v=>v!==null&&v!==undefined);const ga=valid.length?Math.round(valid.reduce((a,b)=>a+b,0)/valid.length):null;
    const allP=subjects.every(subj=>{const st=lkp[subj][name];return!st||!st.finalGrade||(st.finalGrade>=75)});const prom=ga!==null?(ga>=75&&allP?'PROMOTED':'RETAINED'):'';
    rows+=`<tr><td style="text-align:center">${idx+1}</td><td style="min-width:130px">${escH(name)}</td>${finals.map(v=>`<td class="bold ${v?(v>=75?'pass':'fail'):''}" style="text-align:center">${v||'—'}</td>`).join('')}<td class="bold" style="color:#1a56db;text-align:center">${ga||'—'}</td><td style="text-align:center;font-weight:700;color:${prom==='PROMOTED'?'#0d9488':'#dc2626'}">${prom}</td></tr>`;
  });
  printWin('Consolidated',`${hdr('Consolidated Grades')}<table><thead><tr><th>#</th><th style="text-align:left">Name</th>${subjects.map(s=>`<th>${escH(s)}</th>`).join('')}<th>Gen. Avg</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`);
}
function pdfSF1(){window.print();}

// ══════════════════════════════════════════════
// EXCEL EXPORTS FOR SF FORMS
// ══════════════════════════════════════════════
function excelSF1(){
  const cd=getCD();const stu=allStu();const wb=XLSX.utils.book_new();
  const rows=[['School Form 1 (SF1) — School Register'],['Three-Term System · DO 009, s. 2026'],[''],
    ['School:',cd.school.name||'','School ID:',cd.school.id||''],
    ['Grade & Section:',`${APP.ac.grade} – ${APP.ac.section}`,'School Year:',APP.ac.sy],
    ['Teacher:',cd.school.teacher||'','Subject:',cd.school.subject||''],[''],
    ['#','Learner\'s Name','Sex','LRN','Date of Birth','Age','Barangay','Remarks']];
  stu.forEach((s,i)=>rows.push([i+1,s.name,s.g==='male'?'M':'F','','','','','']));
  rows.push([''],['Total:',stu.length,'Male:',cd.students.male.length,'Female:',cd.students.female.length]);
  const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:4},{wch:40},{wch:6},{wch:14},{wch:14},{wch:5},{wch:18},{wch:18}];
  XLSX.utils.book_append_sheet(wb,ws,'SF1-Register');
  XLSX.writeFile(wb,`SF1_${APP.ac.grade.replace(/\s/g,'')}_${APP.ac.section}_${APP.ac.sy}.xlsx`);toast('✓ SF1 Excel exported');
}

function excelSF2(mon){
  const cd=getCD();const stu=allStu();const dates=Object.keys(cd.att).sort().filter(d=>d.startsWith(mon));const wb=XLSX.utils.book_new();
  const hdr2=[['School Form 2 (SF2) — Daily Attendance Record'],['Month:',mon],['School:',cd.school.name||''],['Grade & Section:',`${APP.ac.grade} – ${APP.ac.section}`],[''],['#','Name',...dates,'P','A','L']];
  stu.forEach((s,i)=>{let P=0,A=0,L=0;const cells=dates.map(d=>{const st=(cd.att[d]||{})[s.name]||'';if(st==='P')P++;else if(st==='A')A++;else if(st==='L')L++;return st;});hdr2.push([i+1,s.name,...cells,P,A,L]);});
  const ws=XLSX.utils.aoa_to_sheet(hdr2);XLSX.utils.book_append_sheet(wb,ws,'SF2');XLSX.writeFile(wb,`SF2_${mon}_${APP.ac.section}.xlsx`);toast('✓ SF2 Excel exported');
}

function excelSF4(){
  const cd=getCD();const stu=allStu();const dates=Object.keys(cd.att).sort();const months=[...new Set(dates.map(d=>d.substring(0,7)))];const wb=XLSX.utils.book_new();
  const rows=[['School Form 4 (SF4) — Monthly Attendance Report'],['School:',cd.school.name||''],['Grade & Section:',`${APP.ac.grade} – ${APP.ac.section}`],[''],['Month','Enrollment','School Days','Total Present','Total Absent','Total Late','Remarks']];
  months.forEach(mon=>{const monDates=dates.filter(d=>d.startsWith(mon));let P=0,A=0,L=0;stu.forEach(s=>{monDates.forEach(d=>{const st=(cd.att[d]||{})[s.name]||'';if(st==='P')P++;else if(st==='A')A++;else if(st==='L')L++;});});rows.push([mon,stu.length,monDates.length,P,A,L,'']);});
  const ws=XLSX.utils.aoa_to_sheet(rows);XLSX.utils.book_append_sheet(wb,ws,'SF4');XLSX.writeFile(wb,`SF4_${APP.ac.section}_${APP.ac.sy}.xlsx`);toast('✓ SF4 Excel exported');
}

function excelSF5(){
  const cd=getCD();const stu=allStu();const wb=XLSX.utils.book_new();
  const rows=[['School Form 5 (SF5) — Report on Promotion and Level of Proficiency'],['Three-Term System · DO 009, s. 2026'],['School:',cd.school.name||''],['Grade & Section:',`${APP.ac.grade} – ${APP.ac.section}`,'SY:',APP.ac.sy],['Teacher:',cd.school.teacher||'','Subject:',cd.school.subject||''],[''],['#','Learner\'s Name','Term 1','Term 2','Term 3','Final Grade','Status','Remarks']];
  stu.forEach((s,i)=>{const t1=calcT(s.name,1).termGrade,t2=calcT(s.name,2).termGrade,t3=calcT(s.name,3).termGrade;const vt=[t1,t2,t3].filter(v=>v!==null);const final=vt.length?Math.round(vt.reduce((a,b)=>a+b,0)/vt.length):null;rows.push([i+1,s.name,t1||'',t2||'',t3||'',final||'',final?(final>=75?'PROMOTED':'RETAINED'):'','']);});
  const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:4},{wch:40},{wch:9},{wch:9},{wch:9},{wch:11},{wch:10},{wch:18}];XLSX.utils.book_append_sheet(wb,ws,'SF5');XLSX.writeFile(wb,`SF5_${APP.ac.grade.replace(/\s/g,'')}_${APP.ac.section}_${APP.ac.sy}.xlsx`);toast('✓ SF5 Excel exported');
}

function excelSF10(){
  const cd=getCD();const stu=allStu();const wb=XLSX.utils.book_new();
  const rows=[['School Form 10 (SF10) — Learner\'s Permanent Academic Record'],['Three-Term System · DO 009, s. 2026'],['School:',cd.school.name||'','School ID:',cd.school.id||''],['Grade & Section:',`${APP.ac.grade} – ${APP.ac.section}`,'SY:',APP.ac.sy],[''],['#','Learner\'s Name','Sex','LRN','Date of Birth','Term 1','Term 2','Term 3','Final Grade','Status','Remarks']];
  stu.forEach((s,i)=>{const t1=calcT(s.name,1).termGrade,t2=calcT(s.name,2).termGrade,t3=calcT(s.name,3).termGrade;const vt=[t1,t2,t3].filter(v=>v!==null);const final=vt.length?Math.round(vt.reduce((a,b)=>a+b,0)/vt.length):null;rows.push([i+1,s.name,s.g==='male'?'M':'F','','',t1||'',t2||'',t3||'',final||'',final?(final>=75?'PROMOTED':'RETAINED'):'','']);});
  const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:4},{wch:40},{wch:5},{wch:14},{wch:14},{wch:9},{wch:9},{wch:9},{wch:11},{wch:10},{wch:18}];XLSX.utils.book_append_sheet(wb,ws,'SF10');XLSX.writeFile(wb,`SF10_${APP.ac.grade.replace(/\s/g,'')}_${APP.ac.section}_${APP.ac.sy}.xlsx`);toast('✓ SF10 Excel exported');
}

function excelAtt(){
  const cd=getCD();const stu=allStu();const dates=Object.keys(cd.att).sort();const wb=XLSX.utils.book_new();
  const rows=[['Attendance Record'],['Grade & Section:',`${APP.ac.grade} – ${APP.ac.section}`],[''],['#','Student',...dates,'Total P','Total A','Total L']];
  stu.forEach((s,i)=>{let P=0,A=0,L=0;const cells=dates.map(d=>{const t=(cd.att[d]||{})[s.name]||'';if(t==='P')P++;else if(t==='A')A++;else if(t==='L')L++;return t||'';});rows.push([i+1,s.name,...cells,P,A,L]);});
  const ws=XLSX.utils.aoa_to_sheet(rows);XLSX.utils.book_append_sheet(wb,ws,'Attendance');XLSX.writeFile(wb,`Attendance_${APP.ac.grade.replace(/\s/g,'')}_${APP.ac.section}.xlsx`);toast('✓ Attendance Excel exported');
}

function excelCons(){
  if(!APP.imported.length){toast('Import files first');return;}
  const subjects=APP.imported.map(s=>s.subject||'?');const allNames=new Set();APP.imported.forEach(s=>(s.students||[]).forEach(st=>allNames.add(norm(st.name))));const nameArr=[...allNames].sort();const lkp={};APP.imported.forEach(s=>{lkp[s.subject]={};(s.students||[]).forEach(st=>lkp[s.subject][norm(st.name)]=st);});
  const wb=XLSX.utils.book_new();
  const hdrow=['#','Name',...subjects.flatMap(s=>[s+' T1',s+' T2',s+' T3',s+' Final']),'General Average','Status'];
  const rows=nameArr.map((name,idx)=>{const allTerms=subjects.map(subj=>{const st=lkp[subj][name];return st?[st.terms?.T1||'',st.terms?.T2||'',st.terms?.T3||'',st.finalGrade||'']:['','','',''];});const finals=subjects.map(subj=>lkp[subj][name]?.finalGrade).filter(v=>v);const ga=finals.length?Math.round(finals.reduce((a,b)=>a+b,0)/finals.length):'';const allP=subjects.every(subj=>{const st=lkp[subj][name];return!st||!st.finalGrade||(st.finalGrade>=75);});return[idx+1,name,...allTerms.flat(),ga,ga!==''?(ga>=75&&allP?'PROMOTED':'RETAINED'):''];});
  const ws=XLSX.utils.aoa_to_sheet([hdrow,...rows]);XLSX.utils.book_append_sheet(wb,ws,'Consolidated');
  APP.imported.forEach(s=>{const sRows=(s.students||[]).map((st,i)=>[i+1,st.name,st.terms?.T1||'',st.terms?.T2||'',st.terms?.T3||'',st.finalGrade||'',st.remark||'']);XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['#','Name','T1','T2','T3','Final','Remark'],...sRows]),(s.subject||'Subject').substring(0,28));});
  XLSX.writeFile(wb,`Consolidated_${APP.ac.grade.replace(/\s/g,'')}_${APP.ac.section}_${APP.ac.sy}.xlsx`);toast('✓ Consolidated Excel exported');
}

// ══════════════════════════════════════════════
// 26. UTILITY FUNCTIONS
// ══════════════════════════════════════════════
let _toastTimer=null;
function toast(msg){const t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.style.display='block';if(_toastTimer)clearTimeout(_toastTimer);_toastTimer=setTimeout(()=>{t.style.display='none';},3500);}
function openModal(title,sub,body){const m=document.getElementById('mainModal');if(!m)return;document.getElementById('mTitle').textContent=title;document.getElementById('mSub').textContent=sub||'';document.getElementById('mBody').innerHTML=body;m.classList.add('open');}
function closeModal(){const m=document.getElementById('mainModal');if(m)m.classList.remove('open');}
function submitToRegistrar(){showPage('registrar');}

// ══════════════════════════════════════════════
// 27. INIT
// ══════════════════════════════════════════════
function init(){
  // Check for saved user session
  try{
    const saved=localStorage.getItem('anhs_current_user');
    if(saved){
      const u=JSON.parse(saved);
      CURRENT_USER=u;
      startApp(u);
      return;
    }
  }catch(e){}

  // Show auth screen
  document.getElementById('authScreen').style.display='flex';
  document.getElementById('app').style.display='none';

  // beforeunload warning
  window.addEventListener('beforeunload',function(e){
    if(APP.role&&APP.ac.grade){e.preventDefault();e.returnValue='Did you export your file? Your data may not be saved on other devices.';}
  });

  // Auto-save every 15 minutes
  setInterval(function(){
    if(!APP.role||!APP.ac.grade||!APP.ac.section)return;
    try{
      const cd=getCD();
      if(!cd.students.male.length&&!cd.students.female.length)return;
      const blob=new Blob([JSON.stringify({app:APP,user:CURRENT_USER?.empId,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);
      const subj=(cd.school.subject||'Class').replace(/\s+/g,'_').substring(0,12);
      a.download=`AutoSave_${subj}_${APP.ac.grade.replace(/\s/g,'')}_${APP.ac.section}.json`;
      a.click();URL.revokeObjectURL(a.href);
      toast('⏱ Auto-saved — check your Downloads folder');
    }catch(err){}
  },15*60*1000);
}

init();
