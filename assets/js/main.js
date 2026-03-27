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
function qIndex(q){return {'Q1':0,'Q2':1,'Q3':2,'Q4':3}[q]??0}

// ══════════════════════════════════════════════
// APP STATE
// ══════════════════════════════════════════════
const DB_KEY='mendtrix_eclass_v7';
const EMPTY_DB={teacher:{name:'Juan Dela Cruz',school:'Mendtrix National High School',sy:'2025-2026',subject:'TLE',principal:'Maria Santos',schoolId:'123456',division:'Metro Manila',district:'District I'},classes:[],attendance:{daily:[],summary:{}},consolidated:{imports:{},advisory:null}};
let db=loadDB();
let currentRole='subject';
let currentClassId=null;
let bulkDraft={scores:{}};
let currentGSStudent=null;
let currentConsolidatedQ='Q1';
let gsTab='class';
let attMode='daily';
let currentSection=null;
let attendanceDraft={status:{},mode:'AM',date:today()};
let gradeEntryQuarter='Q1';
let bulkQuarter='Q1';
let analyticsQuarter='Q1';
let isDirty=false;
let zoomLevel=parseFloat(localStorage.getItem('mendtrix_zoom')||'1');

function ensureDOMRef(id){return document.getElementById(id)}
function byId(id){return document.getElementById(id)}
function setDirty(v=true){isDirty=v}

function makeClass(name='Grade 7 - Rizal',role='subject'){
  return {id:'cls_'+Math.random().toString(36).slice(2,9),name,role,gradeLevel:'7',section:'Rizal',subject:'TLE',students:[],setup:{wwCount:3,ptCount:2,qaCount:1,wwItems:[20,20,20],ptItems:[50,50],qaItems:[50],termWeights:{ww:30,pt:50,qa:20}},grades:{Q1:{},Q2:{},Q3:{},Q4:{}},loa:[]};
}

function makeStudent(name='Student Name',sex='M'){return {id:'stu_'+Math.random().toString(36).slice(2,9),name,sex,lrn:'',remarks:''}}

function ensureClassShape(c){
  c.students ||= [];
  c.setup ||= {wwCount:3,ptCount:2,qaCount:1,wwItems:[20,20,20],ptItems:[50,50],qaItems:[50],termWeights:{ww:30,pt:50,qa:20}};
  c.setup.termWeights ||= {ww:30,pt:50,qa:20};
  c.grades ||= {Q1:{},Q2:{},Q3:{},Q4:{}};
  ['Q1','Q2','Q3','Q4'].forEach(q=>{c.grades[q] ||= {}});
  c.loa ||= [];
  c.role ||= 'subject';
}

function loadDB(){
  try{
    const raw=localStorage.getItem(DB_KEY);
    const parsed=raw?JSON.parse(raw):structuredClone(EMPTY_DB);
    parsed.classes ||= [];
    parsed.teacher ||= structuredClone(EMPTY_DB.teacher);
    parsed.attendance ||= {daily:[],summary:{}};
    parsed.consolidated ||= {imports:{},advisory:null};
    parsed.classes.forEach(ensureClassShape);
    return parsed;
  }catch(e){
    console.error(e);
    return structuredClone(EMPTY_DB);
  }
}

function saveDB(){
  localStorage.setItem(DB_KEY,JSON.stringify(db));
  setDirty(false);
}

function currentClass(){
  return db.classes.find(c=>c.id===currentClassId)||null;
}

function ensureStudentQuarter(qRec, studentId, setup){
  qRec[studentId] ||= {ww:Array(setup.wwCount).fill(null),pt:Array(setup.ptCount).fill(null),qa:Array(setup.qaCount).fill(null),initial:null,quarterly:null};
  qRec[studentId].ww ||= Array(setup.wwCount).fill(null);
  qRec[studentId].pt ||= Array(setup.ptCount).fill(null);
  qRec[studentId].qa ||= Array(setup.qaCount).fill(null);
  while(qRec[studentId].ww.length<setup.wwCount) qRec[studentId].ww.push(null);
  while(qRec[studentId].pt.length<setup.ptCount) qRec[studentId].pt.push(null);
  while(qRec[studentId].qa.length<setup.qaCount) qRec[studentId].qa.push(null);
  return qRec[studentId];
}

function visibleStudents(c, quarter=null){
  const q=quarter||gradeEntryQuarter;
  return c.students.filter(s=>!isStudentOnLOA(c,s.id,q));
}

function isStudentOnLOA(c,studentId,quarter){
  return (c.loa||[]).some(r=>r.studentId===studentId && r.quarter===quarter && r.active!==false);
}

function calcComponent(scores, items){
  if(!scores || !items || !items.length) return null;
  let total=0, max=0;
  for(let i=0;i<items.length;i++){
    const item=Number(items[i])||0;
    const score=scores[i];
    if(score===null||score===''||typeof score==='undefined') continue;
    total += Number(score)||0;
    max += item;
  }
  if(max<=0) return null;
  return (total/max)*100;
}

