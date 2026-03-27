/* ================================================================
   MENDTRIX E-CLASS RECORD SYSTEM — MAIN JAVASCRIPT
   assets/js/main.js
   ================================================================

   TABLE OF CONTENTS:
   1.  TRANSMUTATION TABLE (DepEd K-12 grade conversion)
   2.  APP STATE & DATA STRUCTURE
   3.  PERSISTENCE (localStorage save/load)
   4.  FILE SAVE / LOAD (.json export/import)
   5.  ROLE & NAVIGATION
   6.  CLASS SELECTOR
   7.  RECORD BOOK — SETUP MODULE
   8.  RECORD BOOK — GRADE ENTRY MODULE
   9.  RECORD BOOK — BULK ENTRY MODULE
   10. RECORD BOOK — SUMMARY MODULE
   11. RECORD BOOK — ANALYTICS MODULE
   12. RECORD BOOK — LOA REPORTS MODULE
   13. GRADE SUMMARY PAGE (tabs: class / LOA overview / student detail)
   14. ATTENDANCE — DAILY MODULE
   15. ATTENDANCE — SUMMARY MODULE
   16. CONSOLIDATED GRADES MODULE (Advisory Teacher)
   17. PDF EXPORT FUNCTIONS
   18. EXCEL EXPORT (DepEd E-Class Record format)
   19. JSON EXPORT (for Advisory Teacher handoff)
   20. LOA EXCEL EXPORT
   21. UTILITY FUNCTIONS
   22. INIT (app startup, auto-save timer, beforeunload warning)
   ================================================================ */

// ══════════════════════════════════════════════
// TRANSMUTATION TABLE
// ══════════════════════════════════════════════
const TRANS=[[0,3.99,60],[4,7.99,61],[8,11.99,62],[12,15.99,63],[16,19.99,64],[20,23.99,65],[24,27.99,66],[28,31.99,67],[32,35.99,68],[36,39.99,69],[40,43.99,70],[44,47.99,71],[48,51.99,72],[52,55.99,73],[56,59.99,74],[60,61.59,75],[61.6,63.19,76],[63.2,64.79,77],[64.8,66.39,78],[66.4,67.99,79],[68,69.59,80],[69.6,71.19,81],[71.2,72.79,82],[72.8,74.39,83],[74.4,75.99,84],[76,77.59,85],[77.6,79.19,86],[79.2,80.79,87],[80.8,82.39,88],[82.4,83.99,89],[84,85.59,90],[85.6,87.19,91],[87.2,88.79,92],[88.8,90.39,93],[90.4,91.99,94],[92,93.59,95],[93.6,95.19,96],[95.2,96.79,97],[96.8,98.39,98],[98.4,99.99,99],[100,100,100]];
function transmute(v){if(v===null||isNaN(v))return null;if(v>=100)return 100;for(const[lo,hi,g]of TRANS)if(v>=lo&&v<=hi)return g;return v<0?60:100;}
function r2(n){return Math.round(n*100)/100}
function esc(s){return String(s).replace(/'/g,"\\'")}
function escH(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function norm(n){return String(n).trim().replace(/\s+/g,' ').toUpperCase()}
function today(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}

// ══════════════════════════════════════════════
// APP STATE
// ══════════════════════════════════════════════
let APP={
  role:null,
  ac:{grade:'',section:''},
  cd:{},           // classData keyed by "Grade_Section"
  imported:[],     // advisory imports
  page:'recordbook',
  rbtab:'setup',
  gq:1, aq:0,
  attDate:today(),
  hlStudent:null
};

function ck(){return (APP.ac.grade+'_'+APP.ac.section).replace(/\s+/g,'_')}
function getCD(){
  const k=ck();
  if(!APP.cd[k]){APP.cd[k]={
    school:{name:'',id:'',region:'',division:'',section:APP.ac.section,teacher:'',subject:'',year:'',grade:APP.ac.grade},
    students:{male:[],female:[]},
    hps:{1:{ww:Array(10).fill(null),pt:Array(10).fill(null),qa:null},2:{ww:Array(10).fill(null),pt:Array(10).fill(null),qa:null},3:{ww:Array(10).fill(null),pt:Array(10).fill(null),qa:null},4:{ww:Array(10).fill(null),pt:Array(10).fill(null),qa:null}},
    grades:{1:{},2:{},3:{},4:{}},
    att:{},
    diag:{items:0,hso:0,lso:0}  // diagnostic test data
  };}
  return APP.cd[k];
}
function allStu(){const cd=getCD();return[...cd.students.male.map(n=>({name:n,g:'male'})),...cd.students.female.map(n=>({name:n,g:'female'}))];}
function hasClass(){return APP.ac.grade&&APP.ac.section}

// ══════════════════════════════════════════════
// PERSISTENCE
// ══════════════════════════════════════════════
function save(){try{localStorage.setItem('mx_v4',JSON.stringify(APP))}catch(e){}}
function load(){
  try{
    const d=localStorage.getItem('mx_v4');if(!d)return;
    const p=JSON.parse(d);APP={...APP,...p};
    Object.keys(APP.cd||{}).forEach(k=>{
      const cd=APP.cd[k];
      for(let q=1;q<=4;q++){
        if(!cd.hps[q])cd.hps[q]={ww:Array(10).fill(null),pt:Array(10).fill(null),qa:null};
        while(cd.hps[q].ww.length<10)cd.hps[q].ww.push(null);
        while(cd.hps[q].pt.length<10)cd.hps[q].pt.push(null);
        if(!cd.grades[q])cd.grades[q]={};
      }
      if(!cd.att)cd.att={};
      if(!cd.students)cd.students={male:[],female:[]};
      if(!cd.diag)cd.diag={items:0,hso:0,lso:0};
    });
    if(!APP.imported)APP.imported=[];
  }catch(e){}
}

// ══════════════════════════════════════════════
// GRADE CALC
// ══════════════════════════════════════════════
function calcQ(name,q){
  const cd=getCD();const h=cd.hps[q];
  const g=(cd.grades[q]&&cd.grades[q][name])||{};
  const ww=g.ww||Array(10).fill(null);const pt=g.pt||Array(10).fill(null);const qa=g.qa!==undefined?g.qa:null;
  const W={ww:0.30,pt:0.50,qa:0.20};
  let wwH=0;h.ww.forEach(v=>{if(v)wwH+=v});
  let wwS=0,wwA=false;ww.forEach(v=>{if(v!==null&&!isNaN(v)){wwS+=parseFloat(v);wwA=true}});
  let wwT=null,wwPS=null,wwWS=null;
  if(wwA&&wwH>0){wwT=wwS;wwPS=r2((wwS/wwH)*100);wwWS=r2(wwPS*W.ww)}
  let ptH=0;h.pt.forEach(v=>{if(v)ptH+=v});
  let ptS=0,ptA=false;pt.forEach(v=>{if(v!==null&&!isNaN(v)){ptS+=parseFloat(v);ptA=true}});
  let ptT=null,ptPS=null,ptWS=null;
  if(ptA&&ptH>0){ptT=ptS;ptPS=r2((ptS/ptH)*100);ptWS=r2(ptPS*W.pt)}
  let qaPS=null,qaWS=null;
  if(qa!==null&&!isNaN(qa)&&h.qa){qaPS=r2((parseFloat(qa)/h.qa)*100);qaWS=r2(qaPS*W.qa)}
  let initial=null,quarterly=null;
  if(wwWS!==null||ptWS!==null||qaWS!==null){initial=r2((wwWS||0)+(ptWS||0)+(qaWS||0));quarterly=transmute(initial)}
  return{wwT,wwPS,wwWS,ptT,ptPS,ptWS,qaPS,qaWS,initial,quarterly,ww,pt,qa};
}

// ══════════════════════════════════════════════
// TOAST / MODAL
// ══════════════════════════════════════════════
let toastT;
function toast(msg,dur=2800){const t=document.getElementById('toast');t.textContent=msg;t.style.display='block';clearTimeout(toastT);toastT=setTimeout(()=>t.style.display='none',dur);}
function openModal(title,sub,html){document.getElementById('mTitle').textContent=title;document.getElementById('mSub').textContent=sub||'';document.getElementById('mBody').innerHTML=html;document.getElementById('mainModal').classList.add('open');}
function closeModal(){document.getElementById('mainModal').classList.remove('open')}

// ══════════════════════════════════════════════
// ROLE & NAV
// ══════════════════════════════════════════════
function selectRole(role){
  APP.role=role;save();
  document.getElementById('roleScreen').classList.add('hidden');
  document.getElementById('app').classList.add('visible');
  document.getElementById('roleLabel').textContent=role==='subject'?'Subject Teacher':'Advisory Teacher';

  renderSavedClasses();

  const saved=document.getElementById('savedClassSelect');
  if(saved) saved.value='';

  buildNav();
  showPage('recordbook');
}

function switchRole(){document.getElementById('roleScreen').classList.remove('hidden');document.getElementById('app').classList.remove('visible');}
function buildNav(){
  const nav=document.getElementById('mainNav');
  const items=APP.role==='subject'
    ?[{id:'recordbook',i:'📘',l:'Record Book'},{id:'gradesummary',i:'📄',l:'Grade Summary'},{id:'attsummary',i:'📅',l:'Attendance Summary'},{id:'dailyatt',i:'📆',l:'Daily Attendance'}]
    :[{id:'recordbook',i:'📘',l:'Record Book'},{id:'gradesummary',i:'📄',l:'Grade Summary'},{id:'consolidated',i:'🗂',l:'Consolidated Grades'},{id:'attsummary',i:'📅',l:'Attendance Summary'},{id:'dailyatt',i:'📆',l:'Daily Attendance'}];
  nav.innerHTML=items.map(x=>`<button class="mnbtn ${APP.page===x.id?'active':''}" data-page="${x.id}" onclick="showPage('${x.id}')">${x.i} ${x.l}</button>`).join('');
}
function showPage(name){
  APP.page=name;
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.mnbtn').forEach(b=>b.classList.toggle('active',b.dataset.page===name));
  const pg=document.getElementById('page-'+name);if(pg)pg.classList.add('active');
  if(name==='recordbook')renderRB(APP.rbtab);
  if(name==='gradesummary')renderGradeSummaryPage();
  if(name==='attsummary')renderAttSummary();
  if(name==='dailyatt')renderDailyAtt();
  if(name==='consolidated')renderConsolidated();
  save();
}
function applyClass(){
  const grade=document.getElementById('csGrade').value;
  const section=norm(document.getElementById('csSection').value);
  if(!grade||!section){toast('Select grade level and enter section');return}

  APP.ac={grade,section};
  document.getElementById('csInfo').textContent=`Active: ${grade} – ${section}`;
  document.getElementById('classBadge').textContent=`${grade} · ${section}`;

  rememberClass(grade,section);
  renderSavedClasses();

  save();
  showPage(APP.page);
  toast(`✓ Loaded: ${grade} – ${section}`);
}

// helper for apply class
function rememberClass(grade,section){
  if(!APP.savedClasses)APP.savedClasses={subject:[],advisory:[]};

  const role=APP.role||'subject';
  const list=APP.savedClasses[role]||[];

  const exists=list.find(x=>x.grade===grade&&x.section===section);
  if(!exists){
    list.unshift({grade,section});
  }

  APP.savedClasses[role]=list.slice(0,12);
}

function renderSavedClasses(){
  const sel=document.getElementById('savedClassSelect');
  if(!sel)return;

  if(!APP.savedClasses)APP.savedClasses={subject:[],advisory:[]};
  const role=APP.role||'subject';
  const list=APP.savedClasses[role]||[];

  sel.innerHTML=`<option value="">Saved classes</option>`+
    list.map((x,i)=>`<option value="${i}">${x.grade} – ${x.section}</option>`).join('');
}

function pickSavedClass(){
  const sel=document.getElementById('savedClassSelect');
  if(!sel||sel.value==='')return;

  if(!APP.savedClasses)APP.savedClasses={subject:[],advisory:[]};
  const role=APP.role||'subject';
  const list=APP.savedClasses[role]||[];
  const picked=list[parseInt(sel.value,10)];

  if(!picked)return;

  document.getElementById('csGrade').value=picked.grade;
  document.getElementById('csSection').value=picked.section;
  applyClass();
}

function clearSavedClasses(){
  if(!APP.savedClasses)APP.savedClasses={subject:[],advisory:[]};
  const role=APP.role||'subject';
  APP.savedClasses[role]=[];
  renderSavedClasses();
  save();
  toast('Saved classes cleared');
}

// ══════════════════════════════════════════════
// FILE SAVE/LOAD
// ══════════════════════════════════════════════
function saveFile(){
  if(!hasClass()){toast('Select a class first');return}
  const cd=getCD();
  const blob=new Blob([JSON.stringify({version:'3.0',exportType:'classData',classKey:ck(),role:APP.role,data:cd},null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=`Mendtrix_${(cd.school.subject||'Class').replace(/\s+/g,'_').substring(0,15)}_${APP.ac.grade.replace(/\s/g,'')}_${APP.ac.section}.json`;
  a.click();toast('✓ File saved');
}
function loadFile(inp){
  const f=inp.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=e=>{
    try{
      const p=JSON.parse(e.target.result);if(!p.data){toast('Invalid file');return}
      const k=p.classKey||ck();APP.cd[k]=p.data;
      const cd=APP.cd[k];
      for(let q=1;q<=4;q++){
        if(!cd.hps[q])cd.hps[q]={ww:Array(10).fill(null),pt:Array(10).fill(null),qa:null};
        while(cd.hps[q].ww.length<10)cd.hps[q].ww.push(null);
        while(cd.hps[q].pt.length<10)cd.hps[q].pt.push(null);
        if(!cd.grades[q])cd.grades[q]={};
      }
      if(!cd.att)cd.att={};if(!cd.diag)cd.diag={items:0,hso:0,lso:0};
      if(cd.school.grade&&cd.school.section){
  APP.ac={grade:cd.school.grade,section:cd.school.section};
  rememberClass(cd.school.grade,cd.school.section);
  renderSavedClasses();
  document.getElementById('csGrade').value=cd.school.grade;
  document.getElementById('csSection').value=cd.school.section;
  document.getElementById('csInfo').textContent=`Active: ${cd.school.grade} – ${cd.school.section}`;
  document.getElementById('classBadge').textContent=`${cd.school.grade} · ${cd.school.section}`;
}
      save();showPage(APP.page);toast('✓ File loaded');
    }catch(err){toast('Error reading file');}
  };
  r.readAsText(f);inp.value='';
}

// ══════════════════════════════════════════════
// RECORD BOOK MODULE
// ══════════════════════════════════════════════
function showRB(tab){
  APP.rbtab=tab;
  const tabs=['setup','gradeentry','bulkentry','summary','analytics','loa','instructions'];
  document.querySelectorAll('#rbNav .stab').forEach((t,i)=>t.classList.toggle('active',tabs[i]===tab));
  document.querySelectorAll('.rbtab').forEach(el=>el.style.display='none');
  const el=document.getElementById('rb-'+tab);if(el)el.style.display='block';
  renderRB(tab);save();
}
function renderRB(tab){
  if(tab==='instructions'){
    renderInstructions();
    return;
  }

  if(!hasClass()){
    const el=document.getElementById('rb-'+tab);
    if(el)el.innerHTML='<div class="ws"><h2>Select a class first</h2><p>Use the class selector at the top.</p></div>';
    return;
  }

  if(tab==='setup')renderSetup();
  else if(tab==='gradeentry')renderGradeEntry();
  else if(tab==='bulkentry')renderBulkEntry();
  else if(tab==='summary')renderRBSummary();
  else if(tab==='analytics')renderAnalytics();
  else if(tab==='loa')renderLOA();
}

// ── SETUP
function renderSetup(){
  const cd=getCD();const sc=cd.school;
  document.getElementById('rb-setup').innerHTML=`
  <div class="ebar"><span class="elbl">💾 File:</span>
    <label class="btn bo bsm" style="cursor:pointer">📂 Load File<input type="file" accept=".json" style="display:none" onchange="loadFile(this)"></label>
    <button class="btn bg bsm" onclick="saveSetupAndFile()">💾 Save & Export</button>
    <div class="sp"></div><span style="font-size:10px;color:var(--tx3)">Auto-saves in browser. Export JSON as backup to restore on any computer.</span>
  </div>
  <div class="card">
    <div class="ch"><div><div class="ct">School Information</div><div class="cs">Appears on all reports and exports</div></div>
      <div class="fl"><button class="btn bo bsm" onclick="loadSample()">Sample Data</button><button class="btn bp bsm" onclick="doSaveSetup()">Save</button></div>
    </div>
    <div class="g4" style="margin-bottom:12px">
      <div><div class="lbl">School Name</div><input class="inp" id="sc_name" value="${escH(sc.name||'')}"></div>
      <div><div class="lbl">School ID</div><input class="inp" id="sc_id" value="${escH(sc.id||'')}"></div>
      <div><div class="lbl">Region</div><input class="inp" id="sc_region" value="${escH(sc.region||'')}"></div>
      <div><div class="lbl">Division</div><input class="inp" id="sc_division" value="${escH(sc.division||'')}"></div>
    </div>
    <div class="g4">
      <div><div class="lbl">Grade Level</div><input class="inp" id="sc_grade" value="${escH(sc.grade||APP.ac.grade||'')}" readonly style="background:var(--surf2)"></div>
      <div><div class="lbl">Section</div><input class="inp" id="sc_section" value="${escH(sc.section||APP.ac.section||'')}"></div>
      <div><div class="lbl">Teacher Name</div><input class="inp" id="sc_teacher" value="${escH(sc.teacher||'')}"></div>
      <div><div class="lbl">Subject</div><input class="inp" id="sc_subject" value="${escH(sc.subject||'')}"></div>
    </div>
    <div class="g2" style="margin-top:12px">
      <div><div class="lbl">School Year</div><input class="inp" id="sc_year" value="${escH(sc.year||'')}"></div>
    </div>
  </div>
  <div class="card">
    <div class="ch"><div class="ct">Highest Possible Score (HPS) per Quarter</div><div class="cs">Set max score per item. Leave blank if not used for that quarter.</div></div>
    <div id="hpsArea"></div>
  </div>
  <div class="card">
    <div class="ch"><div class="ct">Student List</div>
      <div class="fl"><span class="tag tb" id="mCnt">0 Male</span><span class="tag tg" id="fCnt">0 Female</span></div>
    </div>
    <div class="g2">
      <div><div class="lbl" style="margin-bottom:7px">👦 Male Students</div><ul class="sl" id="mList"></ul>
        <div class="ar"><input class="inp" id="newM" placeholder="Full name" style="flex:1" onkeydown="if(event.key==='Enter')addStu('male')"><button class="btn bo bsm" onclick="addStu('male')">+ Add</button></div>
      </div>
      <div><div class="lbl" style="margin-bottom:7px">👧 Female Students</div><ul class="sl" id="fList"></ul>
        <div class="ar"><input class="inp" id="newF" placeholder="Full name" style="flex:1" onkeydown="if(event.key==='Enter')addStu('female')"><button class="btn bo bsm" onclick="addStu('female')">+ Add</button></div>
      </div>
    </div>
  </div>`;
  renderHPS();renderStuList('male');renderStuList('female');
}
function renderHPS(){
  const cd=getCD();let html='';
  for(let q=1;q<=4;q++){
    const h=cd.hps[q];
    html+=`<div style="margin-bottom:17px"><div style="font-size:11px;font-weight:600;margin-bottom:8px"><span class="tag tb">Quarter ${q}</span></div>
      <div style="margin-bottom:7px"><div class="lbl" style="margin-bottom:4px">Written Works HPS (WW1–WW10)</div>
        <div class="hps10">${Array.from({length:10},(_,i)=>`<div class="hpl">WW${i+1}</div>`).join('')}</div>
        <div class="hps10">${Array.from({length:10},(_,i)=>`<input class="hpi" type="number" min="0" value="${h.ww[i]||''}" placeholder="—" onchange="setHPS(${q},'ww',${i},this.value)">`).join('')}</div>
      </div>
      <div style="margin-bottom:7px"><div class="lbl" style="margin-bottom:4px">Performance Tasks HPS (PT1–PT10)</div>
        <div class="hps10">${Array.from({length:10},(_,i)=>`<div class="hpl">PT${i+1}</div>`).join('')}</div>
        <div class="hps10">${Array.from({length:10},(_,i)=>`<input class="hpi" type="number" min="0" value="${h.pt[i]||''}" placeholder="—" onchange="setHPS(${q},'pt',${i},this.value)">`).join('')}</div>
      </div>
      <div class="fl"><div class="lbl" style="margin:0">QA HPS:</div><input class="hpi" type="number" min="0" style="width:90px" value="${h.qa||''}" placeholder="e.g. 100" onchange="setHPS(${q},'qa',0,this.value)"></div>
    </div>${q<4?'<hr class="div">':''}`;
  }
  const a=document.getElementById('hpsArea');if(a)a.innerHTML=html;
}
function setHPS(q,cat,idx,val){const cd=getCD();const v=val===''?null:parseFloat(val);if(cat==='qa')cd.hps[q].qa=v;else cd.hps[q][cat][idx]=v;save();}
function renderStuList(g){
  const cd=getCD();const list=document.getElementById(g==='male'?'mList':'fList');if(!list)return;
  list.innerHTML=cd.students[g].map((s,i)=>`<li class="si"><span class="sn">${i+1}</span><span class="st">${escH(s)}</span><button class="sd" onclick="rmStu('${g}',${i})">✕</button></li>`).join('');
  const cnt=document.getElementById(g==='male'?'mCnt':'fCnt');if(cnt)cnt.textContent=cd.students[g].length+(g==='male'?' Male':' Female');
}
function addStu(g){
  const cd=getCD();const inp=document.getElementById(g==='male'?'newM':'newF');
  const name=norm(inp.value);if(!name)return;
  cd.students[g].push(name);inp.value='';save();renderStuList(g);toast('Student added');
}
function rmStu(g,idx){const cd=getCD();cd.students[g].splice(idx,1);save();renderStuList(g);}
function doSaveSetup(){
  const cd=getCD();const sc=cd.school;
  ['name','id','region','division','section','teacher','subject','year'].forEach(f=>{const el=document.getElementById('sc_'+f);if(el)sc[f]=el.value;});
  sc.grade=APP.ac.grade;save();toast('✓ Setup saved');
}
function saveSetupAndFile(){doSaveSetup();saveFile();}
function loadSample(){
  const cd=getCD();
  cd.school={name:'Angono National High School',id:'301417',region:'IV-A CALABARZON',division:'RIZAL',section:APP.ac.section||'PEARL',teacher:'Juan Dela Cruz',subject:'EDUKASYON SA PAGPAPAKATAO',year:'2024-2025',grade:APP.ac.grade||'Grade 10'};
  cd.students.male=['ABORDONADO, LANCE STEPHEN RAYOS','ALIGATO, A-JAY A.','ANASTACIO, ART SEBASTIAN C.','BERMUNDO, JOHN CRIS MENDOZA','BODOSO, JOHN ROSS ELATICO','DE BORJA, JUSTINE LOPEZ','DELOS SANTOS, MARK RAIVEN VILLA','DUREZA, JOHN LEE MERINO','EATICO, JUSTIN','FELIX, ALFRED DE GUZMAN','FLORES, JHON ERIC ABALOS','GILBALIGA, LEEMUEL P.','HILARIO, KARL RAPHAEL C.','JAOQUIN, RICARDO STA. ANA','LAGARDE, MARKY SERGIO ARIOLA'];
  cd.students.female=['ABUCAY, ARGEDN A.','ANDRES, FIONA LOREIN CORPUZ','ANGLO, ASHLEY MAE BLAS','BADANGO, RACHELLE FLORES','CADO, PRINCESS ABIGAIL REYES','CASUCIAN, PRINCESS SALVA MARIE LADEÑO','CORPUZ, JOANA POTENTADO','DE GUZMAN, JENNILYN MARIO','DELA CRUZ, VERCEL IYAH MARTICIO','DELOS SANTOS, AYEZA MEI MORAL','ENGAY, GRESIEL AVILA','ENGAY, SARAH KAYE PREQUENCIA','JULATON, ERIKA DELOS ANGELES','LARAÑO, SHERLYN SABELA','LIRAY, ALYZZA JANE Z.'];
  cd.hps[1]={ww:[40,20,10,10,30,null,null,null,null,null],pt:[10,15,15,10,null,null,null,null,null,null],qa:40};
  cd.hps[2]={ww:[10,15,10,10,35,null,null,null,null,null],pt:[10,5,5,15,40,10,null,null,null,null],qa:60};
  cd.hps[3]={ww:[40,20,10,15,15,null,null,null,null,null],pt:[25,30,15,10,20,null,null,null,null,null],qa:null};
  cd.hps[4]={ww:[null,null,null,null,null,null,null,null,null,null],pt:[45,null,null,null,null,null,null,null,null,null],qa:null};
  cd.diag={items:50,hso:98,lso:12};
  // Sample Q1 grades
  const wwD=[[22,13,4,8,20],[29,18,10,10,27],[30,17,10,9,20],[15,12,4,9,22],[22,13,7,10,null],[32,15,8,8,25],[35,18,6,8,22],[24,14,10,10,17],[26,14,8,8,28],[17,13,8,8,25],[21,15,8,8,27],[18,8,8,8,14],[15,8,null,null,null],[28,16,null,10,18],[28,11,8,9,20]];
  const ptD=[[10,14,13,10],[10,15,15,10],[10,12,15,10],[10,15,15,7],[10,15,15,10],[10,15,12,8],[10,15,15,6],[10,14,13,10],[10,15,10,10],[10,13,15,10],[10,15,15,8],[10,8,15,6],[10,8,null,null],[10,16,12,8],[10,11,13,8]];
  const qaD=[18,17,27,11,18,22,24,null,28,25,22,null,null,null,22];
  cd.grades[1]={};
  cd.students.male.forEach((n,i)=>{if(i<wwD.length)cd.grades[1][n]={ww:[...wwD[i],...Array(10-wwD[i].length).fill(null)],pt:[...ptD[i],...Array(10-ptD[i].length).fill(null)],qa:qaD[i]};});
  save();renderSetup();toast('✓ Sample data loaded');
}

// ── GRADE ENTRY
function renderGradeEntry(){
  const el=document.getElementById('rb-gradeentry');const q=APP.gq;
  el.innerHTML=`
  <div class="ebar"><span class="elbl">📄 Export:</span><button class="btn br bsm" onclick="pdfGradeEntry()">📄 PDF</button><div class="sp"></div><button class="btn bg bsm" onclick="save();toast('✓ Saved')">💾 Save</button></div>
  <div class="fl" style="margin-bottom:12px">
    <div class="qtabs">${[1,2,3,4].map(i=>`<button class="qtab ${i===q?'active':''}" onclick="selGQ(${i})">Quarter ${i}</button>`).join('')}</div>
  </div>
  <div class="card" style="padding:14px"><div id="gtWrap"></div></div>`;
  renderGradeTable();
}
function selGQ(q){APP.gq=q;renderGradeEntry();if(APP.hlStudent){setTimeout(()=>scrollToStu(APP.hlStudent,q),250);APP.hlStudent=null;}}
function renderGradeTable(){
  const q=APP.gq;const cd=getCD();const h=cd.hps[q];const stu=allStu();const wrap=document.getElementById('gtWrap');
  if(!wrap)return;if(!stu.length){wrap.innerHTML='<div class="ws"><h2>No students</h2><p>Add students in Setup.</p></div>';return}
  const wwC=Math.max(h.ww.filter(v=>v).length,1);const ptC=Math.max(h.pt.filter(v=>v).length,1);const hasQA=!!h.qa;
  const wwHT=h.ww.reduce((a,v)=>a+(v||0),0);const ptHT=h.pt.reduce((a,v)=>a+(v||0),0);
  let th=`<thead><tr><th rowspan="2" style="width:26px">#</th><th rowspan="2" style="text-align:left;padding-left:7px;min-width:170px">Learner's Name</th>
    <th colspan="${wwC+3}" class="sww">Written Works (30%)</th>
    <th colspan="${ptC+3}" class="spt">Performance Tasks (50%)</th>
    ${hasQA?`<th colspan="3" class="sqa">QA (20%)</th>`:''}
    <th colspan="2" class="sg">Grades</th>
  </tr><tr>
    ${Array.from({length:wwC},(_,i)=>`<th>WW${i+1}</th>`).join('')}<th>Total</th><th>PS</th><th>WS</th>
    ${Array.from({length:ptC},(_,i)=>`<th>PT${i+1}</th>`).join('')}<th>Total</th><th>PS</th><th>WS</th>
    ${hasQA?'<th>Score</th><th>PS</th><th>WS</th>':''}
    <th>Initial</th><th>Q${q}</th>
  </tr></thead>`;
  const hr=`<tr class="hrow"><td></td><td class="lc">HPS</td>${h.ww.slice(0,wwC).map(v=>`<td style="padding:3px;text-align:center">${v||'—'}</td>`).join('')}<td style="padding:3px;text-align:center">${wwHT}</td><td style="padding:3px;text-align:center">100</td><td style="padding:3px;text-align:center">0.30</td>${h.pt.slice(0,ptC).map(v=>`<td style="padding:3px;text-align:center">${v||'—'}</td>`).join('')}<td style="padding:3px;text-align:center">${ptHT}</td><td style="padding:3px;text-align:center">100</td><td style="padding:3px;text-align:center">0.50</td>${hasQA?`<td style="padding:3px;text-align:center">${h.qa}</td><td style="padding:3px;text-align:center">100</td><td style="padding:3px;text-align:center">0.20</td>`:''}<td></td><td></td></tr>`;
  let body='';let lastG=null;
  stu.forEach(s=>{
    if(s.g!==lastG){body+=`<tr class="grph ${s.g==='female'?'f':'m'}"><td colspan="100">${s.g==='male'?'👦 MALE':'👧 FEMALE'}</td></tr>`;lastG=s.g;}
    const num=(s.g==='male'?cd.students.male:cd.students.female).indexOf(s.name)+1;
    const g=(cd.grades[q]&&cd.grades[q][s.name])||{};
    const ww=g.ww||Array(10).fill(null);const pt=g.pt||Array(10).fill(null);const qa=g.qa!==undefined&&g.qa!==null?g.qa:'';
    const c=calcQ(s.name,q);const sid=s.name.replace(/[^a-zA-Z0-9]/g,'_');
    body+=`<tr class="${s.g==='male'?'rm':'rf'}" id="trow_${q}_${sid}">
      <td class="numc">${num}</td><td class="nc">${escH(s.name)}</td>
      ${Array.from({length:wwC},(_,i)=>`<td class="gc ${isMissingGrade(ww[i])?'missing-grade':''}"><input type="number" min="0" value="${ww[i]!==null&&ww[i]!==undefined?ww[i]:''}" class="${isMissingGrade(ww[i])?'missing-grade-input':''}" oninput="setGr('${esc(s.name)}',${q},'ww',${i},this.value)"></td>`).join('')}
      <td class="cc bold ${isMissingGrade(c.wwT)?'missing-grade':''}" id="wwT_${q}_${sid}">${c.wwT!==null?c.wwT:''}</td>
      <td class="cc ${isMissingGrade(c.wwPS)?'missing-grade':''}" id="wwPS_${q}_${sid}">${c.wwPS!==null?c.wwPS:''}</td>
      <td class="cc ${isMissingGrade(c.wwWS)?'missing-grade':''}" id="wwWS_${q}_${sid}">${c.wwWS!==null?c.wwWS:''}</td>
      ${Array.from({length:ptC},(_,i)=>`<td class="gc ${isMissingGrade(pt[i])?'missing-grade':''}"><input type="number" min="0" value="${pt[i]!==null&&pt[i]!==undefined?pt[i]:''}" class="${isMissingGrade(pt[i])?'missing-grade-input':''}" oninput="setGr('${esc(s.name)}',${q},'pt',${i},this.value)"></td>`).join('')}
      <td class="cc bold ${isMissingGrade(c.ptT)?'missing-grade':''}" id="ptT_${q}_${sid}">${c.ptT!==null?c.ptT:''}</td>
      <td class="cc ${isMissingGrade(c.ptPS)?'missing-grade':''}" id="ptPS_${q}_${sid}">${c.ptPS!==null?c.ptPS:''}</td>
      <td class="cc ${isMissingGrade(c.ptWS)?'missing-grade':''}" id="ptWS_${q}_${sid}">${c.ptWS!==null?c.ptWS:''}</td>
      ${hasQA?`<td class="gc ${isMissingGrade(qa)?'missing-grade':''}"><input type="number" min="0" value="${qa}" class="${isMissingGrade(qa)?'missing-grade-input':''}" oninput="setGr('${esc(s.name)}',${q},'qa',0,this.value)"></td><td class="cc ${isMissingGrade(c.qaPS)?'missing-grade':''}" id="qaPS_${q}_${sid}">${c.qaPS!==null?c.qaPS:''}</td><td class="cc ${isMissingGrade(c.qaWS)?'missing-grade':''}" id="qaWS_${q}_${sid}">${c.qaWS!==null?c.qaWS:''}</td>`:''}
      <td class="cc bold ${isMissingGrade(c.initial)?'missing-grade':''}" id="init_${q}_${sid}">${c.initial!==null?c.initial:''}</td>
      <td class="cc ${isMissingGrade(c.quarterly)?'missing-grade':(c.quarterly?(c.quarterly>=75?'pass':'fail'): '')}" id="qg_${q}_${sid}">${c.quarterly||''}</td>
    </tr>`;
  });
  wrap.innerHTML=`<div style="font-size:10px;color:var(--tx3);margin-bottom:7px">${getCD().school.subject||'—'} · Q${q} · ${APP.ac.grade} ${APP.ac.section}</div>
    <div class="twrap"><table class="gtbl">${th}<tbody>${hr}${body}</tbody></table></div>`;
}
function setGr(name,q,cat,idx,val){
  const cd=getCD();if(!cd.grades[q])cd.grades[q]={};
  if(!cd.grades[q][name])cd.grades[q][name]={ww:Array(10).fill(null),pt:Array(10).fill(null),qa:null};
  const v=val===''?null:parseFloat(val);
  if(cat==='qa')cd.grades[q][name].qa=v;else cd.grades[q][name][cat][idx]=v;

  const c=calcQ(name,q);
  const sid=name.replace(/[^a-zA-Z0-9]/g,'_');

  const u=(id,val,base='cc')=>{
    const el=document.getElementById(id);
    if(!el)return;
    el.textContent=val!==null&&val!==undefined?val:'';
    el.className=base+(isMissingGrade(val)?' missing-grade':'');
  };

  u(`wwT_${q}_${sid}`,c.wwT,'cc bold');
  u(`wwPS_${q}_${sid}`,c.wwPS,'cc');
  u(`wwWS_${q}_${sid}`,c.wwWS,'cc');

  u(`ptT_${q}_${sid}`,c.ptT,'cc bold');
  u(`ptPS_${q}_${sid}`,c.ptPS,'cc');
  u(`ptWS_${q}_${sid}`,c.ptWS,'cc');

  u(`qaPS_${q}_${sid}`,c.qaPS,'cc');
  u(`qaWS_${q}_${sid}`,c.qaWS,'cc');
  u(`init_${q}_${sid}`,c.initial,'cc bold');

  const gc=document.getElementById(`qg_${q}_${sid}`);
  if(gc){
    gc.textContent=c.quarterly||'';
    gc.className='cc';
    if(isMissingGrade(c.quarterly)){
      gc.classList.add('missing-grade');
    }else if(c.quarterly>=75){
      gc.classList.add('pass');
    }else{
      gc.classList.add('fail');
    }
  }

  save();
}
function scrollToStu(name,q){
  const sid=name.replace(/[^a-zA-Z0-9]/g,'_');const el=document.getElementById(`trow_${q}_${sid}`);
  if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.style.outline='2px solid var(--blue)';setTimeout(()=>el.style.outline='',2000);}
}

//helper --- Highlight missing grades
function isMissingGrade(val){
  return val === null || val === '' || typeof val === 'undefined' || Number.isNaN(val);
}

// ── BULK ENTRY
function renderBulkEntry(){
  const el=document.getElementById('rb-bulkentry');
  el.innerHTML=`
  <div class="ebar"><span class="elbl">📄 Export:</span><button class="btn br bsm" onclick="pdfBulk()">📄 PDF</button></div>
  <div class="card">
    <div class="ch"><div class="ct">⚡ Bulk Grade Entry</div><div class="cs">Select → Load → Enter → Save</div></div>
    <div style="display:flex;gap:9px;flex-wrap:wrap;margin-bottom:12px;align-items:flex-end">
      <div><div class="lbl">Quarter</div><select class="inp" id="bQ" style="width:82px"><option value="1">Q1</option><option value="2">Q2</option><option value="3">Q3</option><option value="4">Q4</option></select></div>
      <div><div class="lbl">Gender</div><select class="inp" id="bG" style="width:82px"><option value="all">All</option><option value="male">Male</option><option value="female">Female</option></select></div>
      <div><div class="lbl">Category</div><select class="inp" id="bC" style="width:145px" onchange="updBulkItems()"><option value="WW">Written Works</option><option value="PT">Performance Tasks</option><option value="QA">QA Assessment</option></select></div>
      <div><div class="lbl">Item</div><select class="inp" id="bI" style="width:82px"></select></div>
      <button class="btn bp" onclick="loadBulk()">Load</button>
      <button class="btn bg" onclick="saveBulk()">Save Grades</button>
    </div>
    <div id="bHps" style="font-size:10px;color:var(--tx3);margin-bottom:8px"></div>
  </div>
  <div class="card" style="padding:14px"><div id="bulkTbl"><div class="ws"><h2>Select filters above</h2></div></div></div>
  <div id="bulkAnal" style="display:none">
    <div class="card"><div class="ch"><div class="ct">Quick Analytics</div></div>
      <div class="ag4" id="bStats"></div><div id="bMiss"></div>
    </div>
  </div>`;
  updBulkItems();
}
function updBulkItems(){
  const cat=document.getElementById('bC')?.value;const sel=document.getElementById('bI');if(!sel)return;
  sel.innerHTML='';if(cat==='QA'){sel.innerHTML='<option value="0">QA1</option>';return}
  for(let i=0;i<10;i++)sel.innerHTML+=`<option value="${i}">${cat}${i+1}</option>`;
}
function loadBulk(){
  const q=parseInt(document.getElementById('bQ').value);const gf=document.getElementById('bG').value;
  const cat=document.getElementById('bC').value;const idx=parseInt(document.getElementById('bI').value);
  const cd=getCD();const h=cd.hps[q];const hv=cat==='WW'?h.ww[idx]:cat==='PT'?h.pt[idx]:h.qa;
  document.getElementById('bHps').textContent=hv?`HPS for this item: ${hv}`:'⚠ HPS not set — go to Setup first.';
  let stu=[];
  if(gf==='all'||gf==='male')stu.push(...cd.students.male.map(n=>({name:n,g:'male'})));
  if(gf==='all'||gf==='female')stu.push(...cd.students.female.map(n=>({name:n,g:'female'})));
  const lbl=cat==='QA'?'QA1':`${cat}${idx+1}`;
  let rows='';stu.forEach((s,i)=>{
    const g=(cd.grades[q]&&cd.grades[q][s.name])||{};
    let cur=cat==='WW'?(g.ww&&g.ww[idx]!==null?g.ww[idx]:''):cat==='PT'?(g.pt&&g.pt[idx]!==null?g.pt[idx]:''):(g.qa!==null&&g.qa!==undefined?g.qa:'');
    const gClass = s.g === 'male' ? 'male' : 'female';const sid=s.name.replace(/[^a-zA-Z0-9]/g,'_');
    rows+=`<tr>
      <td style="padding:5px 6px;font-size:10px;color:var(--tx3);border:1px solid var(--bdr);text-align:center;width:26px">${i+1}</td>
      <td class="bulk-name ${gClass}" style="padding:5px 7px;font-size:11px;font-weight:500;border:1px solid var(--bdr)">${escH(s.name)}</td>
      <td style="padding:0;border:1px solid var(--bdr);width:68px;text-align:center">
        <input type="number" min="0" ${hv?`max="${hv}"`:''}
  value="${cur}" data-name="${escH(s.name)}" data-q="${q}" data-cat="${cat}" data-idx="${idx}"
  class="bulk-score-input ${isMissingGrade(cur)?'missing-grade-input':''}"
  onchange="bPrev(this,'bp_${sid}',${hv||0})">
      </td>
      <td id="bp_${sid}" style="padding:4px;font-size:10px;color:var(--tx3);border:1px solid var(--bdr);background:var(--surf2);text-align:center;width:48px">${hv&&cur!==''?r2((parseFloat(cur)/hv)*100)+'%':''}</td>
    </tr>`;
  });
  document.getElementById('bulkTbl').innerHTML=`<div style="font-size:10px;color:var(--tx3);margin-bottom:8px">Q${q} · ${lbl} · ${stu.length} students</div>
    <div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;max-width:440px">
      <thead><tr>
        <th style="padding:5px;font-size:10px;background:var(--surf2);border:1px solid var(--bdr)">#</th>
        <th style="padding:5px 7px;font-size:10px;background:var(--surf2);border:1px solid var(--bdr);text-align:left">Name</th>
        <th style="padding:5px;font-size:10px;background:var(--surf2);border:1px solid var(--bdr)">${lbl}</th>
        <th style="padding:5px;font-size:10px;background:var(--surf2);border:1px solid var(--bdr)">%</th>
      </tr></thead><tbody>${rows}</tbody>
    </table></div>`;
  document.getElementById('bulkAnal').style.display='block';
  rfBulkAnal(stu,q,cat,idx,hv);
}
function bPrev(inp,cid,hv){
  const v=parseFloat(inp.value);
  const c=document.getElementById(cid);
  if(!c)return;
  c.textContent=(!isNaN(v)&&hv>0)?r2((v/hv)*100)+'%':'';
}
function saveBulk(){
  const inputs=document.querySelectorAll('#bulkTbl input[type="number"]');if(!inputs.length){toast('Load students first');return}
  const cd=getCD();let saved=0;
  inputs.forEach(inp=>{
    const name=inp.dataset.name;const q=parseInt(inp.dataset.q);const cat=inp.dataset.cat;const idx=parseInt(inp.dataset.idx);
    const val=inp.value.trim()===''?null:parseFloat(inp.value);
    if(!cd.grades[q])cd.grades[q]={};
    if(!cd.grades[q][name])cd.grades[q][name]={ww:Array(10).fill(null),pt:Array(10).fill(null),qa:null};
    if(cat==='QA'){
  cd.grades[q][name].qa = val;
}else{
  const key = cat.toLowerCase(); // WW -> ww, PT -> pt
  if(!cd.grades[q][name][key]) cd.grades[q][name][key] = Array(10).fill(null);
  cd.grades[q][name][key][idx] = val;
}
    if(val!==null)saved++;
  });
  save();
  const q=parseInt(document.getElementById('bQ').value);const gf=document.getElementById('bG').value;
  const cat=document.getElementById('bC').value;const idx=parseInt(document.getElementById('bI').value);
  const hv=cat==='WW'?cd.hps[q].ww[idx]:cat==='PT'?cd.hps[q].pt[idx]:cd.hps[q].qa;
  let stu=[];
  if(gf==='all'||gf==='male')stu.push(...cd.students.male.map(n=>({name:n,g:'male'})));
  if(gf==='all'||gf==='female')stu.push(...cd.students.female.map(n=>({name:n,g:'female'})));
  rfBulkAnal(stu,q,cat,idx,hv);
  toast(`✓ Saved — ${saved} scores, ${inputs.length-saved} blank`);
}
function rfBulkAnal(stu,q,cat,idx,hv){
  const cd=getCD();
  const scores=stu.map(s=>{const g=(cd.grades[q]&&cd.grades[q][s.name])||{};return cat==='WW'?(g.ww&&g.ww[idx]!==null?g.ww[idx]:null):cat==='PT'?(g.pt&&g.pt[idx]!==null?g.pt[idx]:null):(g.qa!==null&&g.qa!==undefined?g.qa:null);});
  const wg=scores.filter(v=>v!==null);const miss=scores.filter(v=>v===null).length;const avg=wg.length?r2(wg.reduce((a,b)=>a+b,0)/wg.length):0;
  document.getElementById('bStats').innerHTML=`<div class="sc"><div class="sn2" style="color:var(--blue)">${stu.length}</div><div class="sl2">Total</div></div><div class="sc"><div class="sn2" style="color:var(--green)">${wg.length}</div><div class="sl2">With Grades</div></div><div class="sc"><div class="sn2" style="color:var(--red)">${miss}</div><div class="sl2">Missing</div></div><div class="sc"><div class="sn2" style="color:var(--amber)">${avg}</div><div class="sl2">Average</div></div>`;
  if(miss>0){const mn=stu.filter((_,i)=>scores[i]===null).map(s=>s.name);document.getElementById('bMiss').innerHTML=`<div style="margin-top:9px"><div class="lbl" style="margin-bottom:5px">Missing (${miss})</div><div style="display:flex;flex-wrap:wrap;gap:4px">${mn.map(n=>`<span style="background:var(--red2);color:var(--red);padding:2px 6px;border-radius:99px;font-size:10px">${escH(n)}</span>`).join('')}</div></div>`;}
  else document.getElementById('bMiss').innerHTML='';
}

// ── RB SUMMARY (class + student detail)
function renderRBSummary(){
  const el=document.getElementById('rb-summary');const cd=getCD();const stu=allStu();
  el.innerHTML=`
  <div class="ebar"><span class="elbl">📄 Export:</span><button class="btn br bsm" onclick="pdfSummary()">📄 PDF</button><button class="btn bg bsm" onclick="excelGrades()">📊 Excel</button><div class="sp"></div><button class="btn bo bsm" onclick="window.print()">🖨 Print</button></div>
  <div class="fl" style="margin-bottom:12px">
    <div class="qtabs">
      <button class="qtab active" id="sumTab1" onclick="switchSumTab('class')">Class Summary</button>
      <button class="qtab" id="sumTab2" onclick="switchSumTab('student')">Student Detail</button>
    </div>
  </div>
  <div id="sumClassView"></div>
  <div id="sumStuView" style="display:none">
  <div class="card gs-stud-panel" style="margin-bottom:12px">
    <div class="ch">
      <div class="ct">Student Detail View</div>
      <div class="cs">Select quarter and student to view detailed breakdown</div>
    </div>
    <div class="gs-stud-toolbar">
      <div>
        <div class="lbl">Quarter</div>
        <select class="inp" id="sdQ" onchange="renderStuDetail()">
          <option value="1">Quarter 1</option>
          <option value="2">Quarter 2</option>
          <option value="3">Quarter 3</option>
          <option value="4">Quarter 4</option>
        </select>
      </div>
      <div>
        <div class="lbl">Student</div>
        <select class="inp gs-stud-name" id="sdS" onchange="renderStuDetail()">
          <option value="">-- Select --</option>
          ${cd.students.male.map(n=>`<option value="${escH(n)}">[M] ${escH(n)}</option>`).join('')}
          ${cd.students.female.map(n=>`<option value="${escH(n)}">[F] ${escH(n)}</option>`).join('')}
        </select>
      </div>
      <button class="btn bp bsm" onclick="goToRow()">📍 Go to Row</button>
      <button class="btn br bsm" onclick="pdfStudentDetail()">📄 PDF</button>
    </div>
  </div>
  <div id="stuDetailArea"><div class="ws gs-stud-empty"><h2>Select a student</h2></div></div>
</div>
  `;
  renderSumClass();
}
function switchSumTab(tab){
  document.getElementById('sumTab1').classList.toggle('active',tab==='class');
  document.getElementById('sumTab2').classList.toggle('active',tab==='student');
  document.getElementById('sumClassView').style.display=tab==='class'?'block':'none';
  document.getElementById('sumStuView').style.display=tab==='student'?'block':'none';
}
function renderSumClass(){
  const cd=getCD();const stu=allStu();const el=document.getElementById('sumClassView');if(!el)return;
  if(!stu.length){el.innerHTML='<div class="ws"><h2>No students</h2></div>';return}
  let rows='';let lastG=null;
  stu.forEach(s=>{
    if(s.g!==lastG){rows+=`<tr><td colspan="9" style="background:${s.g==='male'?'#e8f4fd':'#fce8f3'};font-weight:600;font-size:10px;padding:4px 9px;color:${s.g==='male'?'var(--blue)':'var(--pink)'}">${s.g==='male'?'👦 MALE':'👧 FEMALE'}</td></tr>`;lastG=s.g;}
    const num=(s.g==='male'?cd.students.male:cd.students.female).indexOf(s.name)+1;
    const q1=calcQ(s.name,1).quarterly,q2=calcQ(s.name,2).quarterly,q3=calcQ(s.name,3).quarterly,q4=calcQ(s.name,4).quarterly;
    const vq=[q1,q2,q3,q4].filter(v=>v!==null);const final=vq.length?Math.round(vq.reduce((a,b)=>a+b,0)/vq.length):null;const rem=final!==null?(final>=75?'PASSED':'FAILED'):'';
    rows+=`<tr><td style="text-align:center;padding:5px;font-size:10px;color:var(--tx3);border:1px solid var(--bdr)">${num}</td><td style="padding:5px 8px;font-size:11px;font-weight:500;border:1px solid var(--bdr)">${escH(s.name)}</td>${[q1,q2,q3,q4].map(v=>`<td style="text-align:center;font-family:'DM Mono',monospace;font-size:11px;font-weight:600;border:1px solid var(--bdr)">${v||'—'}</td>`).join('')}<td style="text-align:center;font-family:'DM Mono',monospace;font-size:12px;font-weight:700;color:var(--blue);border:1px solid var(--bdr)">${final||'—'}</td><td style="text-align:center;border:1px solid var(--bdr)">${rem?`<span class="${rem==='PASSED'?'bpass':'bfail'}">${rem}</span>`:''}</td></tr>`;
  });
  el.innerHTML=`<div class="card"><div style="font-size:10px;color:var(--tx3);margin-bottom:10px">${cd.school.subject||'—'} · ${APP.ac.grade} ${APP.ac.section} · ${cd.school.teacher||'—'} · SY ${cd.school.year||'—'}</div>
    <div style="overflow-x:auto"><table class="stbl"><thead><tr><th style="width:26px">#</th><th style="text-align:left;min-width:170px">Learner's Name</th><th style="text-align:center;width:58px">Q1</th><th style="text-align:center;width:58px">Q2</th><th style="text-align:center;width:58px">Q3</th><th style="text-align:center;width:58px">Q4</th><th style="text-align:center;width:62px">Final</th><th style="text-align:center;width:78px">Remark</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
function renderStuDetail(){
  const name=document.getElementById('sdS')?.value;
  const q=parseInt(document.getElementById('sdQ')?.value||'1');
  const area=document.getElementById('stuDetailArea');
  if(!area)return;

  if(!name){
    area.innerHTML='<div class="ws gs-stud-empty"><h2>Select a student</h2></div>';
    return;
  }

  const cd=getCD();
  const h=(cd.hps&&cd.hps[q])?cd.hps[q]:{ww:Array(10).fill(null),pt:Array(10).fill(null),qa:null};
  const g=(((cd.grades||{})[q]||{})[name])||{ww:Array(10).fill(null),pt:Array(10).fill(null),qa:null};
  const c=calcQ(name,q);

  const ww=(g.ww||Array(10).fill(null)).slice(0,10);
  const pt=(g.pt||Array(10).fill(null)).slice(0,10);
  const qa=g.qa;

  const q1=calcQ(name,1).quarterly;
  const q2=calcQ(name,2).quarterly;
  const q3=calcQ(name,3).quarterly;
  const q4=calcQ(name,4).quarterly;
  const finals=[q1,q2,q3,q4].filter(v=>v!==null);
  const finalGrade=finals.length?Math.round(finals.reduce((a,b)=>a+b,0)/finals.length):null;
  const finalRemark=finalGrade!==null?(finalGrade>=75?'PASSED':'FAILED'):'';

  const buildMini=(label,hps,val)=>`
    <div class="gs-mini-cell ${isMissingGrade(val)?'missing-grade':''}">
      <div class="gs-mini-k">${label}</div>
      <div class="gs-mini-hps">/${hps??'0'}</div>
      <div class="gs-mini-v">${val??'—'}</div>
    </div>`;

  area.innerHTML=`
    <div class="card gs-stud-panel">
      <div class="gs-stud-head">
        <div>
          <div class="gs-stud-head-title">${escH(name)}</div>
          <div class="gs-stud-head-sub">${APP.ac.grade} ${APP.ac.section} · Quarter ${q}</div>
        </div>
        <div class="gs-stud-badges">
          <div class="gs-stud-badge" style="background:var(--teal2);color:var(--teal)">Q${q}: ${c.quarterly??'—'}</div>
          <div class="gs-stud-badge" style="background:var(--red2);color:var(--red)">Final: ${finalGrade??'—'} <span style="display:block;font-size:.72em;font-family:inherit">${finalRemark||''}</span></div>
        </div>
      </div>

      <div class="gs-stud-grid">
        <div class="gs-stud-stat">
          <div class="gs-stud-stat-k">Q1</div>
          <div class="gs-stud-stat-v" style="color:var(--blue)">${q1??'—'}</div>
        </div>
        <div class="gs-stud-stat">
          <div class="gs-stud-stat-k">Q2</div>
          <div class="gs-stud-stat-v" style="color:var(--red)">${q2??'—'}</div>
        </div>
        <div class="gs-stud-stat">
          <div class="gs-stud-stat-k">Q3</div>
          <div class="gs-stud-stat-v">${q3??'—'}</div>
        </div>
        <div class="gs-stud-stat">
          <div class="gs-stud-stat-k">Q4</div>
          <div class="gs-stud-stat-v">${q4??'—'}</div>
        </div>
        <div class="gs-stud-stat" style="border-color:var(--blue);box-shadow:inset 0 0 0 1px var(--blue)">
          <div class="gs-stud-stat-k">Final</div>
          <div class="gs-stud-stat-v" style="color:var(--blue)">${finalGrade??'—'}</div>
        </div>
      </div>

      <div class="gs-stud-sections">
        <div class="gs-stud-card">
          <div class="gs-stud-card-title" style="color:var(--blue)">Written Works (30%)</div>
          <div class="gs-stud-head-sub" style="margin-bottom:8px">Total: ${c.wwT??'—'} · PS: ${c.wwPS??'—'}% · WS: ${c.wwWS??'—'}</div>
          <div class="gs-mini-grid">
            ${ww.map((v,i)=>h.ww&&h.ww[i]!==null?buildMini(`WW${i+1}`,h.ww[i],v):'').join('')}
          </div>

          <div class="gs-stud-card-title" style="color:var(--amber);margin-top:14px">Performance Tasks (50%)</div>
          <div class="gs-stud-head-sub" style="margin-bottom:8px">Total: ${c.ptT??'—'} · PS: ${c.ptPS??'—'}% · WS: ${c.ptWS??'—'}</div>
          <div class="gs-mini-grid">
            ${pt.map((v,i)=>h.pt&&h.pt[i]!==null?buildMini(`PT${i+1}`,h.pt[i],v):'').join('')}
          </div>

          ${h.qa!==null?`
            <div class="gs-stud-card-title" style="color:var(--teal);margin-top:14px">Quarterly Assessment (20%)</div>
            <div class="gs-stud-head-sub" style="margin-bottom:8px">Score: ${qa??'—'} / ${h.qa} · PS: ${c.qaPS??'—'}% · WS: ${c.qaWS??'—'}</div>
            <div class="gs-mini-grid">
              ${buildMini('Score',h.qa,qa)}
            </div>
          `:''}

          <div class="gs-stud-summary" style="margin-top:14px">
            <div class="gs-mini-cell ${isMissingGrade(c.wwWS)?'missing-grade':''}">
              <div class="gs-mini-k">WW WS</div>
              <div class="gs-mini-v">${c.wwWS??'—'}</div>
            </div>
            <div class="gs-mini-cell ${isMissingGrade(c.ptWS)?'missing-grade':''}">
              <div class="gs-mini-k">PT WS</div>
              <div class="gs-mini-v">${c.ptWS??'—'}</div>
            </div>
            <div class="gs-mini-cell ${isMissingGrade(c.qaWS)?'missing-grade':''}">
              <div class="gs-mini-k">QA WS</div>
              <div class="gs-mini-v">${c.qaWS??'—'}</div>
            </div>
            <div class="gs-mini-cell ${isMissingGrade(c.initial)?'missing-grade':''}">
              <div class="gs-mini-k">Initial</div>
              <div class="gs-mini-v">${c.initial??'—'}</div>
            </div>
            <div class="gs-mini-cell ${isMissingGrade(c.quarterly)?'missing-grade':''}">
              <div class="gs-mini-k">Q${q} Grade</div>
              <div class="gs-mini-v" style="color:var(--teal)">${c.quarterly??'—'}</div>
            </div>
          </div>
        </div>

        <div class="gs-stud-card">
          <div class="gs-stud-card-title">Quarter Summary</div>
          <div class="gs-stud-head-sub">This student detail view now scales better with zoom and keeps the breakdown readable.</div>
        </div>
      </div>
    </div>`;
}
function sdGrade(inp){
  const name=inp.dataset.n;const q=parseInt(inp.dataset.q);
  setGr(name,q,inp.dataset.f,parseInt(inp.dataset.i),inp.value);
  const c=calcQ(name,q);
  const u=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v!==null?v:'—'};
  u('sd_c1',c.wwWS);u('sd_c2',c.ptWS);u('sd_c3',c.qaWS);u('sd_c4',c.initial);
  const g5=document.getElementById('sd_c5');if(g5){g5.textContent=c.quarterly||'—';g5.style.color=c.quarterly?(c.quarterly>=75?'var(--green)':'var(--red)'):'var(--tx3)';}
  const ws=document.getElementById('sd_ww');if(ws)ws.textContent=`Total: ${c.wwT!==null?c.wwT:'—'} · PS: ${c.wwPS!==null?c.wwPS:'—'}% · WS: ${c.wwWS!==null?c.wwWS:'—'}`;
  const pt=document.getElementById('sd_pt');if(pt)pt.textContent=`Total: ${c.ptT!==null?c.ptT:'—'} · PS: ${c.ptPS!==null?c.ptPS:'—'}% · WS: ${c.ptWS!==null?c.ptWS:'—'}`;
  const qa=document.getElementById('sd_qa');if(qa)qa.textContent=`PS: ${c.qaPS!==null?c.qaPS:'—'}% · WS: ${c.qaWS!==null?c.qaWS:'—'}`;
}
function goToRow(){
  const name=document.getElementById('sdS')?.value;const q=parseInt(document.getElementById('sdQ')?.value||'1');
  if(!name){toast('Select a student first');return}
  APP.gq=q;APP.hlStudent=name;showRB('gradeentry');
}

// ── ANALYTICS
function renderAnalytics(){
  const el=document.getElementById('rb-analytics');const stu=allStu();
  el.innerHTML=`
  <div class="ebar"><span class="elbl">📄 Export:</span><button class="btn br bsm" onclick="pdfAnalytics()">📄 PDF</button></div>
  <div class="qtabs" id="aqTabs">
    ${['All Quarters','Q1','Q2','Q3','Q4'].map((l,i)=>`<button class="qtab ${i===APP.aq?'active':''}" onclick="selAQ(${i})">${l}</button>`).join('')}
  </div>
  <div id="analContent"></div>`;
  renderAnalContent();
}
function selAQ(q){APP.aq=q;document.querySelectorAll('#aqTabs .qtab').forEach((t,i)=>t.classList.toggle('active',i===q));renderAnalContent();}
function renderAnalContent(){
  const area=document.getElementById('analContent');if(!area)return;
  const stu=allStu();const cd=getCD();const q=APP.aq;
  if(!stu.length){area.innerHTML='<div class="ws"><h2>No students</h2></div>';return}

  let gradedStudents = [];
  let missingStudents = [];

  if(q===0){
    // All Quarters = require all 4 quarters to exist
    stu.forEach(s=>{
      const quarters=[1,2,3,4].map(qq=>calcQ(s.name,qq).quarterly);
      const complete=quarters.every(v=>v!==null);
      if(complete){
        const avg=Math.round(quarters.reduce((a,b)=>a+b,0)/4);
        gradedStudents.push({name:s.name, grade:avg, gender:s.g});
      }else{
        missingStudents.push({name:s.name, gender:s.g});
      }
    });
  }else{
    stu.forEach(s=>{
      const grade=calcQ(s.name,q).quarterly;
      if(grade!==null){
        gradedStudents.push({name:s.name, grade, gender:s.g});
      }else{
        missingStudents.push({name:s.name, gender:s.g});
      }
    });
  }

  const grades=gradedStudents.map(x=>x.grade);

  if(!grades.length){
    area.innerHTML=`
      <div class="ws">
        <h2>No grades entered yet</h2>
        ${missingStudents.length ? `
          <div style="margin-top:12px;text-align:left">
            <div style="font-size:11px;font-weight:600;color:var(--red);margin-bottom:6px">Students with Missing Grades</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              ${missingStudents.map(s=>`<span style="background:var(--red2);color:var(--red);padding:3px 7px;border-radius:99px;font-size:10px">${escH(s.name)}</span>`).join('')}
            </div>
          </div>
        `:''}
      </div>`;
    return;
  }

  const avg=r2(grades.reduce((a,b)=>a+b,0)/grades.length);
  const hi=Math.max(...grades);
  const lo=Math.min(...grades);
  const pass=grades.filter(g=>g>=75).length;
  const fail=grades.filter(g=>g<75).length;

  const bands=[
  {l:'96–100',mn:96,mx:100,c:'#0d9488'},
  {l:'91–95',mn:91,mx:95,c:'#0284c7'},
  {l:'86–90',mn:86,mx:90,c:'#7c3aed'},
  {l:'81–85',mn:81,mx:85,c:'#d97706'},
  {l:'76–80',mn:76,mx:80,c:'#f59e0b'},
  {l:'75',mn:75,mx:75,c:'#84cc16'},
  {l:'Below 75',mn:0,mx:74,c:'#dc2626'}
].map(b=>{
  const students=gradedStudents.filter(x=>x.grade>=b.mn&&x.grade<=b.mx);
  return {...b,cnt:students.length,students};
});

  const mx=Math.max(...bands.map(b=>b.cnt),1);
  const miss=missingStudents.length;

  area.innerHTML=`
    <div style="font-size:10px;color:var(--tx3);margin-bottom:10px">${cd.school.subject||'—'} · ${APP.ac.grade} ${APP.ac.section} · ${q===0?'All Quarters (Final)':'Quarter '+q}</div>
    <div class="ag4">
      <div class="sc"><div class="sn2" style="color:var(--blue)">${avg}</div><div class="sl2">Class Average</div></div>
      <div class="sc"><div class="sn2" style="color:var(--green)">${hi}</div><div class="sl2">Highest</div></div>
      <div class="sc"><div class="sn2" style="color:var(--red)">${lo}</div><div class="sl2">Lowest</div></div>
      <div class="sc"><div class="sn2" style="color:var(--amber)">${grades.length}/${stu.length}</div><div class="sl2">Graded</div></div>
    </div>

    <div class="g2">
      <div class="card">
        <div class="ch"><div class="ct">Performance Bands</div></div>
        ${bands.map(b=>`<div class="brow"><div class="bla">${b.l}</div><div class="bbw"><div class="bb" style="width:${Math.round((b.cnt/mx)*100)}%;background:${b.c}"></div></div><div class="bcnt">${b.cnt}</div></div>`).join('')}
        ${miss>0?`<div class="brow"><div class="bla" style="color:var(--tx3)">Missing</div><div class="bbw"></div><div class="bcnt" style="color:var(--tx3)">${miss}</div></div>`:''}
      </div>

      <div class="card">
        <div class="ch"><div class="ct">Pass / Fail</div></div>
        ${[{l:'Passing (≥75)',v:pass,c:'var(--green)'},{l:'Below 75',v:fail,c:'var(--red)'}].map(r=>`
        <div style="margin-bottom:13px">
          <div class="fl" style="margin-bottom:5px;justify-content:space-between"><span style="font-size:11px;color:${r.c};font-weight:500">${r.l}</span><span style="font-size:11px;font-family:'DM Mono',monospace;font-weight:600">${r.v}/${grades.length}</span></div>
          <div style="background:var(--bg);border-radius:99px;height:7px;overflow:hidden"><div style="height:100%;border-radius:99px;background:${r.c};width:${grades.length?Math.round((r.v/grades.length)*100):0}%"></div></div>
          <div style="font-size:10px;color:var(--tx3);margin-top:3px">${grades.length?Math.round((r.v/grades.length)*100):0}%</div>
        </div>`).join('')}
        <div class="g2" style="margin-top:8px">
          <div style="text-align:center;padding:10px;background:var(--blue2);border-radius:var(--rs)"><div style="font-size:10px;color:var(--blue);margin-bottom:2px">Top (90+)</div><div style="font-size:19px;font-weight:700;font-family:'DM Mono',monospace;color:var(--blue)">${grades.filter(g=>g>=90).length}</div></div>
          <div style="text-align:center;padding:10px;background:var(--red2);border-radius:var(--rs)"><div style="font-size:10px;color:var(--red);margin-bottom:2px">Missing</div><div style="font-size:19px;font-weight:700;font-family:'DM Mono',monospace;color:var(--red)">${miss}</div></div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
  <div class="ch"><div class="ct">Students per Performance Band</div><div class="cs">${gradedStudents.length} graded student(s)</div></div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px">
    ${bands.map(b=>`
      <div style="border:1px solid var(--bdr);border-radius:12px;padding:12px;background:var(--panel)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:12px;font-weight:700;color:${b.c}">${b.l}</div>
          <div style="font-size:11px;color:var(--tx3)">${b.cnt} student(s)</div>
        </div>
        ${
          b.students.length
          ? `<div style="display:flex;flex-wrap:wrap;gap:6px">
              ${b.students.map(st=>`
                <span style="display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border-radius:999px;background:var(--bg);border:1px solid var(--bdr);font-size:11px">
                  <span>${escH(st.name)}</span>
                  <strong style="color:${b.c}">${st.grade}</strong>
                </span>
              `).join('')}
            </div>`
          : `<div style="font-size:11px;color:var(--tx3)">No students in this range</div>`
        }
      </div>
    `).join('')}
  </div>
</div>

${miss>0?`
<div class="card" style="margin-top:14px">
  <div class="ch"><div class="ct">Students with Missing Grades</div><div class="cs">${miss} student(s)</div></div>
  <div style="display:flex;flex-wrap:wrap;gap:6px">
    ${missingStudents.map(s=>`
      <button class="btn bo bsm" onclick="goToMissingFromAnalytics('${esc(s.name)}', ${q})">
        ${escH(s.name)}
      </button>
    `).join('')}
  </div>
</div>`:''}
  `;
}

function goToMissingFromAnalytics(name,q){
  APP.gq = q===0 ? 1 : q;
  APP.hlStudent = name;
  showRB('gradeentry');
  showPage('recordbook');
}

// ══════════════════════════════════════════════
// LOA SUMMARY REPORTS MODULE
// ══════════════════════════════════════════════
// ══════════════════════════════════════════════
// INSTRUCTIONS MODULE
// ══════════════════════════════════════════════
function renderInstructions(){
  const el=document.getElementById('rb-instructions');
  if(!el)return;
  el.innerHTML=`
  <!-- Hero Banner -->
  <div class="inst-hero">
    <div class="inst-hero-title">📖 Welcome to Mendtrix E-Class Record System</div>
    <div class="inst-hero-sub">This guide will help you understand how to use the system step by step. Read this before you start entering grades.</div>
  </div>

  <!-- Quick Overview Cards -->
  <div class="inst-section-title">🗺️ What can this system do?</div>
  <div class="inst-grid">
    <div class="inst-card">
      <div class="inst-card-icon">📝</div>
      <div class="inst-card-title">Grade Entry</div>
      <div class="inst-card-desc">Enter scores for Written Works (WW1–WW10), Performance Tasks (PT1–PT10), and Quarterly Assessment for each student. The system automatically computes the Percentage Score, Weighted Score, Initial Grade, and Quarterly Grade based on DepEd K-12 formula.</div>
    </div>
    <div class="inst-card">
      <div class="inst-card-icon">⚡</div>
      <div class="inst-card-title">Bulk Entry</div>
      <div class="inst-card-desc">Enter scores for one specific item (e.g. WW3) for all students at the same time in a single column. This is much faster than entering one student at a time when you are scoring a specific activity or test.</div>
    </div>
    <div class="inst-card">
      <div class="inst-card-icon">📊</div>
      <div class="inst-card-title">Summary & Reports</div>
      <div class="inst-card-desc">View the final grades for all students across all 4 quarters, export to Excel in official DepEd E-Class Record format, export to PDF, and send a JSON file to your Advisory Teacher for consolidated grading.</div>
    </div>
    <div class="inst-card">
      <div class="inst-card-icon">📅</div>
      <div class="inst-card-title">Attendance</div>
      <div class="inst-card-desc">Record daily attendance for your students. Mark each student as Present (P), Absent (A), or Late (L). View a monthly summary, export to Excel or PDF, and track total absences per student.</div>
    </div>
    <div class="inst-card">
      <div class="inst-card-icon">📋</div>
      <div class="inst-card-title">LOA Reports</div>
      <div class="inst-card-desc">Level of Achievement reports automatically computed from your grade entries. Shows proficiency bands for Written Works, Performance Tasks, Quarterly Assessment, and final Quarterly Grades — ready for submission.</div>
    </div>
    <div class="inst-card">
      <div class="inst-card-icon">🏫</div>
      <div class="inst-card-title">Advisory Teacher Mode</div>
      <div class="inst-card-desc">Advisory Teachers can import JSON files from multiple subject teachers and generate a Consolidated Grades report showing General Average and Promotion Status for every student across all subjects.</div>
    </div>
  </div>

  <!-- Step by Step: First Time Setup -->
  <div class="card">
    <div class="ch"><div class="ct">🚀 First Time Setup — Do This Before Entering Grades</div></div>
    <div class="inst-step">
      <div class="inst-step-num">1</div>
      <div class="inst-step-body">
        <div class="inst-step-title">Select your Grade Level and Section</div>
        <div class="inst-step-desc">At the top of the screen, you will see a bar that says "Active Class". Click the <strong>Grade Level</strong> dropdown and select your grade (e.g. Grade 10). Then type your <strong>Section</strong> name (e.g. PEARL). Click the <strong>Load Class</strong> button. The system will create a new empty class for you.</div>
      </div>
    </div>
    <div class="inst-step">
      <div class="inst-step-num">2</div>
      <div class="inst-step-body">
        <div class="inst-step-title">Fill in School Information</div>
        <div class="inst-step-desc">Go to the <strong>Setup</strong> tab. Fill in your School Name, School ID, Region, Division, Teacher Name, Subject, and School Year. This information will appear on all your printed reports and Excel exports.</div>
      </div>
    </div>
    <div class="inst-step">
      <div class="inst-step-num">3</div>
      <div class="inst-step-body">
        <div class="inst-step-title">Set the Highest Possible Score (HPS) for each quarter</div>
        <div class="inst-step-desc">Still in Setup, scroll down to the <strong>HPS section</strong>. For each quarter, enter the maximum possible score for each Written Work item (WW1, WW2, etc.), each Performance Task (PT1, PT2, etc.), and the Quarterly Assessment. Leave a box blank if that item is not used for that quarter. This is very important — grades cannot be computed correctly without HPS values.</div>
      </div>
    </div>
    <div class="inst-step">
      <div class="inst-step-num">4</div>
      <div class="inst-step-body">
        <div class="inst-step-title">Add your students</div>
        <div class="inst-step-desc">Scroll to the bottom of Setup. Add all <strong>Male students</strong> in the left column and all <strong>Female students</strong> in the right column. Type the full name and press <strong>Enter</strong> or click the <strong>+ Add</strong> button. Names are automatically converted to uppercase.</div>
      </div>
    </div>
    <div class="inst-step">
      <div class="inst-step-num">5</div>
      <div class="inst-step-body">
        <div class="inst-step-title">Save your work</div>
        <div class="inst-step-desc">Click the <strong>Save Setup</strong> button, then click <strong>💾 Save &amp; Export File</strong>. This downloads a <code>.json</code> file to your computer. Keep this file safe — it is your backup. You can load it again anytime using the <strong>📂 Load File</strong> button.</div>
      </div>
    </div>
    <div class="inst-tip">✅ You only need to do the Setup once per subject per school year. After that, just load your saved file at the start of each session.</div>
  </div>

  <!-- Step by Step: Entering Grades -->
  <div class="card">
    <div class="ch"><div class="ct">✏️ How to Enter Grades</div></div>
    <div class="inst-step">
      <div class="inst-step-num">1</div>
      <div class="inst-step-body">
        <div class="inst-step-title">Go to the Grade Entry tab</div>
        <div class="inst-step-desc">Click the <strong>📝 Grade Entry</strong> tab at the top of the Record Book. You will see the full class list with columns for all Written Works, Performance Tasks, and Quarterly Assessment scores.</div>
      </div>
    </div>
    <div class="inst-step">
      <div class="inst-step-num">2</div>
      <div class="inst-step-body">
        <div class="inst-step-title">Select the correct Quarter</div>
        <div class="inst-step-desc">Click the <strong>Quarter 1</strong>, <strong>Quarter 2</strong>, <strong>Quarter 3</strong>, or <strong>Quarter 4</strong> button to switch between quarters. Each quarter has its own separate set of scores.</div>
      </div>
    </div>
    <div class="inst-step">
      <div class="inst-step-num">3</div>
      <div class="inst-step-body">
        <div class="inst-step-title">Type scores directly into the table</div>
        <div class="inst-step-desc">Click any score box in the table and type the student's score. The columns on the right (Total, PS, WS, Initial Grade, Quarterly Grade) will automatically update as you type. You do not need to press Save — the system saves automatically after every entry.</div>
      </div>
    </div>
    <div class="inst-step">
      <div class="inst-step-num">4</div>
      <div class="inst-step-body">
        <div class="inst-step-title">Leave blank if no score yet</div>
        <div class="inst-step-desc">If a student did not take an activity yet, just leave the box empty. Do not type 0 unless the student's actual score is zero. Blank means "not yet graded" and will be shown as missing in the analytics.</div>
      </div>
    </div>
    <div class="inst-warn">⚠️ Important: The yellow row at the top of the table shows the HPS (Highest Possible Score) for each item. Make sure you set these correctly in Setup first, or the computed grades will be wrong.</div>
  </div>

  <!-- Bulk Entry Guide -->
  <div class="card">
    <div class="ch"><div class="ct">⚡ How to Use Bulk Entry (Fast Way)</div></div>
    <div class="inst-step">
      <div class="inst-step-num">1</div>
      <div class="inst-step-body">
        <div class="inst-step-title">Select the filters</div>
        <div class="inst-step-desc">Go to the <strong>⚡ Bulk Entry</strong> tab. Choose the <strong>Quarter</strong>, <strong>Gender</strong> (All, Male, or Female), <strong>Category</strong> (Written Works, Performance Tasks, or Quarterly Assessment), and the specific <strong>Item</strong> number (e.g. WW3).</div>
      </div>
    </div>
    <div class="inst-step">
      <div class="inst-step-num">2</div>
      <div class="inst-step-body">
        <div class="inst-step-title">Click Load Students</div>
        <div class="inst-step-desc">Click the <strong>Load</strong> button. All students matching your filter will appear in a simple two-column list: student name and a score box.</div>
      </div>
    </div>
    <div class="inst-step">
      <div class="inst-step-num">3</div>
      <div class="inst-step-body">
        <div class="inst-step-title">Enter all scores then click Save</div>
        <div class="inst-step-desc">Type each student's score in the box next to their name. You can skip students by leaving the box blank. When done, click <strong>Save Grades</strong>. You will see a message showing how many scores were saved and how many were left blank.</div>
      </div>
    </div>
    <div class="inst-tip">💡 Bulk Entry is the fastest way to encode grades. Use it after scoring a set of papers — you can enter an entire class's scores for one activity in under 2 minutes.</div>
  </div>

  <!-- Saving Data -->
  <div class="card">
    <div class="ch"><div class="ct">💾 How to Save and Protect Your Data</div></div>
    <div class="inst-step">
      <div class="inst-step-num">1</div>
      <div class="inst-step-body">
        <div class="inst-step-title">The system auto-saves as you type</div>
        <div class="inst-step-desc">Every grade you enter is automatically saved inside the browser on your current computer. This means if you close the tab and reopen the same website or file on the same computer and same browser, your data will still be there.</div>
      </div>
    </div>
    <div class="inst-step">
      <div class="inst-step-num">2</div>
      <div class="inst-step-body">
        <div class="inst-step-title">Every 15 minutes — download your auto-save file</div>
        <div class="inst-step-desc">The system automatically downloads a file called <code>AutoSave_...</code> to your Downloads folder every 15 minutes. Keep this file. If something goes wrong, you can load it using <strong>📂 Load File</strong> in Setup.</div>
      </div>
    </div>
    <div class="inst-step">
      <div class="inst-step-num">3</div>
      <div class="inst-step-body">
        <div class="inst-step-title">At the end of every session — Export your file</div>
        <div class="inst-step-desc">Before closing the browser, go to <strong>Setup</strong> and click <strong>💾 Save &amp; Export File</strong>. Save this <code>.json</code> file to a folder on your computer, USB drive, or Google Drive. This is your master backup file.</div>
      </div>
    </div>
    <div class="inst-step">
      <div class="inst-step-num">4</div>
      <div class="inst-step-body">
        <div class="inst-step-title">At the start of every session — Load your file</div>
        <div class="inst-step-desc">When you open the system again, click <strong>📂 Load File</strong> in Setup and select your saved <code>.json</code> file. All your students, HPS settings, and grades will be fully restored exactly as you left them.</div>
      </div>
    </div>
    <div class="inst-warn">⚠️ Never clear your browser history while working. This will delete all auto-saved data. Always export your <code>.json</code> file first before clearing history or using a different computer.</div>
  </div>

  <!-- Exporting -->
  <div class="card">
    <div class="ch"><div class="ct">📤 Exporting Your Reports</div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
      <div style="padding:16px;background:var(--surf2);border-radius:var(--r);border:1px solid var(--bdr)">
        <div style="font-size:20px;margin-bottom:8px">📊</div>
        <div style="font-size:15px;font-weight:600;margin-bottom:6px">Excel Export</div>
        <div style="font-size:13px;color:var(--tx2);line-height:1.7">Go to <strong>Grade Summary</strong> and click <strong>📊 Excel (DepEd Format)</strong>. Downloads an <code>.xlsx</code> file with all quarter sheets in the official DepEd E-Class Record format including Input Data, Q1–Q4 sheets, Summary, and LOA Summary.</div>
      </div>
      <div style="padding:16px;background:var(--surf2);border-radius:var(--r);border:1px solid var(--bdr)">
        <div style="font-size:20px;margin-bottom:8px">📄</div>
        <div style="font-size:15px;font-weight:600;margin-bottom:6px">PDF Export</div>
        <div style="font-size:13px;color:var(--tx2);line-height:1.7">Each section has a <strong>📄 PDF</strong> button. This opens a print preview window. Click <strong>Print</strong> in your browser and select <strong>Save as PDF</strong> as the printer. You can also click <strong>🖨 Print</strong> to send directly to a printer.</div>
      </div>
      <div style="padding:16px;background:var(--surf2);border-radius:var(--r);border:1px solid var(--bdr)">
        <div style="font-size:20px;margin-bottom:8px">📦</div>
        <div style="font-size:15px;font-weight:600;margin-bottom:6px">JSON for Advisory</div>
        <div style="font-size:13px;color:var(--tx2);line-height:1.7">Go to <strong>Grade Summary</strong> and click <strong>📦 JSON for Advisory</strong>. Send this file to your Advisory Teacher. They will upload it into their system to generate the Consolidated Grades report.</div>
      </div>
    </div>
  </div>

  <!-- FAQ -->
  <div class="inst-section-title">❓ Frequently Asked Questions</div>

  <div class="inst-faq">
    <div class="inst-faq-q" onclick="toggleFAQ(this)">My grades disappeared when I opened the system again. What happened? <span>▼</span></div>
    <div class="inst-faq-a">This usually happens when: (1) you opened the system on a different computer or different browser, (2) your browser history/cache was cleared, or (3) you used Incognito/Private mode. The solution is to always export your <code>.json</code> file before closing the system, then load it again at the start of the next session using <strong>📂 Load File</strong> in Setup.</div>
  </div>
  <div class="inst-faq">
    <div class="inst-faq-q" onclick="toggleFAQ(this)">The Quarterly Grade is not showing up. Why? <span>▼</span></div>
    <div class="inst-faq-a">The Quarterly Grade only computes when the Highest Possible Score (HPS) has been set for that quarter. Go to <strong>Setup → HPS section</strong> and make sure you have entered the HPS values for the current quarter. After setting the HPS, go back to Grade Entry and the grades will appear automatically.</div>
  </div>
  <div class="inst-faq">
    <div class="inst-faq-q" onclick="toggleFAQ(this)">Can I use this on my phone or tablet? <span>▼</span></div>
    <div class="inst-faq-a">Yes, the system works on phones and tablets, but the Grade Entry table has many columns and works best on a computer or laptop. For entering grades, we recommend using a desktop or laptop browser. Attendance recording and viewing summaries work well on a tablet.</div>
  </div>
  <div class="inst-faq">
    <div class="inst-faq-q" onclick="toggleFAQ(this)">How do I add a student who enrolled after the school year started? <span>▼</span></div>
    <div class="inst-faq-a">Go to <strong>Setup → Student List</strong> and type the new student's name in the correct gender column, then click <strong>+ Add</strong>. The student will immediately appear in Grade Entry and Bulk Entry. Remember to click <strong>Save Setup</strong> and <strong>💾 Save &amp; Export File</strong> after adding them.</div>
  </div>
  <div class="inst-faq">
    <div class="inst-faq-q" onclick="toggleFAQ(this)">I accidentally entered the wrong score. How do I fix it? <span>▼</span></div>
    <div class="inst-faq-a">Just click on the score box that has the wrong value and type the correct score. The system will immediately update all the computed values. You can also clear a score by deleting everything in the box — this will remove the score and leave it as blank (not graded).</div>
  </div>
  <div class="inst-faq">
    <div class="inst-faq-q" onclick="toggleFAQ(this)">How do I handle a student who was absent for a quarterly assessment? <span>▼</span></div>
    <div class="inst-faq-a">Leave the QA score box empty for that student. The system will compute the Quarterly Grade based only on the components that have scores. If the student later takes a make-up test, just enter the score at that time.</div>
  </div>
  <div class="inst-faq">
    <div class="inst-faq-q" onclick="toggleFAQ(this)">Can multiple teachers share one account or class record? <span>▼</span></div>
    <div class="inst-faq-a">Not at the same time. Each teacher has their own copy of the system with their own data. If two teachers need to work on the same class record, they should agree on who is the primary encoder and share the <code>.json</code> file between them. The last person to export and save the file has the most recent data.</div>
  </div>
  <div class="inst-faq">
    <div class="inst-faq-q" onclick="toggleFAQ(this)">What is the difference between Subject Teacher and Advisory Teacher mode? <span>▼</span></div>
    <div class="inst-faq-a"><strong>Subject Teacher mode</strong> is for teachers who handle one specific subject. You enter grades for your subject only.<br><br><strong>Advisory Teacher mode</strong> is for the class adviser. You can do everything a Subject Teacher can, plus you get the <strong>Consolidated Grades</strong> module where you upload the JSON files from all subject teachers and generate the General Average and Promotion Status for every student. You can switch between modes anytime using the <strong>⇄ Switch Role</strong> button at the top right.</div>
  </div>

  <div class="inst-tip" style="margin-top:20px">📞 Need help? Contact Mendtrix IT Services for technical support and training.</div>
  `;
}

function toggleFAQ(el){
  const ans=el.nextElementSibling;
  const isOpen=ans.classList.contains('open');
  // Close all
  document.querySelectorAll('.inst-faq-a').forEach(a=>a.classList.remove('open'));
  document.querySelectorAll('.inst-faq-q span').forEach(s=>s.textContent='▼');
  // Open this one if it was closed
  if(!isOpen){ans.classList.add('open');el.querySelector('span').textContent='▲';}
}

function renderLOA(){
  const el=document.getElementById('rb-loa');const cd=getCD();
  el.innerHTML=`
  <div class="ebar"><span class="elbl">📄 Export:</span>
    <button class="btn br bsm" onclick="pdfLOA()">📄 LOA PDF</button>
    <button class="btn bg bsm" onclick="excelLOA()">📊 LOA Excel</button>
    <div class="sp"></div>
    <span style="font-size:10px;color:var(--tx3)">Level of Achievement (LOA) summary auto-computes from your grade entries</span>
  </div>
  <!-- Diagnostic Test Config -->
  <div class="card" style="margin-bottom:14px">
    <div class="ch"><div class="ct">📋 Diagnostic Test Configuration</div><div class="cs">Enter your diagnostic test data for LOA reporting</div></div>
    <div class="g3">
      <div><div class="lbl">Number of Items</div><input class="inp" type="number" min="0" id="diag_items" value="${cd.diag?.items||''}" placeholder="e.g. 50" onchange="saveDiag()"></div>
      <div><div class="lbl">Highest Score Obtained</div><input class="inp" type="number" min="0" id="diag_hso" value="${cd.diag?.hso||''}" placeholder="e.g. 48" onchange="saveDiag()"></div>
      <div><div class="lbl">Lowest Score Obtained</div><input class="inp" type="number" min="0" id="diag_lso" value="${cd.diag?.lso||''}" placeholder="e.g. 12" onchange="saveDiag()"></div>
    </div>
  </div>
  <!-- LOA Quarter selector -->
  <div class="fl" style="margin-bottom:14px">
    <div class="qtabs" id="loaQTabs">
      ${[1,2,3,4].map(i=>`<button class="qtab ${i===APP.gq?'active':''}" onclick="selLOAQ(${i})">Quarter ${i}</button>`).join('')}
    </div>
  </div>
  <div id="loaContent"></div>`;
  renderLOAContent();
}
function saveDiag(){
  const cd=getCD();
  cd.diag={items:parseFloat(document.getElementById('diag_items').value)||0,hso:parseFloat(document.getElementById('diag_hso').value)||0,lso:parseFloat(document.getElementById('diag_lso').value)||0};
  save();renderLOAContent();
}
function selLOAQ(q){APP.gq=q;document.querySelectorAll('#loaQTabs .qtab').forEach((t,i)=>t.classList.toggle('active',i+1===q));renderLOAContent();}
function renderLOAContent(){
  const area=document.getElementById('loaContent');if(!area)return;
  const cd=getCD();const stu=allStu();const q=APP.gq;const h=cd.hps[q];
  if(!stu.length){area.innerHTML='<div class="ws"><h2>No students</h2></div>';return}
  const section=`${APP.ac.grade} – ${APP.ac.section}`;
  // Compute per-student data for this quarter
  const stuData=stu.map(s=>{const c=calcQ(s.name,q);return{name:s.name,g:s.g,c};});
  // Proficiency bands for written works, diagnostic, QA
  function profBands(scores,total){
    // scores are PS (0-100)
    const r={np:0,lp:0,np2:0,p:0,hp:0,miss:0};
    scores.forEach(v=>{if(v===null)r.miss++;else if(v>=90)r.hp++;else if(v>=75)r.p++;else if(v>=50)r.np2++;else if(v>=25)r.lp++;else r.np++;});
    return r;
  }
  // Descriptor bands (PT, QG) - DepEd descriptor scale
  function descBands(scores){
    const r={dnm:0,fs:0,s:0,vs:0,o1:0,o2:0,o3:0,miss:0};
    scores.forEach(v=>{if(v===null)r.miss++;else if(v>=98)r.o3++;else if(v>=95)r.o2++;else if(v>=90)r.o1++;else if(v>=85)r.vs++;else if(v>=80)r.s++;else if(v>=75)r.fs++;else r.dnm++;});
    return r;
  }
  // WW PS scores
  const wwPS=stuData.map(s=>s.c.wwPS);
  const ptPS=stuData.map(s=>s.c.ptPS);
  const qaPS=stuData.map(s=>s.c.qaPS);
  const qGrades=stuData.map(s=>s.c.quarterly);
  const wwHT=h.ww.reduce((a,v)=>a+(v||0),0);
  const ptHT=h.pt.reduce((a,v)=>a+(v||0),0);
  const wwMean=wwPS.filter(v=>v!==null).length?r2(wwPS.filter(v=>v!==null).reduce((a,b)=>a+b,0)/wwPS.filter(v=>v!==null).length):0;
  const ptMean=ptPS.filter(v=>v!==null).length?r2(ptPS.filter(v=>v!==null).reduce((a,b)=>a+b,0)/ptPS.filter(v=>v!==null).length):0;
  const qaMean=qaPS.filter(v=>v!==null).length?r2(qaPS.filter(v=>v!==null).reduce((a,b)=>a+b,0)/qaPS.filter(v=>v!==null).length):0;
  const wwBands=profBands(wwPS);const ptBands=descBands(ptPS);const qaBands=profBands(qaPS);const qgBands=descBands(qGrades);
  const diagItems=cd.diag?.items||0;const diagHSO=cd.diag?.hso||0;const diagLSO=cd.diag?.lso||0;
  const diagMPS=diagItems?r2((diagHSO/diagItems)*100):0;
  function pct(n,total){return total?r2((n/total)*100):0}
  const N=stu.length;

  area.innerHTML=`
  <div style="font-size:11px;font-weight:600;color:var(--tx2);margin-bottom:14px;padding:8px 12px;background:var(--surf2);border-radius:var(--r);border:1px solid var(--bdr)">
    📊 ${cd.school.subject||'Subject'} · ${section} · Quarter ${q} · ${cd.school.teacher||'Teacher'} · SY ${cd.school.year||'—'}
  </div>

  <!-- Section 1: Diagnostic Test -->
  <div class="card" style="margin-bottom:14px">
    <div class="loa-group-hdr loa-dt">📝 Section 1 — Diagnostic Test Results</div>
    <div class="g2" style="margin-bottom:12px">
      <div>
        <div class="loa-summary-card">
          ${[['No. of Learners',N],['No. of Test Items',diagItems],['Highest Score Obtained',diagHSO],['Lowest Score Obtained',diagLSO],['Mean Score',diagItems?r2(diagHSO/2):'—'],['MPS (%)',diagMPS+'%']].map(([l,v])=>`<div class="loa-metric"><span class="loa-metric-label">${l}</span><span class="loa-metric-val">${v}</span></div>`).join('')}
        </div>
      </div>
      <div>
        <table class="loa-full-table" style="max-width:100%">
          <thead>
            <tr>
              <th rowspan="2" class="sec-col">Section</th>
              <th rowspan="2">Learners</th>
              <th colspan="2" class="loa-np">Unsatisfactory (0–24%)</th>
              <th colspan="2" class="loa-lp">Needs Improvement (25–49%)</th>
              <th colspan="2" class="loa-nep">Meets Expectations (50–74%)</th>
              <th colspan="2" class="loa-p">Exceeds Expectations (75–89%)</th>
              <th colspan="2" class="loa-hp">Exceptional (90–100%)</th>
            </tr>
            <tr>
              ${['No.','%','No.','%','No.','%','No.','%','No.','%'].map(h=>`<th>${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="sec-col">${section}</td>
              <td>${N}</td>
              <td>${wwBands.np}</td><td>${pct(wwBands.np,N)}%</td>
              <td>${wwBands.lp}</td><td>${pct(wwBands.lp,N)}%</td>
              <td>${wwBands.np2}</td><td>${pct(wwBands.np2,N)}%</td>
              <td>${wwBands.p}</td><td>${pct(wwBands.p,N)}%</td>
              <td>${wwBands.hp}</td><td>${pct(wwBands.hp,N)}%</td>
            </tr>
            <tr class="total-row"><td class="sec-col">Total</td><td>${N}</td><td>${wwBands.np}</td><td>${pct(wwBands.np,N)}%</td><td>${wwBands.lp}</td><td>${pct(wwBands.lp,N)}%</td><td>${wwBands.np2}</td><td>${pct(wwBands.np2,N)}%</td><td>${wwBands.p}</td><td>${pct(wwBands.p,N)}%</td><td>${wwBands.hp}</td><td>${pct(wwBands.hp,N)}%</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Section 2: Written Works -->
  <div class="card" style="margin-bottom:14px">
    <div class="loa-group-hdr" style="background:#fef3c7;color:#92400e">✏️ Section 2 — Written Works Achievement (30%)</div>
    <div class="g2" style="margin-bottom:12px">
      <div>
        <div class="loa-summary-card">
          ${[['No. of Learners',N],['Total HPS (All Items)',wwHT||'Not set'],['Highest Score Obtained',wwPS.filter(v=>v!==null).length?Math.max(...wwPS.filter(v=>v!==null)).toFixed(2)+'%':'—'],['Lowest Score Obtained',wwPS.filter(v=>v!==null).length?Math.min(...wwPS.filter(v=>v!==null)).toFixed(2)+'%':'—'],['Mean Percentage Score',wwMean+'%'],['Students with Grades',wwPS.filter(v=>v!==null).length],['Missing Grades',wwBands.miss]].map(([l,v])=>`<div class="loa-metric"><span class="loa-metric-label">${l}</span><span class="loa-metric-val">${v}</span></div>`).join('')}
        </div>
      </div>
      <div>
        <table class="loa-full-table">
          <thead>
            <tr>
              <th rowspan="2" class="sec-col">Section</th><th rowspan="2">Learners</th><th rowspan="2">HPS</th>
              <th colspan="2" class="loa-np">Unsatisfactory (0–24%)</th>
              <th colspan="2" class="loa-lp">Needs Improvement (25–49%)</th>
              <th colspan="2" class="loa-nep">Meets Expectations (50–74%)</th>
              <th colspan="2" class="loa-p">Exceeds Expectations (75–89%)</th>
              <th colspan="2" class="loa-hp">Exceptional (90–100%)</th>
            </tr>
            <tr>${['No.','%','No.','%','No.','%','No.','%','No.','%'].map(h=>`<th>${h}</th>`).join('')}</tr>
          </thead>
          <tbody>
            <tr>
              <td class="sec-col">${section}</td><td>${N}</td><td>${wwHT||'—'}</td>
              <td>${wwBands.np}</td><td>${pct(wwBands.np,N)}%</td>
              <td>${wwBands.lp}</td><td>${pct(wwBands.lp,N)}%</td>
              <td>${wwBands.np2}</td><td>${pct(wwBands.np2,N)}%</td>
              <td>${wwBands.p}</td><td>${pct(wwBands.p,N)}%</td>
              <td>${wwBands.hp}</td><td>${pct(wwBands.hp,N)}%</td>
            </tr>
            <tr class="total-row"><td class="sec-col">Total</td><td>${N}</td><td>${wwHT||'—'}</td><td>${wwBands.np}</td><td>${pct(wwBands.np,N)}%</td><td>${wwBands.lp}</td><td>${pct(wwBands.lp,N)}%</td><td>${wwBands.np2}</td><td>${pct(wwBands.np2,N)}%</td><td>${wwBands.p}</td><td>${pct(wwBands.p,N)}%</td><td>${wwBands.hp}</td><td>${pct(wwBands.hp,N)}%</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Section 3: Performance Tasks -->
  <div class="card" style="margin-bottom:14px">
    <div class="loa-group-hdr loa-pt">🎯 Section 3 — Performance Tasks Achievement (50%) — Descriptor Bands</div>
    <div class="g2" style="margin-bottom:12px">
      <div>
        <div class="loa-summary-card">
          ${[['No. of Learners',N],['Total PT HPS',ptHT||'Not set'],['Mean PT Percentage',ptMean+'%'],['Students with Grades',ptPS.filter(v=>v!==null).length],['Did Not Meet Expectations',ptBands.dnm+' ('+pct(ptBands.dnm,N)+'%)'],['Outstanding (All bands)',ptBands.o1+ptBands.o2+ptBands.o3+' ('+pct(ptBands.o1+ptBands.o2+ptBands.o3,N)+'%)']].map(([l,v])=>`<div class="loa-metric"><span class="loa-metric-label">${l}</span><span class="loa-metric-val">${v}</span></div>`).join('')}
        </div>
      </div>
      <div>
        <table class="loa-full-table">
          <thead>
            <tr>
              <th rowspan="2" class="sec-col">Section</th><th rowspan="2">Learners</th>
              <th colspan="2" style="background:#fee2e2;color:#991b1b">Did Not Meet (≤74%)</th>
              <th colspan="2" style="background:#fef9c3;color:#713f12">Fairly Satisfactory (75–79%)</th>
              <th colspan="2" style="background:#dcfce7;color:#14532d">Satisfactory (80–84%)</th>
              <th colspan="2" style="background:#d1fae5;color:#065f46">Very Satisfactory (85–89%)</th>
              <th colspan="6" style="background:#dbeafe;color:#1e40af">Outstanding</th>
            </tr>
            <tr>${['No.','%','No.','%','No.','%','No.','%','90–94%','','95–97%','','98–100%',''].map((h,i)=>i%2===0&&i>=8?`<th colspan="2" style="font-size:9px;background:#dbeafe;color:#1e40af">${h}</th>`:`<th>${h}</th>`).join('')}</tr>
          </thead>
          <tbody>
            <tr>
              <td class="sec-col">${section}</td><td>${N}</td>
              <td>${ptBands.dnm}</td><td>${pct(ptBands.dnm,N)}%</td>
              <td>${ptBands.fs}</td><td>${pct(ptBands.fs,N)}%</td>
              <td>${ptBands.s}</td><td>${pct(ptBands.s,N)}%</td>
              <td>${ptBands.vs}</td><td>${pct(ptBands.vs,N)}%</td>
              <td>${ptBands.o1}</td><td>${pct(ptBands.o1,N)}%</td>
              <td>${ptBands.o2}</td><td>${pct(ptBands.o2,N)}%</td>
              <td>${ptBands.o3}</td><td>${pct(ptBands.o3,N)}%</td>
            </tr>
            <tr class="total-row"><td class="sec-col">Total</td><td>${N}</td><td>${ptBands.dnm}</td><td>${pct(ptBands.dnm,N)}%</td><td>${ptBands.fs}</td><td>${pct(ptBands.fs,N)}%</td><td>${ptBands.s}</td><td>${pct(ptBands.s,N)}%</td><td>${ptBands.vs}</td><td>${pct(ptBands.vs,N)}%</td><td>${ptBands.o1}</td><td>${pct(ptBands.o1,N)}%</td><td>${ptBands.o2}</td><td>${pct(ptBands.o2,N)}%</td><td>${ptBands.o3}</td><td>${pct(ptBands.o3,N)}%</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Section 4: Quarterly Assessment -->
  ${h.qa?`<div class="card" style="margin-bottom:14px">
    <div class="loa-group-hdr loa-qa">📝 Section 4 — Quarterly Assessment Results (20%)</div>
    <div class="g2">
      <div>
        <div class="loa-summary-card">
          ${[['No. of Learners',N],['QA HPS',h.qa||'Not set'],['Mean Percentage Score',qaMean+'%'],['Students with Grades',qaPS.filter(v=>v!==null).length],['Missing',qaBands.miss]].map(([l,v])=>`<div class="loa-metric"><span class="loa-metric-label">${l}</span><span class="loa-metric-val">${v}</span></div>`).join('')}
        </div>
      </div>
      <div>
        <table class="loa-full-table">
          <thead>
            <tr><th rowspan="2" class="sec-col">Section</th><th rowspan="2">Learners</th><th rowspan="2">HPS</th>
              <th colspan="2" class="loa-np">Unsatisfactory (0–24%)</th>
              <th colspan="2" class="loa-lp">Needs Improvement (25–49%)</th>
              <th colspan="2" class="loa-nep">Meets Expectations (50–74%)</th>
              <th colspan="2" class="loa-p">Exceeds Expectations (75–89%)</th>
              <th colspan="2" class="loa-hp">Exceptional (90–100%)</th>
            </tr>
            <tr>${['No.','%','No.','%','No.','%','No.','%','No.','%'].map(h=>`<th>${h}</th>`).join('')}</tr>
          </thead>
          <tbody>
            <tr>
              <td class="sec-col">${section}</td><td>${N}</td><td>${h.qa}</td>
              <td>${qaBands.np}</td><td>${pct(qaBands.np,N)}%</td>
              <td>${qaBands.lp}</td><td>${pct(qaBands.lp,N)}%</td>
              <td>${qaBands.np2}</td><td>${pct(qaBands.np2,N)}%</td>
              <td>${qaBands.p}</td><td>${pct(qaBands.p,N)}%</td>
              <td>${qaBands.hp}</td><td>${pct(qaBands.hp,N)}%</td>
            </tr>
            <tr class="total-row"><td class="sec-col">Total</td><td>${N}</td><td>${h.qa}</td><td>${qaBands.np}</td><td>${pct(qaBands.np,N)}%</td><td>${qaBands.lp}</td><td>${pct(qaBands.lp,N)}%</td><td>${qaBands.np2}</td><td>${pct(qaBands.np2,N)}%</td><td>${qaBands.p}</td><td>${pct(qaBands.p,N)}%</td><td>${qaBands.hp}</td><td>${pct(qaBands.hp,N)}%</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>`:''}

  <!-- Section 5: Quarterly Grades -->
  <div class="card">
    <div class="loa-group-hdr loa-qg">🎓 Section 5 — Quarterly Grades (From Transmuted Grade) — Descriptor Bands</div>
    <div class="g2">
      <div>
        <div class="loa-summary-card">
          ${[['No. of Learners',N],['With Quarterly Grade',qGrades.filter(v=>v!==null).length],['Class Average',qGrades.filter(v=>v!==null).length?r2(qGrades.filter(v=>v!==null).reduce((a,b)=>a+b,0)/qGrades.filter(v=>v!==null).length):'—'],['Highest Grade',qGrades.filter(v=>v!==null).length?Math.max(...qGrades.filter(v=>v!==null)):'—'],['Lowest Grade',qGrades.filter(v=>v!==null).length?Math.min(...qGrades.filter(v=>v!==null)):'—'],['Passing Rate',N?pct(qGrades.filter(v=>v!==null&&v>=75).length,N)+'%':'—']].map(([l,v])=>`<div class="loa-metric"><span class="loa-metric-label">${l}</span><span class="loa-metric-val">${v}</span></div>`).join('')}
        </div>
      </div>
      <div>
        <table class="loa-full-table">
          <thead>
            <tr><th rowspan="2" class="sec-col">Section</th><th rowspan="2">Learners</th>
              <th colspan="2" style="background:#fee2e2;color:#991b1b">Did Not Meet (≤74)</th>
              <th colspan="2" style="background:#fef9c3;color:#713f12">Fairly Satisfactory (75–79)</th>
              <th colspan="2" style="background:#dcfce7;color:#14532d">Satisfactory (80–84)</th>
              <th colspan="2" style="background:#d1fae5;color:#065f46">Very Satisfactory (85–89)</th>
              <th colspan="6" style="background:#dbeafe;color:#1e40af">Outstanding</th>
            </tr>
            <tr>${['No.','%','No.','%','No.','%','No.','%','90–94','','95–97','','98–100',''].map((h,i)=>i%2===0&&i>=8?`<th colspan="2" style="font-size:9px;background:#dbeafe;color:#1e40af">${h}</th>`:`<th>${h}</th>`).join('')}</tr>
          </thead>
          <tbody>
            <tr>
              <td class="sec-col">${section}</td><td>${N}</td>
              <td>${qgBands.dnm}</td><td>${pct(qgBands.dnm,N)}%</td>
              <td>${qgBands.fs}</td><td>${pct(qgBands.fs,N)}%</td>
              <td>${qgBands.s}</td><td>${pct(qgBands.s,N)}%</td>
              <td>${qgBands.vs}</td><td>${pct(qgBands.vs,N)}%</td>
              <td>${qgBands.o1}</td><td>${pct(qgBands.o1,N)}%</td>
              <td>${qgBands.o2}</td><td>${pct(qgBands.o2,N)}%</td>
              <td>${qgBands.o3}</td><td>${pct(qgBands.o3,N)}%</td>
            </tr>
            <tr class="total-row"><td class="sec-col">Total</td><td>${N}</td><td>${qgBands.dnm}</td><td>${pct(qgBands.dnm,N)}%</td><td>${qgBands.fs}</td><td>${pct(qgBands.fs,N)}%</td><td>${qgBands.s}</td><td>${pct(qgBands.s,N)}%</td><td>${qgBands.vs}</td><td>${pct(qgBands.vs,N)}%</td><td>${qgBands.o1}</td><td>${pct(qgBands.o1,N)}%</td><td>${qgBands.o2}</td><td>${pct(qgBands.o2,N)}%</td><td>${qgBands.o3}</td><td>${pct(qgBands.o3,N)}%</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

// ══════════════════════════════════════════════
// GRADE SUMMARY PAGE
// ══════════════════════════════════════════════
function showGSTab(tab){
  const tabMap={table:'gstabTable',loa:'gstabLOA',student:'gstabStudent'};
  const btnMap={table:'gsTbl',loa:'gsLOA',student:'gsStud'};
  ['table','loa','student'].forEach(t=>{
    const el=document.getElementById(tabMap[t]);
    if(el)el.style.display=(t===tab)?'block':'none';
    const btn=document.getElementById(btnMap[t]);
    if(btn)btn.classList.toggle('active',t===tab);
  });
  if(tab==='loa')renderGSLOA();
  if(tab==='student')renderGSStudent();
}
function renderGSLOA(){
  const el=document.getElementById('gsLOAContent');
  if(!el)return;
  if(!hasClass()){
    el.innerHTML='<div class="ws"><h2>Select a class first</h2></div>';
    return;
  }

  const cd=getCD();
  const stu=allStu();
  const N=stu.length;

  if(!N){
    el.innerHTML='<div class="ws"><h2>No students</h2></div>';
    return;
  }

  const section=`${APP.ac.grade} – ${APP.ac.section}`;

  function descBands(scores){
    const r={dnm:0,fs:0,s:0,vs:0,o1:0,o2:0,o3:0,miss:0};
    scores.forEach(v=>{
      if(v===null||v===undefined){r.miss++;return;}
      if(v>=98)r.o3++;
      else if(v>=95)r.o2++;
      else if(v>=90)r.o1++;
      else if(v>=85)r.vs++;
      else if(v>=80)r.s++;
      else if(v>=75)r.fs++;
      else r.dnm++;
    });
    return r;
  }

  function pct(n,t){return t?r2((n/t)*100):0}

  const finals=stu.map(s=>{
    const vq=[1,2,3,4].map(q=>calcQ(s.name,q).quarterly).filter(v=>v!==null);
    return vq.length?Math.round(vq.reduce((a,b)=>a+b,0)/vq.length):null;
  });

  const fb=descBands(finals);
  const pass=finals.filter(v=>v!==null&&v>=75).length;
  const fail=finals.filter(v=>v!==null&&v<75).length;
  const withGrade=finals.filter(v=>v!==null).length;
  const avg=withGrade?r2(finals.filter(v=>v!==null).reduce((a,b)=>a+b,0)/withGrade):0;

  const qSummaries=[1,2,3,4].map(q=>{
    const qg=stu.map(s=>calcQ(s.name,q).quarterly);
    const valid=qg.filter(v=>v!==null);
    const qb=descBands(qg);
    return {
      q,
      avg:valid.length?r2(valid.reduce((a,b)=>a+b,0)/valid.length):null,
      pass:valid.filter(v=>v>=75).length,
      fail:valid.filter(v=>v<75).length,
      total:valid.length,
      bands:qb
    };
  });

  const bandDefs=[
    {key:'dnm',label:'Did Not Meet Expectations',range:'≤74',color:'#991b1b',bg:'#fee2e2'},
    {key:'fs',label:'Fairly Satisfactory',range:'75–79',color:'#92400e',bg:'#fef3c7'},
    {key:'s',label:'Satisfactory',range:'80–84',color:'#14532d',bg:'#dcfce7'},
    {key:'vs',label:'Very Satisfactory',range:'85–89',color:'#065f46',bg:'#d1fae5'},
    {key:'o1',label:'Outstanding',range:'90–94',color:'#1e40af',bg:'#dbeafe'},
    {key:'o2',label:'Outstanding',range:'95–97',color:'#1d4ed8',bg:'#bfdbfe'},
    {key:'o3',label:'Outstanding',range:'98–100',color:'#1e3a8a',bg:'#93c5fd'}
  ];

  el.innerHTML=`
  <div style="font-size:11px;color:var(--tx2);padding:8px 12px;background:var(--surf2);border:1px solid var(--bdr);border-radius:var(--r);margin-bottom:14px;font-weight:500">
    📊 LOA Overview — ${escH(cd.school.subject||'Subject')} · ${escH(section)} · ${escH(cd.school.teacher||'Teacher')} · SY ${escH(cd.school.year||'—')}
  </div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px">
    <div class="stat-c"><div class="stat-n" style="color:var(--blue)">${avg}</div><div class="stat-l">Overall Avg</div></div>
    <div class="stat-c"><div class="stat-n" style="color:var(--green)">${pass}</div><div class="stat-l">Passing</div></div>
    <div class="stat-c"><div class="stat-n" style="color:var(--red)">${fail}</div><div class="stat-l">Below 75</div></div>
    <div class="stat-c"><div class="stat-n" style="color:var(--tx2)">${withGrade}/${N}</div><div class="stat-l">With Final Grade</div></div>
  </div>

  <div class="card" style="margin-bottom:14px">
    <div class="ch"><div class="ct">Final Grade Distribution (Overall)</div><div class="cs">Based on transmuted quarterly grades</div></div>
    <div style="overflow-x:auto">
      <table class="loa-full-table">
        <thead>
          <tr>
            <th class="sec-col" rowspan="2">Section</th>
            <th rowspan="2">Learners</th>
            ${bandDefs.map(b=>`<th colspan="2" class="gs-dist-head" style="background:${b.bg};color:${b.color}">${b.label}<br><span class="gs-dist-sub" style="font-weight:400">${b.range}</span></th>`).join('')}
          </tr>
          <tr>${bandDefs.map(()=>'<th class="gs-dist-head">No.</th><th class="gs-dist-head">%</th>').join('')}</tr>
        </thead>
        <tbody>
          <tr>
            <td class="sec-col">${escH(section)}</td>
            <td>${N}</td>
            ${bandDefs.map(b=>`<td>${fb[b.key]||0}</td><td>${pct(fb[b.key]||0,N)}%</td>`).join('')}
          </tr>
          <tr class="total-row">
            <td class="sec-col">Total</td>
            <td>${N}</td>
            ${bandDefs.map(b=>`<td>${fb[b.key]||0}</td><td>${pct(fb[b.key]||0,N)}%</td>`).join('')}
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="g2">
    ${qSummaries.map(qs=>`
      <div class="card card-sm gs-qcard">
        <div class="ch">
          <div class="ct">Quarter ${qs.q}</div>
          <div class="cs gs-qmeta">${qs.total} graded · ${N-qs.total} missing</div>
        </div>

        <div class="gs-qstats">
          <div class="att-stat gs-qstat">
            <div class="att-stat-n" style="color:var(--blue)">${qs.avg||'—'}</div>
            <div class="att-stat-l">Average</div>
          </div>
          <div class="att-stat gs-qstat">
            <div class="att-stat-n" style="color:var(--green)">${qs.pass}</div>
            <div class="att-stat-l">Passing</div>
          </div>
          <div class="att-stat gs-qstat">
            <div class="att-stat-n" style="color:var(--red)">${qs.fail}</div>
            <div class="att-stat-l">Below 75</div>
          </div>
          <div class="att-stat gs-qstat">
            <div class="att-stat-n" style="color:var(--amber)">${N-qs.total}</div>
            <div class="att-stat-l">Missing</div>
          </div>
        </div>

        ${bandDefs.map(b=>`
          <div class="gs-band-row">
            <div class="gs-band-dot" style="background:${b.bg};border:1px solid ${b.color};"></div>
            <div class="gs-band-label">${b.label} <span style="color:var(--tx3)">${b.range}</span></div>
            <div class="gs-band-count">${qs.bands[b.key]||0}</div>
            <div class="gs-band-pct">${pct(qs.bands[b.key]||0,N)}%</div>
          </div>
        `).join('')}
      </div>
    `).join('')}
  </div>`;
}
function renderGSStudent(){
  const el=document.getElementById('gsStudContent');
  if(!el)return;
  if(!hasClass()){
    el.innerHTML='<div class="ws"><h2>Select a class first</h2></div>';
    return;
  }
  const cd=getCD();
  el.innerHTML=`
  <div class="card gs-stud-panel" style="margin-bottom:12px">
    <div class="ch">
      <div class="ct">Student Detail View</div>
      <div class="cs">Select quarter and student to view all grade details</div>
    </div>
    <div class="gs-stud-toolbar">
      <div>
        <div class="lbl">Quarter</div>
        <select class="inp" id="gssdQ" onchange="renderGSStudDetail()">
          <option value="1">Quarter 1</option>
          <option value="2">Quarter 2</option>
          <option value="3">Quarter 3</option>
          <option value="4">Quarter 4</option>
        </select>
      </div>
      <div>
        <div class="lbl">Student</div>
        <select class="inp gs-stud-name" id="gssdName" onchange="renderGSStudDetail()">
          <option value="">-- Select a student --</option>
          ${cd.students.male.map(n=>`<option value="${escH(n)}">[M] ${escH(n)}</option>`).join('')}
          ${cd.students.female.map(n=>`<option value="${escH(n)}">[F] ${escH(n)}</option>`).join('')}
        </select>
      </div>
      <button class="btn bp bsm" onclick="goToStudRow()">📍 Go to Row</button>
      <button class="btn br bsm" onclick="pdfStudDetail()">📄 PDF</button>
    </div>
  </div>
  <div id="gssdArea"><div class="ws gs-stud-empty"><h2>Select a student above</h2></div></div>`;
}
function renderGSStudDetail(){
  const name=document.getElementById('gssdName')?.value;
  const q=parseInt(document.getElementById('gssdQ')?.value||'1');
  const area=document.getElementById('gssdArea');
  if(!area)return;
  if(!name){
    area.innerHTML='<div class="ws gs-stud-empty"><h2>Select a student above</h2></div>';
    return;
  }

  const cd=getCD();
  const h=(cd.hps&&cd.hps[q])?cd.hps[q]:{ww:Array(10).fill(null),pt:Array(10).fill(null),qa:null};
  const g=(((cd.grades||{})[q]||{})[name])||{ww:Array(10).fill(null),pt:Array(10).fill(null),qa:null};
  const c=calcQ(name,q);

  const ww=(g.ww||Array(10).fill(null)).slice(0,10);
  const pt=(g.pt||Array(10).fill(null)).slice(0,10);
  const qa=g.qa;

  const q1=calcQ(name,1).quarterly;
  const q2=calcQ(name,2).quarterly;
  const q3=calcQ(name,3).quarterly;
  const q4=calcQ(name,4).quarterly;
  const finals=[q1,q2,q3,q4].filter(v=>v!==null);
  const finalGrade=finals.length?Math.round(finals.reduce((a,b)=>a+b,0)/finals.length):null;
  const finalRemark=finalGrade!==null?(finalGrade>=75?'PASSED':'FAILED'):'';

  const buildMini=(label,hps,val)=>`
    <div class="gs-mini-cell ${isMissingGrade(val)?'missing-grade':''}">
      <div class="gs-mini-k">${label}</div>
      <div class="gs-mini-hps">/${hps??'0'}</div>
      <div class="gs-mini-v">${val??'—'}</div>
    </div>`;

  area.innerHTML=`
    <div class="card gs-stud-panel">
      <div class="gs-stud-head">
        <div>
          <div class="gs-stud-head-title">${escH(name)}</div>
          <div class="gs-stud-head-sub">${APP.ac.grade} ${APP.ac.section} · Q${q} Detail</div>
        </div>
        <div class="gs-stud-badges">
          <div class="gs-stud-badge" style="background:var(--teal2);color:var(--teal)">Q${q}: ${c.quarterly??'—'}</div>
          <div class="gs-stud-badge" style="background:var(--red2);color:var(--red)">Final: ${finalGrade??'—'} <span style="display:block;font-size:.72em;font-family:inherit">${finalRemark||''}</span></div>
        </div>
      </div>

      <div class="gs-stud-grid">
        <div class="gs-stud-stat">
          <div class="gs-stud-stat-k">Q1</div>
          <div class="gs-stud-stat-v" style="color:var(--blue)">${q1??'—'}</div>
        </div>
        <div class="gs-stud-stat">
          <div class="gs-stud-stat-k">Q2</div>
          <div class="gs-stud-stat-v" style="color:var(--red)">${q2??'—'}</div>
        </div>
        <div class="gs-stud-stat">
          <div class="gs-stud-stat-k">Q3</div>
          <div class="gs-stud-stat-v">${q3??'—'}</div>
        </div>
        <div class="gs-stud-stat">
          <div class="gs-stud-stat-k">Q4</div>
          <div class="gs-stud-stat-v">${q4??'—'}</div>
        </div>
        <div class="gs-stud-stat" style="border-color:var(--blue);box-shadow:inset 0 0 0 1px var(--blue)">
          <div class="gs-stud-stat-k">Final</div>
          <div class="gs-stud-stat-v" style="color:var(--blue)">${finalGrade??'—'}</div>
        </div>
      </div>

      <div class="gs-stud-sections">
        <div class="gs-stud-card">
          <div class="gs-stud-card-title" style="color:var(--blue)">Written Works (30%)</div>
          <div class="gs-stud-head-sub" style="margin-bottom:8px">Total: ${c.wwT??'—'} · PS: ${c.wwPS??'—'}% · WS: ${c.wwWS??'—'}</div>
          <div class="gs-mini-grid">
            ${ww.map((v,i)=>h.ww&&h.ww[i]!==null?buildMini(`WW${i+1}`,h.ww[i],v):'').join('')}
          </div>

          <div class="gs-stud-card-title" style="color:var(--amber);margin-top:14px">Performance Tasks (50%)</div>
          <div class="gs-stud-head-sub" style="margin-bottom:8px">Total: ${c.ptT??'—'} · PS: ${c.ptPS??'—'}% · WS: ${c.ptWS??'—'}</div>
          <div class="gs-mini-grid">
            ${pt.map((v,i)=>h.pt&&h.pt[i]!==null?buildMini(`PT${i+1}`,h.pt[i],v):'').join('')}
          </div>

          ${h.qa!==null?`
            <div class="gs-stud-card-title" style="color:var(--teal);margin-top:14px">QA (20%)</div>
            <div class="gs-stud-head-sub" style="margin-bottom:8px">Score: ${qa??'—'} / ${h.qa} · PS: ${c.qaPS??'—'}% · WS: ${c.qaWS??'—'}</div>
          `:''}

          <div class="gs-stud-summary" style="margin-top:14px">
            <div class="gs-mini-cell ${isMissingGrade(c.wwWS)?'missing-grade':''}">
              <div class="gs-mini-k">WW WS</div>
              <div class="gs-mini-v">${c.wwWS??'—'}</div>
            </div>
            <div class="gs-mini-cell ${isMissingGrade(c.ptWS)?'missing-grade':''}">
              <div class="gs-mini-k">PT WS</div>
              <div class="gs-mini-v">${c.ptWS??'—'}</div>
            </div>
            <div class="gs-mini-cell ${isMissingGrade(c.qaWS)?'missing-grade':''}">
              <div class="gs-mini-k">QA WS</div>
              <div class="gs-mini-v">${c.qaWS??'—'}</div>
            </div>
            <div class="gs-mini-cell ${isMissingGrade(c.initial)?'missing-grade':''}">
              <div class="gs-mini-k">Initial</div>
              <div class="gs-mini-v">${c.initial??'—'}</div>
            </div>
            <div class="gs-mini-cell ${isMissingGrade(c.quarterly)?'missing-grade':''}">
              <div class="gs-mini-k">Q${q} Grade</div>
              <div class="gs-mini-v" style="color:var(--teal)">${c.quarterly??'—'}</div>
            </div>
          </div>
        </div>

        <div class="gs-stud-card">
          <div class="gs-stud-card-title">Quarter Summary</div>
          <div class="gs-stud-head-sub">This panel scales better with zoom and gives a clearer breakdown of the student's computed values.</div>
        </div>
      </div>
    </div>`;
}
function goToStudRow(){
  const name=document.getElementById('gssdName')?.value;
  const q=parseInt(document.getElementById('gssdQ')?.value||'1');
  if(!name){toast('Select a student first');return}
  APP.gq=q;APP.hlStudent=name;
  showRB('gradeentry');showPage('recordbook');
}
function pdfStudDetail(){
  const name=document.getElementById('gssdName')?.value;
  const q=parseInt(document.getElementById('gssdQ')?.value||'1');
  if(!name){toast('Select a student first');return}
  const cd=getCD();const h=cd.hps[q];
  const g=(cd.grades[q]&&cd.grades[q][name])||{};
  const ww=g.ww||Array(10).fill(null);const pt=g.pt||Array(10).fill(null);const qa=g.qa!==undefined?g.qa:null;
  const c=calcQ(name,q);
  const wwC=Math.max(h.ww.filter(v=>v).length,1);const ptC=Math.max(h.pt.filter(v=>v).length,1);
  const allQ=[1,2,3,4].map(qq=>({q:qq,c:calcQ(name,qq)}));
  const vq=allQ.map(a=>a.c.quarterly).filter(v=>v!==null);
  const final=vq.length?Math.round(vq.reduce((a,b)=>a+b,0)/vq.length):null;
  printWin('Student: '+name, `${hdr(escH(name)+' — Q'+q+' Detail')}
    <table style="max-width:300px;margin-bottom:10px"><thead><tr>${allQ.map(a=>`<th>Q${a.q}</th>`).join('')}<th>Final</th></tr></thead>
    <tbody><tr>${allQ.map(a=>`<td class="bold ${a.c.quarterly?(a.c.quarterly>=75?'pass':'fail'):''}">${a.c.quarterly||'—'}</td>`).join('')}<td class="bold" style="color:#1a56db">${final||'—'}</td></tr></tbody></table>
    <table style="margin-bottom:8px"><thead>
      <tr><th colspan="${wwC+3}" class="sh-ww">Written Works (30%)</th></tr>
      <tr>${Array.from({length:wwC},(_,i)=>`<th>WW${i+1}</th>`).join('')}<th>Total</th><th>PS</th><th>WS</th></tr>
      <tr class="hrow">${h.ww.slice(0,wwC).map(v=>`<td>${v||'—'}</td>`).join('')}<td>${h.ww.reduce((a,v)=>a+(v||0),0)}</td><td>100</td><td>30%</td></tr></thead>
      <tbody><tr>${ww.slice(0,wwC).map(v=>`<td>${v!==null?v:''}</td>`).join('')}<td class="bold">${c.wwT!==null?c.wwT:''}</td><td>${c.wwPS!==null?c.wwPS:''}</td><td>${c.wwWS!==null?c.wwWS:''}</td></tr></tbody>
    </table>
    <table style="margin-bottom:8px"><thead>
      <tr><th colspan="${ptC+3}" class="sh-pt">Performance Tasks (50%)</th></tr>
      <tr>${Array.from({length:ptC},(_,i)=>`<th>PT${i+1}</th>`).join('')}<th>Total</th><th>PS</th><th>WS</th></tr>
      <tr class="hrow">${h.pt.slice(0,ptC).map(v=>`<td>${v||'—'}</td>`).join('')}<td>${h.pt.reduce((a,v)=>a+(v||0),0)}</td><td>100</td><td>50%</td></tr></thead>
      <tbody><tr>${pt.slice(0,ptC).map(v=>`<td>${v!==null?v:''}</td>`).join('')}<td class="bold">${c.ptT!==null?c.ptT:''}</td><td>${c.ptPS!==null?c.ptPS:''}</td><td>${c.ptWS!==null?c.ptWS:''}</td></tr></tbody>
    </table>
    ${h.qa?`<table style="max-width:260px;margin-bottom:8px"><thead><tr><th colspan="3" class="sh-qa">QA (20%)</th></tr><tr><th>Score</th><th>PS</th><th>WS</th></tr><tr class="hrow"><td>${h.qa}</td><td>100</td><td>20%</td></tr></thead><tbody><tr><td>${qa!==null?qa:''}</td><td>${c.qaPS!==null?c.qaPS:''}</td><td>${c.qaWS!==null?c.qaWS:''}</td></tr></tbody></table>`:''}
    <table style="max-width:350px"><thead><tr><th>WW WS</th><th>PT WS</th><th>QA WS</th><th>Initial</th><th>Q${q} Grade</th></tr></thead>
    <tbody><tr><td>${c.wwWS!==null?c.wwWS:'—'}</td><td>${c.ptWS!==null?c.ptWS:'—'}</td><td>${c.qaWS!==null?c.qaWS:'—'}</td><td class="bold">${c.initial!==null?c.initial:'—'}</td>
    <td class="bold ${c.quarterly?(c.quarterly>=75?'pass':'fail'):''}">${c.quarterly||'—'}</td></tr></tbody></table>`);
}


function renderGradeSummaryPage(){
  const el=document.getElementById('gradeSummaryCard');
  if(!el)return;

  if(!hasClass()){
    el.innerHTML='<div class="ws"><h2>Select a class first</h2></div>';
    const loa=document.getElementById('gsLOAContent');
    const stud=document.getElementById('gsStudContent');
    if(loa)loa.innerHTML='<div class="ws"><h2>Select a class first</h2></div>';
    if(stud)stud.innerHTML='<div class="ws"><h2>Select a class first</h2></div>';
    return;
  }

  const cd=getCD();
  const stu=allStu();

  let rows='';let lastG=null;
  stu.forEach(s=>{
    if(s.g!==lastG){
      rows+=`<tr><td colspan="8" style="background:${s.g==='male'?'#e8f4fd':'#fce8f3'};font-weight:600;font-size:10px;padding:4px 8px;color:${s.g==='male'?'var(--blue)':'var(--pink)'}">${s.g==='male'?'👦 MALE':'👧 FEMALE'}</td></tr>`;
      lastG=s.g;
    }
    const num=(s.g==='male'?cd.students.male:cd.students.female).indexOf(s.name)+1;
    const q1=calcQ(s.name,1).quarterly,q2=calcQ(s.name,2).quarterly,q3=calcQ(s.name,3).quarterly,q4=calcQ(s.name,4).quarterly;
    const vq=[q1,q2,q3,q4].filter(v=>v!==null);
    const final=vq.length?Math.round(vq.reduce((a,b)=>a+b,0)/vq.length):null;
    const rem=final!==null?(final>=75?'PASSED':'FAILED'):'';
    rows+=`<tr>
      <td style="text-align:center;padding:5px;font-size:10px;color:var(--tx3);border:1px solid var(--bdr)">${num}</td>
      <td style="padding:5px 7px;font-size:11px;font-weight:500;border:1px solid var(--bdr)">${escH(s.name)}</td>
      ${[q1,q2,q3,q4].map(v=>`<td style="text-align:center;font-family:'DM Mono',monospace;font-size:11px;font-weight:600;border:1px solid var(--bdr)">${v||'—'}</td>`).join('')}
      <td style="text-align:center;font-family:'DM Mono',monospace;font-size:12px;font-weight:700;color:var(--blue);border:1px solid var(--bdr)">${final||'—'}</td>
      <td style="text-align:center;border:1px solid var(--bdr)">${rem?`<span class="${rem==='PASSED'?'bpass':'bfail'}">${rem}</span>`:''}</td>
    </tr>`;
  });

  el.innerHTML=`
    <div style="font-size:10px;color:var(--tx3);margin-bottom:9px">${cd.school.subject||'—'} · ${APP.ac.grade} ${APP.ac.section} · ${cd.school.teacher||'—'} · SY ${cd.school.year||'—'}</div>
    <div style="overflow-x:auto">
      <table class="stbl">
        <thead>
          <tr>
            <th style="width:26px">#</th>
            <th style="text-align:left;min-width:170px">Learner's Name</th>
            <th style="text-align:center;width:58px">Q1</th>
            <th style="text-align:center;width:58px">Q2</th>
            <th style="text-align:center;width:58px">Q3</th>
            <th style="text-align:center;width:58px">Q4</th>
            <th style="text-align:center;width:62px">Final</th>
            <th style="text-align:center;width:78px">Remark</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  const loa=document.getElementById('gsLOAContent');
  const stud=document.getElementById('gsStudContent');
  if(loa)loa.innerHTML='';
  if(stud)stud.innerHTML='';

  showGSTab('table');
}

// ══════════════════════════════════════════════
// ATTENDANCE MODULES
// ══════════════════════════════════════════════
function renderDailyAtt(){
  const el=document.getElementById('dailyAttContent');
  if(!hasClass()){el.innerHTML='<div class="ws"><h2>Select a class first</h2></div>';return}
  const cd=getCD();const stu=allStu();const ds=APP.attDate||today();const att=cd.att[ds]||{};
  el.innerHTML=`
  <div class="ebar"><span class="elbl">📆 Daily Attendance</span><div class="sp"></div><button class="btn br bsm" onclick="pdfDailyAtt('${ds}')">📄 PDF</button></div>
  <div class="card" style="margin-bottom:14px">
    <div class="ch"><div class="ct">Controls</div></div>
    <div class="fl">
      <div><div class="lbl">Date</div><input type="date" class="inp" id="attDate" value="${ds}" style="width:155px" onchange="APP.attDate=this.value;renderDailyAtt()"></div>
      <button class="btn bp bsm" onclick="markAllP('${ds}')">✓ All Present</button>
      <button class="btn ba bsm" onclick="clearDay('${ds}')">Clear Day</button>
      <button class="btn bg bsm" onclick="save();toast('✓ Saved')">💾 Save</button>
      <div class="sp"></div><div class="fl" id="attSum"></div>
    </div>
  </div>
  <div class="agrid" id="attGrid"></div>`;
  renderAttGrid(ds,att);updAttSum(ds);
}
function renderAttGrid(ds,att){
  const cd=getCD();const stu=allStu();const el=document.getElementById('attGrid');if(!el)return;
  el.innerHTML=stu.map((s,i)=>{
    const st=att[s.name]||'';const num=(s.g==='male'?cd.students.male:cd.students.female).indexOf(s.name)+1;
    return`<div class="acard" style="border-left:3px solid ${s.g==='male'?'var(--blue)':'var(--pink)'}">
      <div class="anum">${num}</div><div class="aname">${escH(s.name)}</div>
      <div class="atog">
        <button class="abtn ${st==='P'?'pres':'off'}" onclick="setAtt('${ds}','${esc(s.name)}','P',this)">P</button>
        <button class="abtn ${st==='A'?'abs':'off'}" onclick="setAtt('${ds}','${esc(s.name)}','A',this)">A</button>
        <button class="abtn ${st==='L'?'late':'off'}" onclick="setAtt('${ds}','${esc(s.name)}','L',this)">L</button>
      </div>
    </div>`;
  }).join('');
}
function setAtt(ds,name,st,btn){
  const cd=getCD();if(!cd.att[ds])cd.att[ds]={};cd.att[ds][name]=st;
  btn.closest('.acard').querySelectorAll('.abtn').forEach(b=>b.className='abtn off');
  btn.className=`abtn ${st==='P'?'pres':st==='A'?'abs':'late'}`;
  save();updAttSum(ds);
}
function updAttSum(ds){
  const cd=getCD();const stu=allStu();const att=cd.att[ds]||{};
  const P=stu.filter(s=>att[s.name]==='P').length,A=stu.filter(s=>att[s.name]==='A').length,L=stu.filter(s=>att[s.name]==='L').length;
  const el=document.getElementById('attSum');
  if(el)el.innerHTML=`<span class="tag tg">Present: ${P}</span><span class="tag trr">Absent: ${A}</span><span class="tag ta">Late: ${L}</span><span class="tag" style="background:var(--surf2);color:var(--tx3)">Total: ${stu.length}</span>`;
}
function markAllP(ds){const cd=getCD();const stu=allStu();if(!cd.att[ds])cd.att[ds]={};stu.forEach(s=>cd.att[ds][s.name]='P');save();renderDailyAtt();toast('✓ All present');}
function clearDay(ds){const cd=getCD();delete cd.att[ds];save();renderDailyAtt();}
function renderAttSummary(){
  const el=document.getElementById('attSumContent');
  if(!hasClass()){el.innerHTML='<div class="ws"><h2>Select a class first</h2></div>';return}
  const cd=getCD();const stu=allStu();const dates=Object.keys(cd.att).sort();
  el.innerHTML=`
  <div class="ebar"><span class="elbl">📄 Export:</span><button class="btn br bsm" onclick="pdfAttSum()">📄 PDF</button><button class="btn bg bsm" onclick="excelAtt()">📊 Excel</button></div>
  <div class="card" style="margin-bottom:14px">
    <div class="ch"><div class="ct">Attendance Records</div><div class="cs">${dates.length} days · ${stu.length} students</div></div>
    <div class="asum-row">
      <div class="astat"><div class="astn" style="color:var(--blue)">${stu.length}</div><div class="astl">Students</div></div>
      <div class="astat"><div class="astn" style="color:var(--green)">${dates.length}</div><div class="astl">Days</div></div>
      ${(()=>{let P=0,A=0,L=0;stu.forEach(s=>dates.forEach(d=>{const t=(cd.att[d]||{})[s.name];if(t==='P')P++;else if(t==='A')A++;else if(t==='L')L++;}));return`<div class="astat"><div class="astn" style="color:var(--green)">${P}</div><div class="astl">Total Present</div></div><div class="astat"><div class="astn" style="color:var(--red)">${A}</div><div class="astl">Total Absent</div></div><div class="astat"><div class="astn" style="color:var(--amber)">${L}</div><div class="astl">Total Late</div></div>`})()}
    </div>
  </div>
  ${dates.length===0?'<div class="ws"><h2>No records yet</h2><p>Go to Daily Attendance to record attendance.</p></div>':`<div class="card">
    <div style="font-size:10px;color:var(--tx3);margin-bottom:7px">Showing last ${Math.min(dates.length,20)} days</div>
    <div style="overflow-x:auto">${(()=>{
      const rd=dates.slice(-20);let rows='';let lastG=null;
      stu.forEach(s=>{
        if(s.g!==lastG){rows+=`<tr><td colspan="${rd.length+4}" style="background:${s.g==='male'?'#e8f4fd':'#fce8f3'};font-weight:600;font-size:10px;padding:3px 7px;color:${s.g==='male'?'var(--blue)':'var(--pink)'}">${s.g==='male'?'👦 MALE':'👧 FEMALE'}</td></tr>`;lastG=s.g;}
        const num=(s.g==='male'?cd.students.male:cd.students.female).indexOf(s.name)+1;let P=0,A=0,L=0;
        const cells=rd.map(d=>{const t=(cd.att[d]||{})[s.name]||'';if(t==='P')P++;else if(t==='A')A++;else if(t==='L')L++;const col=t==='P'?'var(--green)':t==='A'?'var(--red)':t==='L'?'var(--amber)':'var(--tx4)';return`<td style="text-align:center;border:1px solid var(--bdr);font-size:10px;font-weight:600;color:${col};padding:3px;width:27px">${t||'—'}</td>`;}).join('');
        rows+=`<tr><td style="text-align:center;padding:4px;font-size:10px;color:var(--tx3);border:1px solid var(--bdr)">${num}</td><td style="padding:4px 7px;font-size:11px;font-weight:500;border:1px solid var(--bdr);min-width:150px">${escH(s.name)}</td>${cells}<td style="text-align:center;border:1px solid var(--bdr);font-size:10px;font-weight:600;color:var(--green);padding:3px">${P}</td><td style="text-align:center;border:1px solid var(--bdr);font-size:10px;font-weight:600;color:var(--red);padding:3px">${A}</td></tr>`;
      });
      return`<table class="att-tbl"><thead><tr><th style="width:26px">#</th><th style="text-align:left;min-width:150px">Name</th>${rd.map(d=>`<th style="width:27px;font-size:9px">${d.slice(5)}</th>`).join('')}<th style="color:var(--green);width:28px">P</th><th style="color:var(--red);width:28px">A</th></tr></thead><tbody>${rows}</tbody></table>`;
    })()}</div>
  </div>`}`;
}

// ══════════════════════════════════════════════
// CONSOLIDATED GRADES (Advisory)
// ══════════════════════════════════════════════
function renderConsolidated(){
  if(APP.role!=='advisory'){document.getElementById('consContent').innerHTML='<div class="ws"><h2>Advisory Teacher only</h2><p>Switch role to use this module.</p></div>';return}
  const el=document.getElementById('consContent');
  el.innerHTML=`
  <div class="ebar"><span class="elbl">📤 Export:</span><button class="btn br bsm" onclick="pdfCons()">📄 PDF</button><button class="btn bg bsm" onclick="excelCons()">📊 Excel</button><div class="sp"></div><button class="btn bo bsm" style="color:var(--red)" onclick="clearImps()">🗑 Clear Imports</button></div>
  <div class="g2" style="margin-bottom:14px">
    <div class="card">
      <div class="ch"><div class="ct">Import Subject JSON Files</div><div class="cs">Upload Grade Summary JSONs from subject teachers</div></div>
      <div class="iz" id="iz" onclick="document.getElementById('jImp').click()"
        ondragover="event.preventDefault();this.classList.add('drag')"
        ondragleave="this.classList.remove('drag')"
        ondrop="dropImp(event)">
        <div class="iz-icon">📂</div>
        <div class="iz-text">Click or drag JSON files here</div>
        <div class="iz-sub">Export via Grade Summary → 📦 JSON for Advisory</div>
        <input type="file" id="jImp" accept=".json" multiple style="display:none" onchange="handleImp(this)">
      </div>
      <div id="ipills" style="margin-top:10px;display:flex;flex-wrap:wrap;gap:4px"></div>
    </div>
    <div class="card"><div class="ch"><div class="ct">Imported Subjects</div></div><div id="istat"><div class="ws" style="padding:20px"><h2>No imports yet</h2></div></div></div>
  </div>
  <div id="consTable"><div class="ws"><h2>Import subject JSONs above</h2></div></div>`;
  renderIPills();renderIStatus();renderConsTable();
}
function handleImp(inp){
  const files=Array.from(inp.files);let done=0;
  files.forEach(f=>{
    const r=new FileReader();
    r.onload=e=>{
      try{const d=JSON.parse(e.target.result);
        if(d.exportType==='gradeSummaryJSON'){APP.imported=APP.imported.filter(s=>s.subject!==d.subject);APP.imported.push(d);done++;if(done===files.length){save();renderIPills();renderIStatus();renderConsTable();toast(`✓ Imported ${done} file${done>1?'s':''}`);}
        }else toast('Invalid file: '+f.name);
      }catch(e){toast('Error: '+f.name);}
    };r.readAsText(f);
  });inp.value='';
}
function dropImp(e){e.preventDefault();document.getElementById('iz')?.classList.remove('drag');const inp=document.getElementById('jImp');const dt=new DataTransfer();Array.from(e.dataTransfer.files).forEach(f=>dt.items.add(f));inp.files=dt.files;handleImp(inp);}
function clearImps(){APP.imported=[];save();renderConsolidated();toast('Cleared');}
function removeImp(subj){APP.imported=APP.imported.filter(s=>s.subject!==subj);save();renderIPills();renderIStatus();renderConsTable();}
const SPILLS=['tb','tg','ta','tp','tpk','trr','tt'];
function renderIPills(){
  const el=document.getElementById('ipills');if(!el)return;
  el.innerHTML=APP.imported.map((s,i)=>`<span class="spill ${SPILLS[i%SPILLS.length]}">${escH(s.subject||'?')} (${(s.students||[]).length})<button class="spill-x" onclick="removeImp('${esc(s.subject)}')">✕</button></span>`).join('');
}
function renderIStatus(){
  const el=document.getElementById('istat');if(!el)return;
  if(!APP.imported.length){el.innerHTML='<div class="ws" style="padding:20px"><h2>No imports</h2></div>';return}
  el.innerHTML=APP.imported.map((s,i)=>`<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--bdr)"><span class="tag ${SPILLS[i%SPILLS.length]}">${escH(s.subject||'?')}</span><div><div style="font-size:11px;font-weight:500">${escH(s.teacher||'—')}</div><div style="font-size:10px;color:var(--tx3)">${(s.students||[]).length} students · ${escH(s.section||'')} · ${escH(s.exportDate||'')}</div></div></div>`).join('');
}
function renderConsTable(){
  const el=document.getElementById('consTable');if(!el)return;
  if(!APP.imported.length){el.innerHTML='<div class="ws"><h2>Import subject files above</h2></div>';return}
  const subjects=APP.imported.map(s=>s.subject||'?');
  const allNames=new Set();APP.imported.forEach(s=>(s.students||[]).forEach(st=>allNames.add(norm(st.name))));
  const nameArr=[...allNames].sort();
  const lkp={};APP.imported.forEach(s=>{lkp[s.subject]={};(s.students||[]).forEach(st=>lkp[s.subject][norm(st.name)]=st);});
  const sf=subjects.map(()=>({p:0,f:0,t:0,sum:0}));
  let rows='';
  nameArr.forEach((name,idx)=>{
    const cells=subjects.map((subj,si)=>{
      const st=lkp[subj][name];if(!st)return`<td style="text-align:center;border:1px solid var(--bdr);font-size:10px;color:var(--tx4)">—</td>`;
      const f=st.finalGrade;sf[si].t++;sf[si].sum+=f||0;if(f>=75)sf[si].p++;else sf[si].f++;
      return`<td style="text-align:center;border:1px solid var(--bdr);font-family:'DM Mono',monospace;font-size:11px;font-weight:600;color:${f?(f>=75?'var(--green)':'var(--red)'):'var(--tx3)'}">${f||'—'}</td>`;
    }).join('');
    const grades=subjects.map(subj=>lkp[subj][name]?.finalGrade).filter(v=>v!==null&&v!==undefined);
    const ga=grades.length?Math.round(grades.reduce((a,b)=>a+b,0)/grades.length):null;
    const allP=subjects.every(subj=>{const st=lkp[subj][name];return!st||!st.finalGrade||(st.finalGrade>=75)});
    const prom=ga!==null?(ga>=75&&allP?'PROMOTED':'RETAINED'):'';
    rows+=`<tr><td style="text-align:center;padding:4px;font-size:10px;color:var(--tx3);border:1px solid var(--bdr)">${idx+1}</td><td style="padding:4px 7px;font-size:11px;font-weight:500;border:1px solid var(--bdr);min-width:160px">${escH(name)}</td>${cells}<td style="text-align:center;border:1px solid var(--bdr);font-family:'DM Mono',monospace;font-size:12px;font-weight:700;color:var(--blue)">${ga||'—'}</td><td style="text-align:center;border:1px solid var(--bdr)">${prom?`<span class="${prom==='PROMOTED'?'bpass':'bfail'}">${prom}</span>`:''}</td></tr>`;
  });
  const avgRow=`<tr style="background:var(--surf2)"><td></td><td style="padding:4px 7px;font-size:10px;font-weight:600;color:var(--tx3);border:1px solid var(--bdr)">Class Average</td>${sf.map(s=>`<td style="text-align:center;border:1px solid var(--bdr);font-family:'DM Mono',monospace;font-size:10px;font-weight:600;color:var(--blue)">${s.t?r2(s.sum/s.t):'—'}</td>`).join('')}<td colspan="2" style="border:1px solid var(--bdr)"></td></tr>`;
  el.innerHTML=`<div class="card"><div class="ch"><div class="ct">Consolidated Grades</div><div class="cs">${nameArr.length} students · ${subjects.length} subjects</div></div>
    <div style="overflow-x:auto"><table class="ctbl"><thead><tr><th style="width:26px">#</th><th class="nc" style="min-width:160px">Learner's Name</th>${subjects.map((s,i)=>`<th style="min-width:66px"><span class="tag ${SPILLS[i%SPILLS.length]}">${escH(s)}</span></th>`).join('')}<th style="min-width:62px;color:var(--blue)">Gen. Avg</th><th style="min-width:78px">Status</th></tr></thead><tbody>${rows}${avgRow}</tbody></table></div></div>`;
}

// ══════════════════════════════════════════════
// EXCEL EXPORT — OFFICIAL eDEPED FORMAT (Image 4)
// ══════════════════════════════════════════════
function excelGrades(){
  const cd=getCD();const wb=XLSX.utils.book_new();
  // ─── Helper: apply style to a range of cells ───
  function styleCell(ws, cellRef, opts){
    if(!ws[cellRef])ws[cellRef]={t:'s',v:''};
    ws[cellRef].s=opts;
  }
  function headerStyle(bg,color,bold,sz,wrapText){
    return{font:{bold:bold||false,sz:sz||9,color:{rgb:color||'000000'}},fill:{fgColor:{rgb:bg||'FFFFFF'}},alignment:{horizontal:'center',vertical:'center',wrapText:wrapText||false},border:{top:{style:'thin',color:{rgb:'999999'}},bottom:{style:'thin',color:{rgb:'999999'}},left:{style:'thin',color:{rgb:'999999'}},right:{style:'thin',color:{rgb:'999999'}}}};
  }
  // ─── INPUT DATA Sheet ───
  const iRows=[
    ['Official E-Class Record in K to 12 Curriculum'],[''],
    ['','','REGION',cd.school.region||'','','DIVISION',cd.school.division||''],
    ['','','SCHOOL NAME',cd.school.name||'','','','','SCHOOL ID',cd.school.id||'','SCHOOL YEAR',cd.school.year||''],
    [''],['LEARNERS\' NAMES'],[''],['MALE'],
    ...cd.students.male.map((n,i)=>[i+1,n]),
    [''],['FEMALE'],
    ...cd.students.female.map((n,i)=>[i+1,n])
  ];
  const wsI=XLSX.utils.aoa_to_sheet(iRows);
  wsI['!cols']=[{wch:5},{wch:45}];
  XLSX.utils.book_append_sheet(wb,wsI,'INPUT DATA');

  // ─── Per-Quarter Sheets (Q1–Q4) matching DepEd format ───
  const qNames=['FIRST QUARTER','SECOND QUARTER','THIRD QUARTER','FOURTH QUARTER'];
  for(let q=1;q<=4;q++){
    const h=cd.hps[q];
    const wwC=Math.max(h.ww.filter(v=>v).length,1);
    const ptC=Math.max(h.pt.filter(v=>v).length,1);
    const hasQA=!!h.qa;
    const wwHT=h.ww.reduce((a,v)=>a+(v||0),0);
    const ptHT=h.pt.reduce((a,v)=>a+(v||0),0);
    const rows=[];
    // Row 1: Title
    rows.push(['Official E-Class Record in K to 12 Curriculum']);
    rows.push(['']);
    // Row 3: Region / Division
    rows.push(['','REGION','',cd.school.region||'','','','DIVISION','',cd.school.division||'']);
    // Row 4: School Name / ID / Year
    rows.push(['','SCHOOL NAME','',cd.school.name||'','','','','','SCHOOL ID','',cd.school.id||'','SCHOOL YEAR','',cd.school.year||'']);
    // Row 5: Quarter / Grade / Teacher / Subject
    rows.push([qNames[q-1],'','GRADE & SECTION:',`${cd.school.grade||''}–${cd.school.section||''}`,'','TEACHER:',cd.school.teacher||'','','','','SUBJECT:',cd.school.subject||'']);
    rows.push(['']);
    // Row 7: Main column headers - row 1
    // Build: blank, LEARNERS NAMES, WW (30%) spanning wwC+3 cols, PT (50%) spanning ptC+3, QA (20%) if applicable, Initial Grade, Quarterly Grade
    const hdr1=['','LEARNERS\' NAMES'];
    // WW group header
    hdr1.push('WRITTEN WORKS (30%)');for(let i=1;i<wwC+3;i++)hdr1.push('');
    // PT group header
    hdr1.push('PERFORMANCE TASKS (50%)');for(let i=1;i<ptC+3;i++)hdr1.push('');
    // QA group header
    if(hasQA){hdr1.push('QUARTERLY ASSESSMENT (20%)');hdr1.push('');hdr1.push('');}
    hdr1.push('Initial Grade','Quarterly Grade');
    rows.push(hdr1);
    // Row 8: Sub-column numbers (1-10, Total, PS, WS)
    const hdr2=['',''];
    for(let i=0;i<wwC;i++)hdr2.push(i+1);
    hdr2.push('Total','PS','WS');
    for(let i=0;i<ptC;i++)hdr2.push(i+1);
    hdr2.push('Total','PS','WS');
    if(hasQA){hdr2.push(1,'PS','WS');}
    hdr2.push('','');
    rows.push(hdr2);
    // Row 9: HPS row
    const hpsR=['','HIGHEST POSSIBLE SCORE'];
    for(let i=0;i<wwC;i++)hpsR.push(h.ww[i]||'');
    hpsR.push(wwHT,100,'30%');
    for(let i=0;i<ptC;i++)hpsR.push(h.pt[i]||'');
    hpsR.push(ptHT,100,'50%');
    if(hasQA)hpsR.push(h.qa,100,'20%');
    hpsR.push('','');
    rows.push(hpsR);
    // Student data rows
    [{n:'MALE',arr:cd.students.male},{n:'FEMALE',arr:cd.students.female}].forEach(({n,arr})=>{
      rows.push(['',n]);
      arr.forEach((sn,idx)=>{
        const g=(cd.grades[q]&&cd.grades[q][sn])||{};
        const ww=g.ww||Array(10).fill(null);const pt=g.pt||Array(10).fill(null);
        const qa=g.qa!==undefined&&g.qa!==null?g.qa:'';
        const c=calcQ(sn,q);
        const row=[idx+1,sn];
        for(let j=0;j<wwC;j++)row.push(ww[j]!==null&&ww[j]!==undefined?ww[j]:'');
        row.push(c.wwT!==null?c.wwT:'',c.wwPS!==null?c.wwPS:'',c.wwWS!==null?c.wwWS:'');
        for(let j=0;j<ptC;j++)row.push(pt[j]!==null&&pt[j]!==undefined?pt[j]:'');
        row.push(c.ptT!==null?c.ptT:'',c.ptPS!==null?c.ptPS:'',c.ptWS!==null?c.ptWS:'');
        if(hasQA)row.push(qa!==''?qa:'',c.qaPS!==null?c.qaPS:'',c.qaWS!==null?c.qaWS:'');
        row.push(c.initial!==null?c.initial:'',c.quarterly||'');
        rows.push(row);
      });
    });
    const wsQ=XLSX.utils.aoa_to_sheet(rows);
    // Column widths — name col wide, data cols narrow
    const cols=[{wch:4},{wch:42}];
    for(let i=0;i<wwC+ptC+12;i++)cols.push({wch:7});
    wsQ['!cols']=cols;
    // Merge title row
    const lastDataCol=1+wwC+ptC+(hasQA?1:0)+8;
    wsQ['!merges']=[
      {s:{r:0,c:0},e:{r:0,c:lastDataCol}}, // Title
      {s:{r:2,c:3},e:{r:2,c:4}},            // Region value
      {s:{r:3,c:3},e:{r:3,c:7}},            // School name value
      // WW header merge
      {s:{r:6,c:2},e:{r:6,c:2+wwC+2}},
      // PT header merge
      {s:{r:6,c:3+wwC},e:{r:6,c:3+wwC+ptC+2}},
    ];
    // Apply basic header styling to row 6 (WW/PT headers)
    XLSX.utils.book_append_sheet(wb,wsQ,`EsP_Q${q}`);
  }

  // ─── SUMMARY OF QUARTERLY GRADES Sheet ───
  const sumR=[
    ['Summary of Quarterly Grades'],[''],
    ['','REGION',cd.school.region||'','','DIVISION',cd.school.division||''],
    ['','SCHOOL NAME',cd.school.name||'','','','','SCHOOL ID',cd.school.id||''],
    ['','GRADE & SECTION:',`${cd.school.grade||''}–${cd.school.section||''}`,'','TEACHER:',cd.school.teacher||'','SUBJECT:',cd.school.subject||'','SCHOOL YEAR:',cd.school.year||''],
    [''],
    ['#','LEARNER\'S NAME','Q1','Q2','Q3','Q4','FINAL GRADE','REMARK']
  ];
  [{n:'MALE',arr:cd.students.male},{n:'FEMALE',arr:cd.students.female}].forEach(({n,arr})=>{
    sumR.push(['',n]);
    arr.forEach((sn,i)=>{
      const q1=calcQ(sn,1).quarterly,q2=calcQ(sn,2).quarterly,q3=calcQ(sn,3).quarterly,q4=calcQ(sn,4).quarterly;
      const vq=[q1,q2,q3,q4].filter(v=>v!==null);
      const final=vq.length?Math.round(vq.reduce((a,b)=>a+b,0)/vq.length):null;
      sumR.push([i+1,sn,q1||'',q2||'',q3||'',q4||'',final||'',final?(final>=75?'PASSED':'FAILED'):'']);
    });
  });
  const wsSum=XLSX.utils.aoa_to_sheet(sumR);
  wsSum['!cols']=[{wch:4},{wch:42},{wch:8},{wch:8},{wch:8},{wch:8},{wch:10},{wch:10}];
  wsSum['!merges']=[{s:{r:0,c:0},e:{r:0,c:7}}];
  XLSX.utils.book_append_sheet(wb,wsSum,'SUMMARY OF QUARTERLY GRADES');

  // ─── LOA SUMMARY Sheet ───
  const cd2=cd;const stu=allStu();const loaRows=[];
  loaRows.push([`LOA SUMMARY — ${cd2.school.subject||'Subject'} · ${APP.ac.grade} ${APP.ac.section} · ${cd2.school.teacher||''} · SY ${cd2.school.year||''}`]);
  loaRows.push(['']);
  for(let q=1;q<=4;q++){
    const h=cd2.hps[q];const N=stu.length;
    function calcBandsLOA(scores,type){
      const r=type==='prof'?{np:0,lp:0,np2:0,p:0,hp:0}:{dnm:0,fs:0,s:0,vs:0,o1:0,o2:0,o3:0};
      scores.forEach(v=>{if(v===null||v===undefined)return;if(type==='prof'){if(v>=90)r.hp++;else if(v>=75)r.p++;else if(v>=50)r.np2++;else if(v>=25)r.lp++;else r.np++;}else{if(v>=98)r.o3++;else if(v>=95)r.o2++;else if(v>=90)r.o1++;else if(v>=85)r.vs++;else if(v>=80)r.s++;else if(v>=75)r.fs++;else r.dnm++;}});return r;
    }
    const wwPS=stu.map(s=>calcQ(s.name,q).wwPS);
    const ptPS=stu.map(s=>calcQ(s.name,q).ptPS);
    const qaPS=stu.map(s=>calcQ(s.name,q).qaPS);
    const qGr=stu.map(s=>calcQ(s.name,q).quarterly);
    const wwB=calcBandsLOA(wwPS,'prof');const ptB=calcBandsLOA(ptPS,'desc');const qaB=calcBandsLOA(qaPS,'prof');const qgB=calcBandsLOA(qGr,'desc');
    function pct(n,t){return t?r2((n/t)*100):0}
    loaRows.push([`QUARTER ${q} — LOA SUMMARY`]);
    loaRows.push(['']);
    // Written Works
    loaRows.push(['WRITTEN WORKS PROFICIENCY']);
    loaRows.push(['Section','Learners','HPS','HSO','LSO','Mean','MPS','Not Proficient (0-24%)','','Low Proficient (25-49%)','','Nearly Proficient (50-74%)','','Proficient (75-89%)','','Highly Proficient (90-100%)','']);
    loaRows.push(['','','','','','','','No.','%','No.','%','No.','%','No.','%','No.','%']);
    const wwHT=h.ww.reduce((a,v)=>a+(v||0),0);
    const wwScores=stu.map(s=>{const g=(cd2.grades[q]&&cd2.grades[q][s.name])||{};const ww=g.ww||[];let sum=0,cnt=0;ww.forEach(v=>{if(v!==null&&!isNaN(v)){sum+=parseFloat(v);cnt++;}});return cnt?sum:null;});
    const wwValid=wwScores.filter(v=>v!==null);const wwHSO=wwValid.length?Math.max(...wwValid):0;const wwLSO=wwValid.length?Math.min(...wwValid):0;const wwMean=wwValid.length?r2(wwValid.reduce((a,b)=>a+b,0)/wwValid.length):0;const wwMPS=wwHT?r2((wwMean/wwHT)*100):0;
    loaRows.push([`${APP.ac.grade}–${APP.ac.section}`,N,wwHT,wwHSO,wwLSO,wwMean,wwMPS+'%',wwB.np,pct(wwB.np,N)+'%',wwB.lp,pct(wwB.lp,N)+'%',wwB.np2,pct(wwB.np2,N)+'%',wwB.p,pct(wwB.p,N)+'%',wwB.hp,pct(wwB.hp,N)+'%']);
    loaRows.push(['']);
    // Performance Tasks
    loaRows.push(['PERFORMANCE TASKS DESCRIPTORS']);
    loaRows.push(['Section','Learners','Did Not Meet Expectations (≤74%)','','Fairly Satisfactory (75-79%)','','Satisfactory (80-84%)','','Very Satisfactory (85-89%)','','Outstanding 90-94%','','Outstanding 95-97%','','Outstanding 98-100%','']);
    loaRows.push(['','','No.','%','No.','%','No.','%','No.','%','No.','%','No.','%','No.','%']);
    loaRows.push([`${APP.ac.grade}–${APP.ac.section}`,N,ptB.dnm,pct(ptB.dnm,N)+'%',ptB.fs,pct(ptB.fs,N)+'%',ptB.s,pct(ptB.s,N)+'%',ptB.vs,pct(ptB.vs,N)+'%',ptB.o1,pct(ptB.o1,N)+'%',ptB.o2,pct(ptB.o2,N)+'%',ptB.o3,pct(ptB.o3,N)+'%']);
    loaRows.push(['']);
    // QA
    if(h.qa){
      loaRows.push(['QUARTERLY ASSESSMENT PROFICIENCY']);
      loaRows.push(['Section','Learners','No. of Items','HSO','LSO','Mean','MPS','Not Proficient (0-24%)','','Low Proficient (25-49%)','','Nearly Proficient (50-74%)','','Proficient (75-89%)','','Highly Proficient (90-100%)','']);
      loaRows.push(['','','','','','','','No.','%','No.','%','No.','%','No.','%','No.','%']);
      const qaScores=stu.map(s=>{const g=(cd2.grades[q]&&cd2.grades[q][s.name])||{};return g.qa!==null&&g.qa!==undefined?parseFloat(g.qa):null;});
      const qaValid=qaScores.filter(v=>v!==null);const qaHSO=qaValid.length?Math.max(...qaValid):0;const qaLSO=qaValid.length?Math.min(...qaValid):0;const qaMean=qaValid.length?r2(qaValid.reduce((a,b)=>a+b,0)/qaValid.length):0;const qaMPS=h.qa?r2((qaMean/h.qa)*100):0;
      loaRows.push([`${APP.ac.grade}–${APP.ac.section}`,N,h.qa,qaHSO,qaLSO,qaMean,qaMPS+'%',qaB.np,pct(qaB.np,N)+'%',qaB.lp,pct(qaB.lp,N)+'%',qaB.np2,pct(qaB.np2,N)+'%',qaB.p,pct(qaB.p,N)+'%',qaB.hp,pct(qaB.hp,N)+'%']);
      loaRows.push(['']);
    }
    // Quarterly Grades
    loaRows.push(['QUARTERLY GRADES DESCRIPTORS (from Transmuted Grade)']);
    loaRows.push(['Section','Learners','Did Not Meet Expectations (≤74%)','','Fairly Satisfactory (75-79%)','','Satisfactory (80-84%)','','Very Satisfactory (85-89%)','','Outstanding 90-94%','','Outstanding 95-97%','','Outstanding 98-100%','']);
    loaRows.push(['','','No.','%','No.','%','No.','%','No.','%','No.','%','No.','%','No.','%']);
    loaRows.push([`${APP.ac.grade}–${APP.ac.section}`,N,qgB.dnm,pct(qgB.dnm,N)+'%',qgB.fs,pct(qgB.fs,N)+'%',qgB.s,pct(qgB.s,N)+'%',qgB.vs,pct(qgB.vs,N)+'%',qgB.o1,pct(qgB.o1,N)+'%',qgB.o2,pct(qgB.o2,N)+'%',qgB.o3,pct(qgB.o3,N)+'%']);
    loaRows.push(['','']);
  }
  const wsLOA=XLSX.utils.aoa_to_sheet(loaRows);
  wsLOA['!cols']=[{wch:22},{wch:9},{wch:9},{wch:9},{wch:9},{wch:9},{wch:9},{wch:9},{wch:9},{wch:9},{wch:9},{wch:9},{wch:9},{wch:9},{wch:9},{wch:9},{wch:9}];
  XLSX.utils.book_append_sheet(wb,wsLOA,'LOA SUMMARY');

  const fn=`EClassRecord_${(cd.school.subject||'Subject').replace(/\s+/g,'_').substring(0,15)}_${APP.ac.grade.replace(/\s/g,'')}_${APP.ac.section}.xlsx`;
  XLSX.writeFile(wb,fn);toast('✓ Excel exported in DepEd E-Class Record format');
}

// ══════════════════════════════════════════════
// JSON EXPORT FOR ADVISORY TEACHER
// ══════════════════════════════════════════════
function jsonExport(){
  const cd=getCD();const stu=allStu();
  const payload={version:'1.0',exportType:'gradeSummaryJSON',school:cd.school.name,teacher:cd.school.teacher,subject:cd.school.subject,section:APP.ac.section,grade:APP.ac.grade,year:cd.school.year,exportDate:today(),
    students:stu.map(s=>{
      const q1=calcQ(s.name,1).quarterly,q2=calcQ(s.name,2).quarterly,q3=calcQ(s.name,3).quarterly,q4=calcQ(s.name,4).quarterly;
      const vq=[q1,q2,q3,q4].filter(v=>v!==null);const final=vq.length?Math.round(vq.reduce((a,b)=>a+b,0)/vq.length):null;
      return{name:s.name,gender:s.g,quarters:{Q1:q1,Q2:q2,Q3:q3,Q4:q4},finalGrade:final,remark:final?(final>=75?'PASSED':'FAILED'):''};
    })
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=`GradeSummary_${(cd.school.subject||'Subject').replace(/\s+/g,'_').substring(0,15)}_${APP.ac.section}.json`;
  a.click();toast('✓ JSON exported — share with Advisory Teacher');
}

// ══════════════════════════════════════════════
// LOA EXCEL EXPORT
// ══════════════════════════════════════════════
function excelLOA(){
  const cd=getCD();const stu=allStu();const wb=XLSX.utils.book_new();const q=APP.gq;const h=cd.hps[q];const N=stu.length;
  const section=`${APP.ac.grade}–${APP.ac.section}`;
  function ps(s){return calcQ(s.name,q)}
  const wwPS=stu.map(s=>ps(s).wwPS);const ptPS=stu.map(s=>ps(s).ptPS);const qaPS=stu.map(s=>ps(s).qaPS);const qG=stu.map(s=>ps(s).quarterly);
  function pBands(scores){const r={np:0,lp:0,np2:0,p:0,hp:0};scores.forEach(v=>{if(v===null)return;if(v>=90)r.hp++;else if(v>=75)r.p++;else if(v>=50)r.np2++;else if(v>=25)r.lp++;else r.np++;});return r;}
  function dBands(scores){const r={dnm:0,fs:0,s:0,vs:0,o1:0,o2:0,o3:0};scores.forEach(v=>{if(v===null)return;if(v>=98)r.o3++;else if(v>=95)r.o2++;else if(v>=90)r.o1++;else if(v>=85)r.vs++;else if(v>=80)r.s++;else if(v>=75)r.fs++;else r.dnm++;});return r;}
  const wwB=pBands(wwPS);const ptB=dBands(ptPS);const qaB=pBands(qaPS);const qgB=dBands(qG);
  function pct(n,t){return t?r2((n/t)*100):0}
  // LOA Summary Sheet
  const lRows=[
    [`LOA SUMMARY REPORTS — ${cd.school.subject||'Subject'} · Q${q} · ${section} · ${cd.school.teacher||''} · SY ${cd.school.year||''}`],
    [''],
    ['SECTION 1: DIAGNOSTIC TEST RESULTS'],
    ['Section','No. of Learners','No. of Items','Highest Score','Lowest Score','Mean Score','MPS (%)'],
    [section,N,cd.diag?.items||0,cd.diag?.hso||0,cd.diag?.lso||0,r2((cd.diag?.hso||0)/2),r2(((cd.diag?.hso||0)/(cd.diag?.items||1))*100)+'%'],
    [''],
    ['SECTION 2: WRITTEN WORKS ACHIEVEMENT (30%)'],
    ['Section','Learners','HPS','Not Proficient (0-24%)','%','Low Proficient (25-49%)','%','Nearly Proficient (50-74%)','%','Proficient (75-89%)','%','Highly Proficient (90-100%)','%'],
    [section,N,h.ww.reduce((a,v)=>a+(v||0),0),wwB.np,pct(wwB.np,N)+'%',wwB.lp,pct(wwB.lp,N)+'%',wwB.np2,pct(wwB.np2,N)+'%',wwB.p,pct(wwB.p,N)+'%',wwB.hp,pct(wwB.hp,N)+'%'],
    [''],
    ['SECTION 3: PERFORMANCE TASKS (50%) — DESCRIPTOR BANDS'],
    ['Section','Learners','Did Not Meet (≤74%)','%','Fairly Satisfactory (75-79%)','%','Satisfactory (80-84%)','%','Very Satisfactory (85-89%)','%','Outstanding 90-94%','%','Outstanding 95-97%','%','Outstanding 98-100%','%'],
    [section,N,ptB.dnm,pct(ptB.dnm,N)+'%',ptB.fs,pct(ptB.fs,N)+'%',ptB.s,pct(ptB.s,N)+'%',ptB.vs,pct(ptB.vs,N)+'%',ptB.o1,pct(ptB.o1,N)+'%',ptB.o2,pct(ptB.o2,N)+'%',ptB.o3,pct(ptB.o3,N)+'%'],
    [''],
    h.qa?['SECTION 4: QUARTERLY ASSESSMENT (20%)']:['SECTION 4: QUARTERLY ASSESSMENT — No QA set for this quarter'],
    h.qa?['Section','Learners','QA HPS','Not Proficient (0-24%)','%','Low Proficient (25-49%)','%','Nearly Proficient (50-74%)','%','Proficient (75-89%)','%','Highly Proficient (90-100%)','%']:['—'],
    h.qa?[section,N,h.qa,qaB.np,pct(qaB.np,N)+'%',qaB.lp,pct(qaB.lp,N)+'%',qaB.np2,pct(qaB.np2,N)+'%',qaB.p,pct(qaB.p,N)+'%',qaB.hp,pct(qaB.hp,N)+'%']:['—'],
    [''],
    ['SECTION 5: QUARTERLY GRADES — DESCRIPTOR BANDS'],
    ['Section','Learners','Did Not Meet (≤74)','%','Fairly Satisfactory (75-79)','%','Satisfactory (80-84)','%','Very Satisfactory (85-89)','%','Outstanding 90-94','%','Outstanding 95-97','%','Outstanding 98-100','%'],
    [section,N,qgB.dnm,pct(qgB.dnm,N)+'%',qgB.fs,pct(qgB.fs,N)+'%',qgB.s,pct(qgB.s,N)+'%',qgB.vs,pct(qgB.vs,N)+'%',qgB.o1,pct(qgB.o1,N)+'%',qgB.o2,pct(qgB.o2,N)+'%',qgB.o3,pct(qgB.o3,N)+'%'],
  ];
  const wsL=XLSX.utils.aoa_to_sheet(lRows);XLSX.utils.book_append_sheet(wb,wsL,'LOA Summary Q'+q);
  const fn=`LOA_${(cd.school.subject||'Subject').replace(/\s+/g,'_').substring(0,15)}_${APP.ac.section}_Q${q}.xlsx`;
  XLSX.writeFile(wb,fn);toast('✓ LOA Excel exported');
}

// ══════════════════════════════════════════════
// PDF PRINT ENGINE
// ══════════════════════════════════════════════
function printWin(title,html){
  const w=window.open('','_blank','width=1200,height=850');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escH(title)}</title>
  <style>body{font-family:Arial,sans-serif;font-size:9px;color:#1a1d23;margin:0;padding:14px}h1{font-size:13px;font-weight:700;margin-bottom:3px}h2{font-size:11px;font-weight:600;margin:0 0 2px}.meta{font-size:8px;color:#666;margin-bottom:10px}table{border-collapse:collapse;width:100%;font-size:8px;margin-bottom:10px}th,td{border:1px solid #cdd3da;padding:3px 4px;text-align:center}th{background:#f0f2f5;font-weight:600}.nc{text-align:left}.pass{color:#0d9488;font-weight:700}.fail{color:#dc2626;font-weight:700}.bold{font-weight:700}.sec{font-weight:700;font-size:8px;padding:3px 6px;text-align:left}.hrow td{background:#fffbeb;font-weight:500}.sww{background:#e8f0fe;color:#1a56db;font-weight:700}.spt{background:#fffbeb;color:#d97706;font-weight:700}.sqa{background:#e6faf8;color:#0d9488;font-weight:700}.sg{background:#f3f0ff;color:#7c3aed;font-weight:700}.stat-row{display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap}.stat-box{text-align:center;padding:6px 10px;border:1px solid #cdd3da;border-radius:5px}.stat-n{font-size:16px;font-weight:700}.stat-l{font-size:7px;color:#666;text-transform:uppercase}.band-row{display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid #e2e6ea}.bl{width:62px;font-size:8px}.bbw{flex:1;background:#f0f2f5;border-radius:99px;height:5px;overflow:hidden}.bb{height:100%;border-radius:99px}.bcnt{width:24px;text-align:right;font-size:8px}.loa-sec{margin-bottom:10px;padding:8px;border:1px solid #cdd3da;border-radius:5px}.loa-title{font-weight:700;font-size:9px;text-transform:uppercase;margin-bottom:6px;padding:4px 6px;border-radius:3px}@media print{@page{size:A4 landscape;margin:7mm}}</style>
  </head><body>${html}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
  w.document.close();
}
function hdr(title){
  const cd=getCD();const sc=cd.school;
  return`<h1>${escH(title)}</h1><div class="meta">${escH(sc.name||'School')} · ${escH(APP.ac.grade)} ${escH(APP.ac.section)} · ${escH(sc.subject||'Subject')} · Teacher: ${escH(sc.teacher||'—')} · SY ${escH(sc.year||'—')} · ${escH(sc.region||'')} · ${escH(sc.division||'')}</div>`;
}
function pdfGradeEntry(){
  const q=APP.gq;const cd=getCD();const h=cd.hps[q];const stu=allStu();
  const wwC=Math.max(h.ww.filter(v=>v).length,1);const ptC=Math.max(h.pt.filter(v=>v).length,1);const hasQA=!!h.qa;
  let body='';let lastG=null;
  stu.forEach(s=>{
    if(s.g!==lastG){body+=`<tr><td colspan="100" class="sec" style="background:${s.g==='male'?'#e8f4fd':'#fce8f3'}">${s.g==='male'?'MALE':'FEMALE'}</td></tr>`;lastG=s.g;}
    const num=(s.g==='male'?cd.students.male:cd.students.female).indexOf(s.name)+1;
    const g=(cd.grades[q]&&cd.grades[q][s.name])||{};const ww=g.ww||Array(10).fill(null);const pt=g.pt||Array(10).fill(null);const qa=g.qa!==undefined?g.qa:'';const c=calcQ(s.name,q);
    body+=`<tr><td>${num}</td><td class="nc">${escH(s.name)}</td>${ww.slice(0,wwC).map(v=>`<td>${v!==null?v:''}</td>`).join('')}<td class="bold">${c.wwT!==null?c.wwT:''}</td><td>${c.wwPS!==null?c.wwPS:''}</td><td>${c.wwWS!==null?c.wwWS:''}</td>${pt.slice(0,ptC).map(v=>`<td>${v!==null?v:''}</td>`).join('')}<td class="bold">${c.ptT!==null?c.ptT:''}</td><td>${c.ptPS!==null?c.ptPS:''}</td><td>${c.ptWS!==null?c.ptWS:''}</td>${hasQA?`<td>${qa!==''?qa:''}</td><td>${c.qaPS!==null?c.qaPS:''}</td><td>${c.qaWS!==null?c.qaWS:''}</td>`:''}<td class="bold">${c.initial!==null?c.initial:''}</td><td class="bold ${c.quarterly?(c.quarterly>=75?'pass':'fail'):''}">${c.quarterly||''}</td></tr>`;
  });
  const hr=`<tr class="hrow"><td></td><td class="nc">HPS</td>${h.ww.slice(0,wwC).map(v=>`<td>${v||'—'}</td>`).join('')}<td>${h.ww.reduce((a,v)=>a+(v||0),0)}</td><td>100</td><td>0.30</td>${h.pt.slice(0,ptC).map(v=>`<td>${v||'—'}</td>`).join('')}<td>${h.pt.reduce((a,v)=>a+(v||0),0)}</td><td>100</td><td>0.50</td>${hasQA?`<td>${h.qa}</td><td>100</td><td>0.20</td>`:''}<td></td><td></td></tr>`;
  printWin('Grade Entry Q'+q,`${hdr('Official E-Class Record — Q'+q)}<table><thead><tr><th rowspan="2">#</th><th class="nc" rowspan="2" style="min-width:130px">Learner's Name</th><th colspan="${wwC+3}" class="sww">Written Works (30%)</th><th colspan="${ptC+3}" class="spt">Performance Tasks (50%)</th>${hasQA?`<th colspan="3" class="sqa">QA (20%)</th>`:''}<th colspan="2" class="sg">Grades</th></tr><tr>${Array.from({length:wwC},(_,i)=>`<th>${i+1}</th>`).join('')}<th>Total</th><th>PS</th><th>WS</th>${Array.from({length:ptC},(_,i)=>`<th>${i+1}</th>`).join('')}<th>Total</th><th>PS</th><th>WS</th>${hasQA?'<th>Score</th><th>PS</th><th>WS</th>':''}<th>Initial</th><th>Q${q}</th></tr></thead><tbody>${hr}${body}</tbody></table>`);
}
function pdfBulk(){
  const q=parseInt(document.getElementById('bQ').value);const cat=document.getElementById('bC').value;const idx=parseInt(document.getElementById('bI').value);
  const gf=document.getElementById('bG').value;const cd=getCD();const h=cd.hps[q];const hv=cat==='WW'?h.ww[idx]:cat==='PT'?h.pt[idx]:h.qa;
  const lbl=cat==='QA'?'QA1':`${cat}${idx+1}`;let stu=[];
  if(gf==='all'||gf==='male')stu.push(...cd.students.male.map(n=>({name:n,g:'male'})));
  if(gf==='all'||gf==='female')stu.push(...cd.students.female.map(n=>({name:n,g:'female'})));
  let rows='';stu.forEach((s,i)=>{
    const g=(cd.grades[q]&&cd.grades[q][s.name])||{};let v=cat==='WW'?(g.ww&&g.ww[idx]!==null?g.ww[idx]:''):cat==='PT'?(g.pt&&g.pt[idx]!==null?g.pt[idx]:''):(g.qa!==null&&g.qa!==undefined?g.qa:'');
    rows+=`<tr><td>${i+1}</td><td class="nc">${escH(s.name)}</td><td>${v}</td><td>${hv&&v!==''?r2((parseFloat(v)/hv)*100)+'%':''}</td></tr>`;
  });
  printWin('Bulk Q'+q+' '+lbl,`${hdr('Bulk Entry Q'+q+' · '+lbl)}<p style="margin-bottom:7px;font-size:9px">HPS: <strong>${hv||'Not set'}</strong></p><table style="max-width:380px"><thead><tr><th>#</th><th class="nc" style="min-width:160px">Student</th><th>Score</th><th>%</th></tr></thead><tbody>${rows}</tbody></table>`);
}
function pdfSummary(){
  const cd=getCD();const stu=allStu();let rows='';let lastG=null;
  stu.forEach(s=>{
    if(s.g!==lastG){rows+=`<tr><td colspan="8" class="sec" style="background:${s.g==='male'?'#e8f4fd':'#fce8f3'}">${s.g==='male'?'MALE':'FEMALE'}</td></tr>`;lastG=s.g;}
    const num=(s.g==='male'?cd.students.male:cd.students.female).indexOf(s.name)+1;
    const q1=calcQ(s.name,1).quarterly,q2=calcQ(s.name,2).quarterly,q3=calcQ(s.name,3).quarterly,q4=calcQ(s.name,4).quarterly;
    const vq=[q1,q2,q3,q4].filter(v=>v!==null);const final=vq.length?Math.round(vq.reduce((a,b)=>a+b,0)/vq.length):null;const rem=final!==null?(final>=75?'PASSED':'FAILED'):'';
    rows+=`<tr><td>${num}</td><td class="nc">${escH(s.name)}</td>${[q1,q2,q3,q4].map(v=>`<td class="bold">${v||'—'}</td>`).join('')}<td class="bold" style="color:#1a56db">${final||'—'}</td><td class="${rem==='PASSED'?'pass':'fail'}">${rem}</td></tr>`;
  });
  printWin('Summary',`${hdr('Summary of Quarterly Grades')}<table><thead><tr><th>#</th><th class="nc" style="min-width:150px">Name</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Final</th><th>Remark</th></tr></thead><tbody>${rows}</tbody></table>`);
}
function pdfStudentDetail(){
  const name=document.getElementById('sdS')?.value;const q=parseInt(document.getElementById('sdQ')?.value||'1');
  if(!name){toast('Select a student first');return}
  const cd=getCD();const h=cd.hps[q];const g=(cd.grades[q]&&cd.grades[q][name])||{};
  const ww=g.ww||Array(10).fill(null);const pt=g.pt||Array(10).fill(null);const qa=g.qa!==undefined?g.qa:null;
  const c=calcQ(name,q);const wwC=Math.max(h.ww.filter(v=>v).length,1);const ptC=Math.max(h.pt.filter(v=>v).length,1);
  const allQ=[1,2,3,4].map(qq=>({q:qq,c:calcQ(name,qq)}));const vq=allQ.map(a=>a.c.quarterly).filter(v=>v!==null);const final=vq.length?Math.round(vq.reduce((a,b)=>a+b,0)/vq.length):null;
  printWin('Student: '+name,`${hdr(escH(name)+' — Q'+q)}<table style="max-width:300px;margin-bottom:8px"><thead><tr>${allQ.map(a=>`<th>Q${a.q}</th>`).join('')}<th>Final</th></tr></thead><tbody><tr>${allQ.map(a=>`<td class="bold ${a.q===q?'pass':''}">${a.c.quarterly||'—'}</td>`).join('')}<td class="bold" style="color:#1a56db">${final||'—'}</td></tr></tbody></table><table style="max-width:520px;margin-bottom:7px"><thead><tr><th colspan="${wwC+3}" class="sww">Written Works (30%)</th></tr><tr>${Array.from({length:wwC},(_,i)=>`<th>${i+1}</th>`).join('')}<th>Total</th><th>PS</th><th>WS</th></tr><tr class="hrow">${h.ww.slice(0,wwC).map(v=>`<td>${v||'—'}</td>`).join('')}<td>${h.ww.reduce((a,v)=>a+(v||0),0)}</td><td>100</td><td>0.30</td></tr></thead><tbody><tr>${ww.slice(0,wwC).map(v=>`<td>${v!==null?v:''}</td>`).join('')}<td class="bold">${c.wwT!==null?c.wwT:''}</td><td>${c.wwPS!==null?c.wwPS:''}</td><td>${c.wwWS!==null?c.wwWS:''}</td></tr></tbody></table><table style="max-width:520px;margin-bottom:7px"><thead><tr><th colspan="${ptC+3}" class="spt">Performance Tasks (50%)</th></tr><tr>${Array.from({length:ptC},(_,i)=>`<th>${i+1}</th>`).join('')}<th>Total</th><th>PS</th><th>WS</th></tr><tr class="hrow">${h.pt.slice(0,ptC).map(v=>`<td>${v||'—'}</td>`).join('')}<td>${h.pt.reduce((a,v)=>a+(v||0),0)}</td><td>100</td><td>0.50</td></tr></thead><tbody><tr>${pt.slice(0,ptC).map(v=>`<td>${v!==null?v:''}</td>`).join('')}<td class="bold">${c.ptT!==null?c.ptT:''}</td><td>${c.ptPS!==null?c.ptPS:''}</td><td>${c.ptWS!==null?c.ptWS:''}</td></tr></tbody></table>${h.qa?`<table style="max-width:260px;margin-bottom:7px"><thead><tr><th colspan="3" class="sqa">QA (20%)</th></tr><tr><th>Score</th><th>PS</th><th>WS</th></tr><tr class="hrow"><td>${h.qa}</td><td>100</td><td>0.20</td></tr></thead><tbody><tr><td>${qa!==null?qa:''}</td><td>${c.qaPS!==null?c.qaPS:''}</td><td>${c.qaWS!==null?c.qaWS:''}</td></tr></tbody></table>`:''}<table style="max-width:360px"><thead><tr><th>WW WS</th><th>PT WS</th><th>QA WS</th><th>Initial</th><th>Q${q} Grade</th></tr></thead><tbody><tr><td>${c.wwWS!==null?c.wwWS:'—'}</td><td>${c.ptWS!==null?c.ptWS:'—'}</td><td>${c.qaWS!==null?c.qaWS:'—'}</td><td class="bold">${c.initial!==null?c.initial:'—'}</td><td class="bold ${c.quarterly?(c.quarterly>=75?'pass':'fail'):''}">${c.quarterly||'—'}</td></tr></tbody></table>`);
}
function pdfAnalytics(){
  const q=APP.aq;const stu=allStu();
  let grades=q===0?stu.map(s=>{const vq=[1,2,3,4].map(qq=>calcQ(s.name,qq).quarterly).filter(v=>v!==null);return vq.length?Math.round(vq.reduce((a,b)=>a+b,0)/vq.length):null}).filter(v=>v!==null):stu.map(s=>calcQ(s.name,q).quarterly).filter(v=>v!==null);
  if(!grades.length){toast('No grades');return}
  const avg=r2(grades.reduce((a,b)=>a+b,0)/grades.length);const hi=Math.max(...grades);const lo=Math.min(...grades);
  const pass=grades.filter(g=>g>=75).length;const fail=grades.filter(g=>g<75).length;
  const bands=[{l:'96–100',mn:96,mx:100,c:'#0d9488'},{l:'91–95',mn:91,mx:95,c:'#0284c7'},{l:'86–90',mn:86,mx:90,c:'#7c3aed'},{l:'81–85',mn:81,mx:85,c:'#d97706'},{l:'76–80',mn:76,mx:80,c:'#f59e0b'},{l:'75',mn:75,mx:75,c:'#84cc16'},{l:'Below 75',mn:0,mx:74,c:'#dc2626'}].map(b=>({...b,cnt:grades.filter(g=>g>=b.mn&&g<=b.mx).length}));
  const mx=Math.max(...bands.map(b=>b.cnt),1);
  printWin('Analytics',`${hdr('Analytics — '+(q?'Q'+q:'All Quarters'))}<div class="stat-row">${[['Average',avg,'#1a56db'],['Highest',hi,'#0d9488'],['Lowest',lo,'#dc2626'],['Passing',pass,'#0d9488'],['Below 75',fail,'#dc2626'],['Top 90+',grades.filter(g=>g>=90).length,'#1a56db']].map(([l,v,c])=>`<div class="stat-box"><div class="stat-n" style="color:${c}">${v}</div><div class="stat-l">${l}</div></div>`).join('')}</div>${bands.map(b=>`<div class="band-row"><div class="bl">${b.l}</div><div class="bbw"><div class="bb" style="width:${Math.round((b.cnt/mx)*100)}%;background:${b.c}"></div></div><div class="bcnt">${b.cnt}</div></div>`).join('')}`);
}
function pdfLOA(){
  const cd=getCD();const stu=allStu();const q=APP.gq;const h=cd.hps[q];const N=stu.length;
  const section=`${APP.ac.grade}–${APP.ac.section}`;
  const wwPS=stu.map(s=>calcQ(s.name,q).wwPS);const ptPS=stu.map(s=>calcQ(s.name,q).ptPS);const qaPS=stu.map(s=>calcQ(s.name,q).qaPS);const qG=stu.map(s=>calcQ(s.name,q).quarterly);
  function pb(sc){const r={np:0,lp:0,np2:0,p:0,hp:0};sc.forEach(v=>{if(v===null)return;if(v>=90)r.hp++;else if(v>=75)r.p++;else if(v>=50)r.np2++;else if(v>=25)r.lp++;else r.np++;});return r;}
  function db(sc){const r={dnm:0,fs:0,s:0,vs:0,o1:0,o2:0,o3:0};sc.forEach(v=>{if(v===null)return;if(v>=98)r.o3++;else if(v>=95)r.o2++;else if(v>=90)r.o1++;else if(v>=85)r.vs++;else if(v>=80)r.s++;else if(v>=75)r.fs++;else r.dnm++;});return r;}
  const wwB=pb(wwPS);const ptB=db(ptPS);const qaB=pb(qaPS);const qgB=db(qG);
  function p(n,t){return t?r2((n/t)*100):0}
  const profRow=(b,N)=>`<td>${b.np}</td><td>${p(b.np,N)}%</td><td>${b.lp}</td><td>${p(b.lp,N)}%</td><td>${b.np2}</td><td>${p(b.np2,N)}%</td><td>${b.p}</td><td>${p(b.p,N)}%</td><td>${b.hp}</td><td>${p(b.hp,N)}%</td>`;
  const descRow=(b,N)=>`<td>${b.dnm}</td><td>${p(b.dnm,N)}%</td><td>${b.fs}</td><td>${p(b.fs,N)}%</td><td>${b.s}</td><td>${p(b.s,N)}%</td><td>${b.vs}</td><td>${p(b.vs,N)}%</td><td>${b.o1}</td><td>${p(b.o1,N)}%</td><td>${b.o2}</td><td>${p(b.o2,N)}%</td><td>${b.o3}</td><td>${p(b.o3,N)}%</td>`;
  const profHdr=`<th colspan="2">Not Proficient (0–24%)</th><th colspan="2">Low Proficient (25–49%)</th><th colspan="2">Nearly Proficient (50–74%)</th><th colspan="2">Proficient (75–89%)</th><th colspan="2">Highly Proficient (90–100%)</th>`;
  const descHdr=`<th colspan="2">Did Not Meet (≤74%)</th><th colspan="2">Fairly Satisfactory (75–79%)</th><th colspan="2">Satisfactory (80–84%)</th><th colspan="2">Very Satisfactory (85–89%)</th><th colspan="2">Outstanding 90–94%</th><th colspan="2">Outstanding 95–97%</th><th colspan="2">Outstanding 98–100%</th>`;
  const subHdr=`<th>No.</th><th>%</th><th>No.</th><th>%</th><th>No.</th><th>%</th><th>No.</th><th>%</th><th>No.</th><th>%</th>`;
  const subHdrD=`<th>No.</th><th>%</th><th>No.</th><th>%</th><th>No.</th><th>%</th><th>No.</th><th>%</th><th>No.</th><th>%</th><th>No.</th><th>%</th><th>No.</th><th>%</th>`;
  printWin('LOA Summary Q'+q,`${hdr('LOA Summary Reports — Quarter '+q)}
    <div class="loa-sec"><div class="loa-title" style="background:#e8f0fe;color:#1a56db">1. Diagnostic Test Results</div>
    <table><thead><tr><th class="nc">Section</th><th>Learners</th><th>No. Items</th><th>HSO</th><th>LSO</th><th>Mean</th><th>MPS%</th></tr></thead>
    <tbody><tr><td class="nc">${section}</td><td>${N}</td><td>${cd.diag?.items||0}</td><td>${cd.diag?.hso||0}</td><td>${cd.diag?.lso||0}</td><td>${r2((cd.diag?.hso||0)/2)}</td><td>${r2(((cd.diag?.hso||0)/(cd.diag?.items||1))*100)}%</td></tr></tbody></table></div>
    <div class="loa-sec"><div class="loa-title" style="background:#fef3c7;color:#92400e">2. Written Works Achievement (30%)</div>
    <table><thead><tr><th class="nc">Section</th><th>Learners</th><th>HPS</th>${profHdr}</tr><tr><th></th><th></th><th></th>${subHdr}</tr></thead>
    <tbody><tr><td class="nc">${section}</td><td>${N}</td><td>${h.ww.reduce((a,v)=>a+(v||0),0)}</td>${profRow(wwB,N)}</tr></tbody></table></div>
    <div class="loa-sec"><div class="loa-title" style="background:#e6faf8;color:#065f46">3. Performance Tasks Descriptors (50%)</div>
    <table><thead><tr><th class="nc">Section</th><th>Learners</th>${descHdr}</tr><tr><th></th><th></th>${subHdrD}</tr></thead>
    <tbody><tr><td class="nc">${section}</td><td>${N}</td>${descRow(ptB,N)}</tr></tbody></table></div>
    ${h.qa?`<div class="loa-sec"><div class="loa-title" style="background:#f3f0ff;color:#7c3aed">4. Quarterly Assessment (20%)</div>
    <table><thead><tr><th class="nc">Section</th><th>Learners</th><th>HPS</th>${profHdr}</tr><tr><th></th><th></th><th></th>${subHdr}</tr></thead>
    <tbody><tr><td class="nc">${section}</td><td>${N}</td><td>${h.qa}</td>${profRow(qaB,N)}</tr></tbody></table></div>`:''}
    <div class="loa-sec"><div class="loa-title" style="background:#e0f2fe;color:#0e7490">5. Quarterly Grades Descriptors</div>
    <table><thead><tr><th class="nc">Section</th><th>Learners</th>${descHdr}</tr><tr><th></th><th></th>${subHdrD}</tr></thead>
    <tbody><tr><td class="nc">${section}</td><td>${N}</td>${descRow(qgB,N)}</tr></tbody></table></div>`);
}
function pdfDailyAtt(ds){
  const cd=getCD();const stu=allStu();const att=cd.att[ds]||{};let rows='';let lastG=null;
  stu.forEach((s,i)=>{
    if(s.g!==lastG){rows+=`<tr><td colspan="5" class="sec" style="background:${s.g==='male'?'#e8f4fd':'#fce8f3'}">${s.g==='male'?'MALE':'FEMALE'}</td></tr>`;lastG=s.g;}
    const num=(s.g==='male'?cd.students.male:cd.students.female).indexOf(s.name)+1;const st=att[s.name]||'';
    rows+=`<tr><td>${num}</td><td class="nc">${escH(s.name)}</td><td style="color:${st==='P'?'#0d9488':''};font-weight:${st==='P'?'700':'400'}">${st==='P'?'✓':''}</td><td style="color:${st==='A'?'#dc2626':''};font-weight:${st==='A'?'700':'400'}">${st==='A'?'✗':''}</td><td style="color:${st==='L'?'#d97706':''};font-weight:${st==='L'?'700':'400'}">${st==='L'?'L':''}</td></tr>`;
  });
  printWin('Attendance '+ds,`${hdr('Daily Attendance — '+ds)}<table style="max-width:380px"><thead><tr><th>#</th><th class="nc" style="min-width:150px">Name</th><th>Present</th><th>Absent</th><th>Late</th></tr></thead><tbody>${rows}</tbody></table>`);
}
function pdfAttSum(){
  const cd=getCD();const stu=allStu();const dates=Object.keys(cd.att).sort().slice(-20);let rows='';let lastG=null;
  stu.forEach(s=>{
    if(s.g!==lastG){rows+=`<tr><td colspan="${dates.length+4}" class="sec" style="background:${s.g==='male'?'#e8f4fd':'#fce8f3'}">${s.g==='male'?'MALE':'FEMALE'}</td></tr>`;lastG=s.g;}
    const num=(s.g==='male'?cd.students.male:cd.students.female).indexOf(s.name)+1;let P=0,A=0,L=0;
    const cells=dates.map(d=>{const t=(cd.att[d]||{})[s.name]||'';if(t==='P')P++;else if(t==='A')A++;else if(t==='L')L++;return`<td style="color:${t==='P'?'#0d9488':t==='A'?'#dc2626':t==='L'?'#d97706':'#b8bfc9'};font-weight:600">${t||'—'}</td>`;}).join('');
    rows+=`<tr><td>${num}</td><td class="nc">${escH(s.name)}</td>${cells}<td style="color:#0d9488;font-weight:600">${P}</td><td style="color:#dc2626;font-weight:600">${A}</td></tr>`;
  });
  printWin('Attendance Summary',`${hdr('Attendance Summary')}<table><thead><tr><th>#</th><th class="nc" style="min-width:140px">Name</th>${dates.map(d=>`<th style="font-size:7px">${d.slice(5)}</th>`).join('')}<th style="color:#0d9488">P</th><th style="color:#dc2626">A</th></tr></thead><tbody>${rows}</tbody></table>`);
}
function excelAtt(){
  const cd=getCD();const stu=allStu();const dates=Object.keys(cd.att).sort();
  const wb=XLSX.utils.book_new();
  const rows=stu.map((s,i)=>{let P=0,A=0,L=0;const cells=dates.map(d=>{const t=(cd.att[d]||{})[s.name]||'';if(t==='P')P++;else if(t==='A')A++;else if(t==='L')L++;return t||'';});return[i+1,s.name,...cells,P,A,L];});
  const ws=XLSX.utils.aoa_to_sheet([['#','Student',...dates,'Total P','Total A','Total L'],...rows]);
  XLSX.utils.book_append_sheet(wb,ws,'Attendance');
  XLSX.writeFile(wb,`Attendance_${APP.ac.grade.replace(/\s/g,'')}_${APP.ac.section}.xlsx`);toast('✓ Excel exported');
}
function pdfCons(){
  if(!APP.imported.length){toast('Import files first');return}
  const subjects=APP.imported.map(s=>s.subject||'?');
  const allNames=new Set();APP.imported.forEach(s=>(s.students||[]).forEach(st=>allNames.add(norm(st.name))));
  const nameArr=[...allNames].sort();const lkp={};APP.imported.forEach(s=>{lkp[s.subject]={};(s.students||[]).forEach(st=>lkp[s.subject][norm(st.name)]=st);});
  let rows='';nameArr.forEach((name,idx)=>{
    const grades=subjects.map(subj=>lkp[subj][name]?.finalGrade);const valid=grades.filter(v=>v!==null&&v!==undefined);const ga=valid.length?Math.round(valid.reduce((a,b)=>a+b,0)/valid.length):null;
    const allP=subjects.every(subj=>{const st=lkp[subj][name];return!st||!st.finalGrade||(st.finalGrade>=75)});const prom=ga!==null?(ga>=75&&allP?'PROMOTED':'RETAINED'):'';
    rows+=`<tr><td>${idx+1}</td><td class="nc">${escH(name)}</td>${grades.map(v=>`<td class="bold ${v?(v>=75?'pass':'fail'):''}">${v||'—'}</td>`).join('')}<td class="bold" style="color:#1a56db">${ga||'—'}</td><td class="${prom==='PROMOTED'?'pass':'fail'}">${prom}</td></tr>`;
  });
  printWin('Consolidated Grades',`<h1>Consolidated Grades</h1><div class="meta">${APP.ac.grade} ${APP.ac.section} · ${subjects.length} subjects · ${nameArr.length} students</div><table><thead><tr><th>#</th><th class="nc" style="min-width:140px">Name</th>${subjects.map(s=>`<th>${escH(s)}</th>`).join('')}<th>Gen. Avg</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`);
}
function excelCons(){
  if(!APP.imported.length){toast('Import files first');return}
  const subjects=APP.imported.map(s=>s.subject||'?');const allNames=new Set();APP.imported.forEach(s=>(s.students||[]).forEach(st=>allNames.add(norm(st.name))));const nameArr=[...allNames].sort();const lkp={};APP.imported.forEach(s=>{lkp[s.subject]={};(s.students||[]).forEach(st=>lkp[s.subject][norm(st.name)]=st);});
  const wb=XLSX.utils.book_new();
  const rows=nameArr.map((name,idx)=>{const grades=subjects.map(subj=>lkp[subj][name]?.finalGrade||'');const valid=grades.filter(v=>v!=='');const ga=valid.length?Math.round(valid.reduce((a,b)=>a+b,0)/valid.length):'';const allP=subjects.every(subj=>{const st=lkp[subj][name];return!st||!st.finalGrade||(st.finalGrade>=75)});return[idx+1,name,...grades,ga,ga!==''?(ga>=75&&allP?'PROMOTED':'RETAINED'):''];});
  const ws=XLSX.utils.aoa_to_sheet([['#','Name',...subjects,'General Average','Status'],...rows]);
  XLSX.utils.book_append_sheet(wb,ws,'Consolidated');
  APP.imported.forEach(s=>{const sRows=(s.students||[]).map((st,i)=>[i+1,st.name,st.quarters?.Q1||'',st.quarters?.Q2||'',st.quarters?.Q3||'',st.quarters?.Q4||'',st.finalGrade||'',st.remark||'']);XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['#','Name','Q1','Q2','Q3','Q4','Final','Remark'],...sRows]),(s.subject||'Subject').substring(0,28));});
  XLSX.writeFile(wb,`Consolidated_${APP.ac.grade.replace(/\s/g,'')}_${APP.ac.section}.xlsx`);toast('✓ Excel exported');
}

// ══════════════════════════════════════════════
// ZOOM CONTROL
// ══════════════════════════════════════════════
const ZOOM_LEVELS = [90, 100, 110, 120, 130, 140, 150];
let currentZoom = 100;

function applyZoom(level) {
  currentZoom = level;
  document.documentElement.setAttribute('data-zoom', level);
  const lbl = document.getElementById('zoomLabel');
  if (lbl) lbl.textContent = level + '%';
  try { localStorage.setItem('mendtrix_zoom', level); } catch(e) {}
}

function zoomIn() {
  const idx = ZOOM_LEVELS.indexOf(currentZoom);
  if (idx < ZOOM_LEVELS.length - 1) applyZoom(ZOOM_LEVELS[idx + 1]);
  else toast('Maximum zoom reached');
}

function zoomOut() {
  const idx = ZOOM_LEVELS.indexOf(currentZoom);
  if (idx > 0) applyZoom(ZOOM_LEVELS[idx - 1]);
  else toast('Minimum zoom reached');
}

function loadZoom() {
  try {
    const saved = localStorage.getItem('mendtrix_zoom');
    if (saved) applyZoom(parseInt(saved));
  } catch(e) {}
}

// ══════════════════════════════════════════════
// DARK MODE
// ══════════════════════════════════════════════
let darkMode = false;

function toggleDarkMode() {
  darkMode = !darkMode;
  document.body.classList.toggle('dark-mode', darkMode);
  const btn = document.getElementById('dmBtn');
  if (btn) btn.textContent = darkMode ? '☀️' : '🌙';
  try { localStorage.setItem('mendtrix_dark', darkMode ? '1' : '0'); } catch(e) {}
  toast(darkMode ? '🌙 Dark mode on' : '☀️ Light mode on');
}

function loadDarkMode() {
  try {
    const saved = localStorage.getItem('mendtrix_dark');
    if (saved === '1') {
      darkMode = true;
      document.body.classList.add('dark-mode');
      const btn = document.getElementById('dmBtn');
      if (btn) btn.textContent = '☀️';
    }
  } catch(e) {}
}

// ══════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════
function init(){
  load();
  loadZoom();
  loadDarkMode();
  if(APP.role){
  document.getElementById('roleScreen').classList.add('hidden');
  document.getElementById('app').classList.add('visible');
  document.getElementById('roleLabel').textContent=APP.role==='subject'?'Subject Teacher':'Advisory Teacher';

  if(APP.ac.grade){
    document.getElementById('csGrade').value=APP.ac.grade;
    document.getElementById('csSection').value=APP.ac.section;
    document.getElementById('csInfo').textContent=`Active: ${APP.ac.grade} – ${APP.ac.section}`;
    document.getElementById('classBadge').textContent=`${APP.ac.grade} · ${APP.ac.section}`;
  }

  renderSavedClasses();
  buildNav();
  showPage(APP.page||'recordbook');
}
  document.getElementById('mainModal').addEventListener('click',function(e){if(e.target===this)closeModal()});

  // ── Auto-export reminder on tab/window close
  window.addEventListener('beforeunload', function(e){
    if(APP.role && APP.ac.grade){
      e.preventDefault();
      e.returnValue = 'Did you export your file? Changes may be lost if not exported.';
      return e.returnValue;
    }
  });

  // ── Auto-export JSON every 15 minutes (silent background save)
  setInterval(function(){
    if(!APP.role || !APP.ac.grade || !APP.ac.section) return;
    try{
      const cd=getCD();
      if(!cd.students.male.length && !cd.students.female.length) return;
      const blob=new Blob([JSON.stringify(APP,null,2)],{type:'application/json'});
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);
      const subj=(cd.school.subject||'Class').replace(/\s+/g,'_').substring(0,15);
      a.download=`AutoSave_${subj}_${APP.ac.grade.replace(/\s/g,'')}_${APP.ac.section}.json`;
      a.click();URL.revokeObjectURL(a.href);
      toast('⏱ Auto-saved — file downloaded to your Downloads folder');
    }catch(err){console.warn('Auto-save failed:',err);}
  }, 15 * 60 * 1000); // every 15 minutes
}
init();