function calcQ(c, studentId, q){
  const qRec=c.grades[q]||{};
  const rec=ensureStudentQuarter(qRec,studentId,c.setup);
  const ww=calcComponent(rec.ww,c.setup.wwItems);
  const pt=calcComponent(rec.pt,c.setup.ptItems);
  const qa=calcComponent(rec.qa,c.setup.qaItems);
  if([ww,pt,qa].some(v=>v===null)){
    rec.initial=null;
    rec.quarterly=null;
    return {ww,pt,qa,initial:null,quarterly:null};
  }
  const tw=c.setup.termWeights||{ww:30,pt:50,qa:20};
  const initial=(ww*(tw.ww/100))+(pt*(tw.pt/100))+(qa*(tw.qa/100));
  const quarterly=transmute(initial);
  rec.initial=r2(initial);
  rec.quarterly=quarterly;
  return {ww:r2(ww),pt:r2(pt),qa:r2(qa),initial:r2(initial),quarterly};
}

function averageQuarterly(c, studentId){
  const vals=['Q1','Q2','Q3','Q4'].map(q=>calcQ(c,studentId,q).quarterly).filter(v=>v!==null);
  if(vals.length!==4) return null;
  return Math.round(vals.reduce((a,b)=>a+b,0)/4);
}

function showToast(msg='Saved', kind='ok'){
  const t=byId('toast');
  if(!t) return;
  t.textContent=msg;
  t.className='toast show '+kind;
  setTimeout(()=>t.className='toast',1800);
}

function switchRole(role){
  currentRole=role;
  document.querySelectorAll('.role-btn').forEach(b=>b.classList.toggle('active',b.dataset.role===role));
  renderClassSelector();
  renderNav();
  renderActiveView();
}

function renderNav(){
  const nav=byId('navMenu');
  if(!nav) return;
  const items=[
    ['record-book','Record Book'],
    ['grade-summary','Grade Summary'],
    ['attendance-summary','Attendance Summary'],
    ['daily-attendance','Daily Attendance']
  ];
  if(currentRole==='advisory') items.push(['consolidated-grades','Consolidated Grades']);
  nav.innerHTML=items.map(([id,label])=>`<button class="nav-btn" onclick="openPage('${id}')">${label}</button>`).join('');
}

function openPage(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  byId(id)?.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.getAttribute('onclick')===`openPage('${id}')`));
  renderActiveView();
}

function renderActiveView(){
  if(byId('record-book')?.classList.contains('active')) renderRecordBook();
  if(byId('grade-summary')?.classList.contains('active')) renderGradeSummary();
  if(byId('attendance-summary')?.classList.contains('active')) renderAttendanceSummary();
  if(byId('daily-attendance')?.classList.contains('active')) renderDailyAttendance();
  if(byId('consolidated-grades')?.classList.contains('active')) renderConsolidatedGrades();
}

function renderClassSelector(){
  const sel=byId('classSelector');
  if(!sel) return;
  const classes=db.classes.filter(c=>c.role===currentRole);
  if(!classes.length){
    currentClassId=null;
    sel.innerHTML='<option value="">No classes yet</option>';
    return;
  }
  if(!classes.some(c=>c.id===currentClassId)) currentClassId=classes[0].id;
  sel.innerHTML=classes.map(c=>`<option value="${c.id}" ${c.id===currentClassId?'selected':''}>${escH(c.name)}</option>`).join('');
}

function onClassChange(v){ currentClassId=v; renderActiveView(); }

function addClass(){
  const role=currentRole;
  const c=makeClass(role==='advisory'?'Grade 7 - Advisory':'Grade 7 - Section A', role);
  db.classes.push(c);
  currentClassId=c.id;
  saveDB();
  renderClassSelector();
  renderActiveView();
  showToast('Class added');
}

function deleteCurrentClass(){
  const c=currentClass();
  if(!c) return;
  if(!confirm(`Delete class ${c.name}?`)) return;
  db.classes=db.classes.filter(x=>x.id!==c.id);
  currentClassId=db.classes.find(x=>x.role===currentRole)?.id||null;
  saveDB();
  renderClassSelector();
  renderActiveView();
  showToast('Class deleted');
}

function renderRecordBook(){
  renderSetup();
  renderGradeEntry();
  renderBulkEntry();
  renderSummary();
  renderAnalytics();
}

function renderSetup(){
  const c=currentClass(), wrap=byId('setupWrap');
  if(!wrap) return;
  if(!c){wrap.innerHTML='<div class="empty">No class selected.</div>'; return;}
  wrap.innerHTML=`
    <div class="card">
      <div class="grid2">
        <label>Class Name<input value="${escH(c.name)}" onchange="updateClassField('name', this.value)"></label>
        <label>Subject<input value="${escH(c.subject||'')}" onchange="updateClassField('subject', this.value)"></label>
        <label>Grade Level<input value="${escH(c.gradeLevel||'')}" onchange="updateClassField('gradeLevel', this.value)"></label>
        <label>Section<input value="${escH(c.section||'')}" onchange="updateClassField('section', this.value)"></label>
      </div>
      <div class="grid3 mt12">
        <label>Written Works Count<input type="number" min="1" value="${c.setup.wwCount}" onchange="updateCount('ww', this.value)"></label>
        <label>Performance Tasks Count<input type="number" min="1" value="${c.setup.ptCount}" onchange="updateCount('pt', this.value)"></label>
        <label>Quarterly Assessment Count<input type="number" min="1" value="${c.setup.qaCount}" onchange="updateCount('qa', this.value)"></label>
      </div>
      <div class="grid3 mt12">
        <label>WW Weight %<input type="number" value="${c.setup.termWeights.ww}" onchange="updateWeight('ww', this.value)"></label>
        <label>PT Weight %<input type="number" value="${c.setup.termWeights.pt}" onchange="updateWeight('pt', this.value)"></label>
        <label>QA Weight %<input type="number" value="${c.setup.termWeights.qa}" onchange="updateWeight('qa', this.value)"></label>
      </div>
      <div class="mt12">
        <h4>Students</h4>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Sex</th><th>LRN</th><th></th></tr></thead>
            <tbody>
              ${c.students.map((s,i)=>`<tr>
                <td><input value="${escH(s.name)}" onchange="updateStudent(${i},'name',this.value)"></td>
                <td><select onchange="updateStudent(${i},'sex',this.value)"><option ${s.sex==='M'?'selected':''}>M</option><option ${s.sex==='F'?'selected':''}>F</option></select></td>
                <td><input value="${escH(s.lrn||'')}" onchange="updateStudent(${i},'lrn',this.value)"></td>
                <td><button class="danger" onclick="removeStudent(${i})">Remove</button></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <button onclick="addStudent()">Add Student</button>
        <button onclick="saveSetup()">Save Setup</button>
      </div>
    </div>`;
}

function updateClassField(key,val){ const c=currentClass(); if(!c) return; c[key]=val; setDirty(); }
function updateCount(type,val){
  const c=currentClass(); if(!c) return;
  const n=Math.max(1,Number(val)||1);
  c.setup[type+'Count']=n;
  const arrKey=type+'Items';
  c.setup[arrKey] ||= [];
  while(c.setup[arrKey].length<n) c.setup[arrKey].push( type==='ww'?20:50 );
  c.setup[arrKey]=c.setup[arrKey].slice(0,n);
  ['Q1','Q2','Q3','Q4'].forEach(q=>{
    const qRec=c.grades[q]||{};
    c.students.forEach(s=>{
      const rec=ensureStudentQuarter(qRec,s.id,c.setup);
      rec[type]=rec[type].slice(0,n);
      while(rec[type].length<n) rec[type].push(null);
    });
  });
  setDirty(); renderSetup();
}
function updateWeight(type,val){ const c=currentClass(); if(!c) return; c.setup.termWeights[type]=Number(val)||0; setDirty(); }
function updateStudent(i,key,val){ const c=currentClass(); if(!c) return; c.students[i][key]=val; setDirty(); }
function addStudent(){ const c=currentClass(); if(!c) return; c.students.push(makeStudent(`Student ${c.students.length+1}`,'M')); setDirty(); renderSetup(); }
function removeStudent(i){ const c=currentClass(); if(!c) return; c.students.splice(i,1); setDirty(); renderSetup(); }
function saveSetup(){ saveDB(); renderClassSelector(); showToast('Setup saved'); }

function renderGradeEntry(){
  const c=currentClass(), wrap=byId('gradeEntryWrap');
  if(!wrap) return;
  if(!c){wrap.innerHTML=''; return;}
  const studs=visibleStudents(c, gradeEntryQuarter);
  const qRec=c.grades[gradeEntryQuarter]||{};
  wrap.innerHTML=`
    <div class="card">
      <div class="toolbar">
        <select onchange="gradeEntryQuarter=this.value; renderGradeEntry()">
          ${['Q1','Q2','Q3','Q4'].map(q=>`<option ${q===gradeEntryQuarter?'selected':''}>${q}</option>`).join('')}
        </select>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th rowspan="2">Student</th>
              <th colspan="${c.setup.wwCount}">WW</th>
              <th colspan="${c.setup.ptCount}">PT</th>
              <th colspan="${c.setup.qaCount}">QA</th>
              <th rowspan="2">Quarterly</th>
            </tr>
            <tr>
              ${c.setup.wwItems.map((_,i)=>`<th>WW${i+1}</th>`).join('')}
              ${c.setup.ptItems.map((_,i)=>`<th>PT${i+1}</th>`).join('')}
              ${c.setup.qaItems.map((_,i)=>`<th>QA${i+1}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${studs.map(s=>{
              const rec=ensureStudentQuarter(qRec,s.id,c.setup);
              const q=calcQ(c,s.id,gradeEntryQuarter);
              return `<tr>
                <td>${escH(s.name)}</td>
                ${rec.ww.map((v,i)=>`<td><input type="number" value="${v??''}" onchange="setScore('${s.id}','${gradeEntryQuarter}','ww',${i},this.value)"></td>`).join('')}
                ${rec.pt.map((v,i)=>`<td><input type="number" value="${v??''}" onchange="setScore('${s.id}','${gradeEntryQuarter}','pt',${i},this.value)"></td>`).join('')}
                ${rec.qa.map((v,i)=>`<td><input type="number" value="${v??''}" onchange="setScore('${s.id}','${gradeEntryQuarter}','qa',${i},this.value)"></td>`).join('')}
                <td>${q.quarterly??'-'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <button onclick="saveGradeEntry()">Save Grades</button>
    </div>`;
}

function setScore(studentId,q,type,index,val){
  const c=currentClass(); if(!c) return;
  const rec=ensureStudentQuarter(c.grades[q],studentId,c.setup);
  rec[type][index]=val===''?null:Number(val);
  setDirty();
  renderGradeEntry();
}
function saveGradeEntry(){ saveDB(); renderSummary(); renderAnalytics(); showToast('Grades saved'); }

function renderBulkEntry(){
  const c=currentClass(), wrap=byId('bulkEntryWrap');
  if(!wrap) return;
  if(!c){wrap.innerHTML=''; return;}
  const category = byId('bulkCategory')?.value || 'WW';
  const item = Number(byId('bulkItem')?.value || 1)-1;
  const studs=visibleStudents(c, bulkQuarter);
  wrap.innerHTML=`
    <div class="card">
      <div class="toolbar bulk-toolbar">
        <select id="bulkQuarter" onchange="bulkQuarter=this.value; renderBulkEntry()">
          ${['Q1','Q2','Q3','Q4'].map(q=>`<option ${q===bulkQuarter?'selected':''}>${q}</option>`).join('')}
        </select>
        <select id="bulkCategory" onchange="renderBulkEntry()">
          ${['WW','PT','QA'].map(x=>`<option ${x===category?'selected':''}>${x}</option>`).join('')}
        </select>
        <select id="bulkItem" onchange="renderBulkEntry()">
          ${Array.from({length:c.setup[category.toLowerCase()+'Count']},(_,i)=>`<option value="${i+1}" ${i===item?'selected':''}>${category}${i+1}</option>`).join('')}
        </select>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Student</th><th>Score</th></tr></thead>
          <tbody>
            ${studs.map(s=>{
              const rec=ensureStudentQuarter(c.grades[bulkQuarter],s.id,c.setup);
              const key=category.toLowerCase();
              const currentVal=(rec[key]||[])[item];
              return `<tr><td>${escH(s.name)}</td><td><input type="number" value="${currentVal??''}" onchange="setBulkScore('${s.id}', this.value)"></td></tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <button onclick="saveBulk()">Save Grades</button>
    </div>`;
}

function setBulkScore(studentId,val){ bulkDraft.scores[studentId]=val===''?null:Number(val); }
function saveBulk(){
  const c=currentClass(); if(!c) return;
  const category = (byId('bulkCategory')?.value || 'WW').toLowerCase();
  const item = Number(byId('bulkItem')?.value || 1)-1;
  const q = byId('bulkQuarter')?.value || bulkQuarter;
  const qRec = c.grades[q] || (c.grades[q] = {});

  visibleStudents(c, q).forEach(s=>{
    const rec = ensureStudentQuarter(qRec, s.id, c.setup);
    if(Array.isArray(rec[category]) && Object.prototype.hasOwnProperty.call(bulkDraft.scores, s.id)){
      rec[category][item] = bulkDraft.scores[s.id];
    }
  });

  bulkDraft = {scores:{}};
  saveDB();
  renderBulkEntry();
  renderGradeEntry();
  renderSummary();
  renderAnalytics();
  showToast('Bulk grades saved');
}

function renderSummary(){
  const c=currentClass(), wrap=byId('summaryWrap');
  if(!wrap) return;
  if(!c){wrap.innerHTML=''; return;}
  const rows=visibleStudents(c,gradeEntryQuarter).map(s=>{
    const q1=calcQ(c,s.id,'Q1').quarterly;
    const q2=calcQ(c,s.id,'Q2').quarterly;
    const q3=calcQ(c,s.id,'Q3').quarterly;
    const q4=calcQ(c,s.id,'Q4').quarterly;
    const final=averageQuarterly(c,s.id);
    return `<tr><td>${escH(s.name)}</td><td>${q1??'-'}</td><td>${q2??'-'}</td><td>${q3??'-'}</td><td>${q4??'-'}</td><td>${final??'-'}</td></tr>`;
  }).join('');
  wrap.innerHTML=`<div class="card"><div class="table-wrap"><table><thead><tr><th>Student</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Final</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function getAnalyticsValue(c,s,selectedQ){
  if(selectedQ==='ALL'){
    const vals=['Q1','Q2','Q3','Q4'].map(q=>calcQ(c,s.id,q).quarterly);
    if(vals.some(v=>v===null)) return null;
    return Math.round(vals.reduce((a,b)=>a+b,0)/4);
  }
  return calcQ(c,s.id,selectedQ).quarterly;
}

function renderAnalytics(){
  const c=currentClass(), wrap=byId('analyticsWrap');
  if(!wrap) return;
  if(!c){wrap.innerHTML=''; return;}
  const selectedQ = analyticsQuarter==='All Quarters' ? 'ALL' : analyticsQuarter;
  const studs = visibleStudents(c, selectedQ==='ALL'?null: selectedQ);

  const bands=[
    {label:'Below 75', min:-Infinity, max:74},
    {label:'75 to 80', min:75, max:80},
    {label:'81 to 85', min:81, max:85},
    {label:'86 to 90', min:86, max:90},
    {label:'91 to 95', min:91, max:95},
    {label:'96 to 100', min:96, max:100}
  ];

  const stuWithGrade=[];
  const stuMissing=[];
  studs.forEach(s=>{
    const val=getAnalyticsValue(c,s,selectedQ);
    if(val===null) stuMissing.push({student:s, value:null});
    else stuWithGrade.push({student:s, value:val});
  });

  const totals = bands.map(b=>({
    ...b,
    count: stuWithGrade.filter(x=>x.value>=b.min && x.value<=b.max).length,
    students: stuWithGrade.filter(x=>x.value>=b.min && x.value<=b.max)
  }));

  wrap.innerHTML=`
    <div class="card">
      <div class="toolbar">
        <select onchange="analyticsQuarter=this.value; renderAnalytics()">
          ${['Q1','Q2','Q3','Q4','All Quarters'].map(q=>`<option ${q===analyticsQuarter?'selected':''}>${q}</option>`).join('')}
        </select>
      </div>

      <div class="analytics-grid">
        ${totals.map(b=>`
          <button class="analytic-box" onclick="showBandStudents('${b.label.replace(/'/g,"\\'")}')">
            <div class="analytic-label">${b.label}</div>
            <div class="analytic-value">${b.count}</div>
          </button>`).join('')}
        <button class="analytic-box missing" onclick="toggleMissingStudents()">
          <div class="analytic-label">Missing Grades</div>
          <div class="analytic-value">${stuMissing.length}</div>
        </button>
      </div>

      <div id="missingStudentsBox" class="mt12" style="display:${stuMissing.length?'block':'none'}">
        <h4>Students with Missing Grades</h4>
        ${stuMissing.length ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Student</th><th>Action</th></tr></thead>
              <tbody>
                ${stuMissing.map(x=>`<tr><td>${escH(x.student.name)}</td><td><button onclick="goToMissingStudent('${x.student.id}')">Go to Student</button></td></tr>`).join('')}
              </tbody>
            </table>
          </div>` : `<div class="empty">No missing grades.</div>`}
      </div>

      <div class="mt12">
        <button onclick="toggleAnalStudentList()">Toggle Student Grade List</button>
      </div>
      <div id="analStudentList" class="mt12" style="display:none">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Student</th><th>${selectedQ==='ALL'?'Average':'Quarterly Grade'}</th></tr></thead>
            <tbody>
              ${studs.map(s=>{
                const val=getAnalyticsValue(c,s,selectedQ);
                return `<tr><td>${escH(s.name)}</td><td>${val??'Missing'}</td></tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;

  window.__analyticsBandMap = Object.fromEntries(totals.map(t=>[t.label,t.students]));
  window.__analyticsMissing = stuMissing;
}

function toggleMissingStudents(){
  const box=byId('missingStudentsBox');
  if(!box) return;
  box.style.display = box.style.display==='none' ? 'block' : 'none';
}
function toggleAnalStudentList(){
  const box=byId('analStudentList');
  if(!box) return;
  box.style.display = box.style.display==='none' ? 'block' : 'none';
}
function showBandStudents(label){
  const rows=(window.__analyticsBandMap?.[label]||[]).map(x=>`<tr><td>${escH(x.student.name)}</td><td>${x.value}</td></tr>`).join('') || `<tr><td colspan="2">No students</td></tr>`;
  const modal=byId('bandModal');
  const body=byId('bandModalBody');
  if(!modal||!body) return;
  body.innerHTML=`<h3>${escH(label)}</h3><div class="table-wrap"><table><thead><tr><th>Student</th><th>Grade</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  modal.style.display='flex';
}
function closeBandModal(){ const modal=byId('bandModal'); if(modal) modal.style.display='none'; }
function goToMissingStudent(studentId){
  openPage('record-book');
  const gradeTabBtn = document.querySelector('[data-tab="grade-entry"]');
  gradeTabBtn?.click();
  const row = [...document.querySelectorAll('#gradeEntryWrap tbody tr')].find(tr=>tr.firstElementChild?.textContent?.trim() && currentClass()?.students.find(s=>s.id===studentId && s.name===tr.firstElementChild.textContent.trim()));
  row?.scrollIntoView({behavior:'smooth', block:'center'});
}

function renderGradeSummary(){
  const c=currentClass(), wrap=byId('gradeSummaryWrap');
  if(!wrap) return;
  if(!c){wrap.innerHTML='<div class="empty">No class selected.</div>'; return;}
  const visible = visibleStudents(c);
  wrap.innerHTML=`
    <div class="card">
      <div class="tabs">
        <button class="tab-btn ${gsTab==='class'?'active':''}" onclick="gsTab='class'; renderGradeSummary()">Class Summary</button>
        <button class="tab-btn ${gsTab==='loa'?'active':''}" onclick="gsTab='loa'; renderGradeSummary()">LOA Overview</button>
        <button class="tab-btn ${gsTab==='student'?'active':''}" onclick="gsTab='student'; renderGradeSummary()">Student Detail</button>
      </div>
      ${gsTab==='class' ? `
        <div class="table-wrap mt12">
          <table>
            <thead><tr><th>Student</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Final</th></tr></thead>
            <tbody>
              ${visible.map(s=>`<tr><td>${escH(s.name)}</td><td>${calcQ(c,s.id,'Q1').quarterly??'-'}</td><td>${calcQ(c,s.id,'Q2').quarterly??'-'}</td><td>${calcQ(c,s.id,'Q3').quarterly??'-'}</td><td>${calcQ(c,s.id,'Q4').quarterly??'-'}</td><td>${averageQuarterly(c,s.id)??'-'}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
      ${gsTab==='loa' ? renderLOAOverviewHTML(c) : ''}
      ${gsTab==='student' ? renderStudentDetailHTML(c) : ''}
    </div>`;
}

function renderLOAOverviewHTML(c){
  const active=(c.loa||[]).filter(r=>r.active!==false);
  return `<div class="mt12 table-wrap"><table><thead><tr><th>Student</th><th>Quarter</th><th>Reason</th></tr></thead><tbody>${active.map(r=>`<tr><td>${escH(c.students.find(s=>s.id===r.studentId)?.name||'')}</td><td>${r.quarter}</td><td>${escH(r.reason||'')}</td></tr>`).join('')||'<tr><td colspan="3">No LOA records.</td></tr>'}</tbody></table></div>`;
}

function renderStudentDetailHTML(c){
  const student=currentGSStudent ? c.students.find(s=>s.id===currentGSStudent) : c.students[0];
  if(!student) return '<div class="empty mt12">No students.</div>';
  currentGSStudent=student.id;
  return `
    <div class="mt12">
      <select onchange="currentGSStudent=this.value; renderGradeSummary()">
        ${c.students.map(s=>`<option value="${s.id}" ${s.id===student.id?'selected':''}>${escH(s.name)}</option>`).join('')}
      </select>
      <div class="table-wrap mt12">
        <table>
          <thead><tr><th>Quarter</th><th>Grade</th><th>Action</th></tr></thead>
          <tbody>
            ${['Q1','Q2','Q3','Q4'].map(q=>`<tr><td>${q}</td><td>${calcQ(c,student.id,q).quarterly??'-'}</td><td><button onclick="editStudentQuarter('${student.id}','${q}')">Show Detail</button></td></tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div id="studentQuarterDetail" class="mt12"></div>
    </div>`;
}

function editStudentQuarter(studentId,q){
  const c=currentClass(), box=byId('studentQuarterDetail');
  if(!c||!box) return;
  const rec=ensureStudentQuarter(c.grades[q],studentId,c.setup);
  box.innerHTML=`
    <div class="card">
      <h4>Edit ${q}</h4>
      <div class="grid3">
        <div>${rec.ww.map((v,i)=>`<label>WW${i+1}<input type="number" value="${v??''}" onchange="setStudentQuarterValue('${studentId}','${q}','ww',${i},this.value)"></label>`).join('')}</div>
        <div>${rec.pt.map((v,i)=>`<label>PT${i+1}<input type="number" value="${v??''}" onchange="setStudentQuarterValue('${studentId}','${q}','pt',${i},this.value)"></label>`).join('')}</div>
        <div>${rec.qa.map((v,i)=>`<label>QA${i+1}<input type="number" value="${v??''}" onchange="setStudentQuarterValue('${studentId}','${q}','qa',${i},this.value)"></label>`).join('')}</div>
      </div>
      <button onclick="saveDB(); renderGradeSummary(); renderGradeEntry(); renderSummary(); renderAnalytics(); showToast('Student updated')">Save</button>
    </div>`;
}
function setStudentQuarterValue(studentId,q,type,index,val){ const c=currentClass(); if(!c) return; const rec=ensureStudentQuarter(c.grades[q],studentId,c.setup); rec[type][index]=val===''?null:Number(val); setDirty(); }

function renderDailyAttendance(){
  const c=currentClass(), wrap=byId('dailyAttendanceWrap');
  if(!wrap) return;
  if(!c){wrap.innerHTML=''; return;}
  const date=attendanceDraft.date||today();
  const mode=attendanceDraft.mode||'AM';
  const key=`${c.id}_${date}_${mode}`;
  const record=db.attendance.daily.find(x=>x.key===key)||{status:{}};
  wrap.innerHTML=`
    <div class="card">
      <div class="toolbar">
        <input type="date" value="${date}" onchange="attendanceDraft.date=this.value; renderDailyAttendance()">
        <select onchange="attendanceDraft.mode=this.value; renderDailyAttendance()"><option ${mode==='AM'?'selected':''}>AM</option><option ${mode==='PM'?'selected':''}>PM</option></select>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Student</th><th>Status</th></tr></thead><tbody>
          ${c.students.map(s=>`<tr><td>${escH(s.name)}</td><td><select onchange="setAttendance('${s.id}',this.value)"><option value="P" ${(record.status[s.id]||'P')==='P'?'selected':''}>Present</option><option value="A" ${(record.status[s.id]||'P')==='A'?'selected':''}>Absent</option><option value="L" ${(record.status[s.id]||'P')==='L'?'selected':''}>Late</option></select></td></tr>`).join('')}
        </tbody></table>
      </div>
      <button onclick="saveAttendance()">Save Attendance</button>
    </div>`;
}
function setAttendance(studentId,val){ attendanceDraft.status[studentId]=val; }
function saveAttendance(){
  const c=currentClass(); if(!c) return;
  const date=attendanceDraft.date||today();
  const mode=attendanceDraft.mode||'AM';
  const key=`${c.id}_${date}_${mode}`;
  const idx=db.attendance.daily.findIndex(x=>x.key===key);
  const payload={key,classId:c.id,date,mode,status:{...attendanceDraft.status}};
  if(idx>=0) db.attendance.daily[idx]=payload; else db.attendance.daily.push(payload);
  saveDB(); renderAttendanceSummary(); showToast('Attendance saved');
}

function renderAttendanceSummary(){
  const c=currentClass(), wrap=byId('attendanceSummaryWrap');
  if(!wrap) return;
  if(!c){wrap.innerHTML=''; return;}
  const rows=c.students.map(s=>{
    const recs=db.attendance.daily.filter(d=>d.classId===c.id);
    let p=0,a=0,l=0;
    recs.forEach(r=>{const st=r.status[s.id]||'P'; if(st==='P')p++; else if(st==='A')a++; else if(st==='L')l++;});
    return `<tr><td>${escH(s.name)}</td><td>${p}</td><td>${a}</td><td>${l}</td></tr>`;
  }).join('');
  wrap.innerHTML=`<div class="card"><div class="table-wrap"><table><thead><tr><th>Student</th><th>Present</th><th>Absent</th><th>Late</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function renderConsolidatedGrades(){
  const wrap=byId('consolidatedWrap');
  if(!wrap) return;
  const advisoryClasses=db.classes.filter(c=>c.role==='advisory');
  const advisory=advisoryClasses.find(c=>c.id===db.consolidated.advisory) || advisoryClasses[0] || null;
  if(advisory) db.consolidated.advisory=advisory.id;
  const imports=db.consolidated.imports||{};

  wrap.innerHTML=`
    <div class="card">
      <div class="toolbar">
        <select onchange="setConsolidatedAdvisory(this.value)">
          ${advisoryClasses.map(c=>`<option value="${c.id}" ${advisory?.id===c.id?'selected':''}>${escH(c.name)}</option>`).join('')}
        </select>
        <select onchange="currentConsolidatedQ=this.value; renderConsolidatedGrades()">
          ${['Q1','Q2','Q3','Q4'].map(q=>`<option ${currentConsolidatedQ===q?'selected':''}>${q}</option>`).join('')}
        </select>
        <input type="file" id="consolidatedFile" accept=".json" onchange="importConsolidatedFile(event)">
      </div>
      ${advisory ? renderConsolidatedTableHTML(advisory, imports, currentConsolidatedQ) : '<div class="empty mt12">No advisory class found.</div>'}
    </div>`;
}

function setConsolidatedAdvisory(id){ db.consolidated.advisory=id; saveDB(); renderConsolidatedGrades(); }

function importConsolidatedFile(ev){
  const file=ev.target.files?.[0];
  if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const json=JSON.parse(reader.result);
      const key=json.classId || file.name;
      db.consolidated.imports[key]=json;
      saveDB();
      renderConsolidatedGrades();
      showToast('JSON imported');
    }catch(e){ alert('Invalid JSON file'); }
  };
  reader.readAsText(file);
}

function renderConsolidatedTableHTML(advisory, imports, q){
  const importList=Object.values(imports);
  const subjects=importList.map(x=>x.subject||x.className||'Subject');
  const body=advisory.students.map(s=>{
    const grades=importList.map(imp=>findImportedGrade(imp,s.name,q));
    const nums=grades.filter(v=>v!==null);
    const avg=nums.length?Math.round(nums.reduce((a,b)=>a+b,0)/nums.length):null;
    return `<tr><td>${escH(s.name)}</td>${grades.map(v=>`<td>${v??'-'}</td>`).join('')}<td>${avg??'-'}</td></tr>`;
  }).join('');
  return `<div class="table-wrap mt12"><table><thead><tr><th>Student</th>${subjects.map(s=>`<th>${escH(s)}</th>`).join('')}<th>Average</th></tr></thead><tbody>${body||'<tr><td colspan="99">No imported records.</td></tr>'}</tbody></table></div>`;
}

function findImportedGrade(imp, studentName, q){
  const key=norm(studentName);
  if(Array.isArray(imp.students)){
    const found=imp.students.find(s=>norm(s.name)===key);
    return found?.grades?.[q] ?? null;
  }
  return imp.grades?.[key]?.[q] ?? null;
}

function exportPDF(){ window.print(); }
function exportExcel(){ showToast('Excel export not available in this patch build','warn'); }
function exportJSON(){
  const c=currentClass(); if(!c) return;
  const payload={classId:c.id,className:c.name,subject:c.subject,students:c.students.map(s=>({name:s.name,grades:{Q1:calcQ(c,s.id,'Q1').quarterly,Q2:calcQ(c,s.id,'Q2').quarterly,Q3:calcQ(c,s.id,'Q3').quarterly,Q4:calcQ(c,s.id,'Q4').quarterly}}))};
  downloadBlob(JSON.stringify(payload,null,2),`${c.name.replace(/\s+/g,'_')}.json`,'application/json');
}
function exportLOAExcel(){ showToast('LOA export not available in this patch build','warn'); }

function downloadBlob(content, filename, type){
  const blob=new Blob([content],{type});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),500);
}

function saveToFile(){
  downloadBlob(JSON.stringify(db,null,2),`mendtrix-backup-${today()}.json`,'application/json');
}
function importFile(ev){
  const file=ev.target.files?.[0];
  if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      db=JSON.parse(reader.result);
      db.classes.forEach(ensureClassShape);
      saveDB(); renderClassSelector(); renderActiveView(); showToast('Backup imported');
    }catch(e){ alert('Invalid backup file'); }
  };
  reader.readAsText(file);
}

function resetAll(){ if(confirm('Reset all data?')){ db=structuredClone(EMPTY_DB); saveDB(); currentClassId=null; renderClassSelector(); renderActiveView(); showToast('Data reset'); } }
function toggleDarkMode(){ document.body.classList.toggle('dark'); localStorage.setItem('mendtrix_dark', document.body.classList.contains('dark')?'1':'0'); }
function applyZoom(){ document.documentElement.style.setProperty('--zoom', zoomLevel); document.body.style.zoom=zoomLevel; localStorage.setItem('mendtrix_zoom', String(zoomLevel)); }
function zoomIn(){ zoomLevel=Math.min(1.5, r2(zoomLevel+0.1)); applyZoom(); }
function zoomOut(){ zoomLevel=Math.max(0.8, r2(zoomLevel-0.1)); applyZoom(); }

function init(){
  if(localStorage.getItem('mendtrix_dark')==='1') document.body.classList.add('dark');
  applyZoom();
  renderClassSelector();
  renderNav();
  if(!currentClassId){ const cls=db.classes.find(c=>c.role===currentRole)||db.classes[0]; if(cls) currentClassId=cls.id; }
  openPage('record-book');
  setInterval(()=>{ if(isDirty) saveDB(); }, 15000);
  window.addEventListener('beforeunload', (e)=>{ if(isDirty){ e.preventDefault(); e.returnValue=''; } });
}

document.addEventListener('DOMContentLoaded', init);

// expose
Object.assign(window, {
  switchRole, openPage, onClassChange, addClass, deleteCurrentClass,
  updateClassField, updateCount, updateWeight, updateStudent, addStudent, removeStudent, saveSetup,
  setScore, saveGradeEntry, setBulkScore, saveBulk,
  toggleMissingStudents, toggleAnalStudentList, showBandStudents, closeBandModal, goToMissingStudent,
  editStudentQuarter, setStudentQuarterValue,
  setAttendance, saveAttendance,
  setConsolidatedAdvisory, importConsolidatedFile,
  exportPDF, exportExcel, exportJSON, exportLOAExcel,
  saveToFile, importFile, resetAll, toggleDarkMode, zoomIn, zoomOut
});
