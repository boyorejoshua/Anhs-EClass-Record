/* ================================================================
   ANHS E-CLASS RECORD SYSTEM — SUPABASE PHASE 2 CLIENT
   assets/js/supabase.js
   ================================================================

   HOW TO ACTIVATE PHASE 2:
   1. Create a Supabase project at https://supabase.com
   2. Run supabase_schema.sql in your SQL Editor
   3. Replace SUPABASE_URL and SUPABASE_ANON_KEY below
   4. Add this script to index.html BEFORE main.js:
      <script src="assets/js/supabase.js"></script>
   5. Set PHASE2_ENABLED = true below
   6. Deploy to Vercel — done!

   ================================================================ */

// ── CONFIG ──────────────────────────────────────────────────────
const PHASE2_ENABLED = false;  // ← Set to TRUE when Supabase is ready

const SUPABASE_URL  = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON = 'YOUR_ANON_KEY_HERE';
// ──────────────────────────────────────────────────────────────

// Supabase CDN client (add to index.html head if using Phase 2):
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>

let supabase = null;

if (PHASE2_ENABLED && typeof window !== 'undefined' && window.supabase) {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  console.log('[Phase 2] Supabase connected');
}

// ════════════════════════════════════════════════════════════════
// AUTH — Replace localStorage auth with Supabase Auth
// ════════════════════════════════════════════════════════════════

async function supaLogin(empId, password) {
  if (!supabase) return null;
  // We use email format: empId@anhs.edu.ph
  const email = `${empId.toLowerCase()}@anhs.edu.ph`;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  // Fetch teacher profile
  const { data: profile } = await supabase
    .from('teacher_profiles')
    .select('*')
    .eq('id', data.user.id)
    .single();
  return profile;
}

async function supaRegister(empId, password, profileData) {
  if (!supabase) return null;
  const email = `${empId.toLowerCase()}@anhs.edu.ph`;
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  // Create teacher profile
  const { data: profile, error: pErr } = await supabase
    .from('teacher_profiles')
    .insert({ id: data.user.id, emp_id: empId, ...profileData })
    .select()
    .single();
  if (pErr) throw new Error(pErr.message);
  return profile;
}

async function supaLogout() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

async function supaGetSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// ════════════════════════════════════════════════════════════════
// CLASSES — Create / load teacher classes
// ════════════════════════════════════════════════════════════════

async function supaCreateClass(teacherId, classData) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('classes')
    .upsert({
      teacher_id:  teacherId,
      grade_level: classData.grade,
      section:     classData.section,
      school_year: classData.sy,
      subject:     classData.subject || '',
      school_name: classData.schoolName,
      school_id:   classData.schoolId,
      region:      classData.region,
      division:    classData.division,
    }, { onConflict: 'teacher_id,grade_level,section,school_year,subject' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function supaGetClasses(teacherId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('classes')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

// ════════════════════════════════════════════════════════════════
// STUDENTS — Sync students to cloud
// ════════════════════════════════════════════════════════════════

async function supaSyncStudents(classId, maleStudents, femaleStudents) {
  if (!supabase) return;
  // Upsert all students (insert or update by name+class)
  const allStudents = [
    ...maleStudents.map((name, i)  => ({ class_id: classId, full_name: name, gender: 'male',   sort_order: i })),
    ...femaleStudents.map((name, i) => ({ class_id: classId, full_name: name, gender: 'female', sort_order: i })),
  ];
  if (!allStudents.length) return;
  const { error } = await supabase
    .from('students')
    .upsert(allStudents, { onConflict: 'class_id,full_name' });
  if (error) console.error('[Supabase] Student sync error:', error);
}

async function supaGetStudents(classId) {
  if (!supabase) return { male: [], female: [] };
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('class_id', classId)
    .order('sort_order');
  if (error) throw new Error(error.message);
  return {
    male:   (data || []).filter(s => s.gender === 'male').map(s => s.full_name),
    female: (data || []).filter(s => s.gender === 'female').map(s => s.full_name),
    raw:    data || [],
  };
}

// ════════════════════════════════════════════════════════════════
// HPS SETTINGS — Save per-term HPS to cloud
// ════════════════════════════════════════════════════════════════

async function supaSaveHPS(classId, term, hpsData) {
  if (!supabase) return;
  const row = { class_id: classId, term };
  hpsData.ww.forEach((v, i) => { row[`ww${i+1}`] = v; });
  hpsData.pt.forEach((v, i) => { row[`pt${i+1}`] = v; });
  row.te = hpsData.te;
  const { error } = await supabase
    .from('hps_settings')
    .upsert(row, { onConflict: 'class_id,term' });
  if (error) console.error('[Supabase] HPS save error:', error);
}

async function supaGetHPS(classId) {
  if (!supabase) return null;
  const { data } = await supabase
    .from('hps_settings')
    .select('*')
    .eq('class_id', classId);
  // Convert to APP format: { 1: {ww:[...], pt:[...], te:...}, 2:{...}, 3:{...} }
  const result = { 1: null, 2: null, 3: null };
  (data || []).forEach(row => {
    result[row.term] = {
      ww: [1,2,3,4,5,6,7,8,9,10].map(i => row[`ww${i}`]),
      pt: [1,2,3,4,5,6,7,8,9,10].map(i => row[`pt${i}`]),
      te: row.te,
    };
  });
  return result;
}

// ════════════════════════════════════════════════════════════════
// GRADES — Save per-student per-term grades to cloud
// ════════════════════════════════════════════════════════════════

async function supaSaveGrade(studentId, classId, term, gradeData, computed) {
  if (!supabase) return;
  const row = {
    student_id: studentId,
    class_id:   classId,
    term,
    te: gradeData.te,
    // WW scores
    ...Object.fromEntries([1,2,3,4,5,6,7,8,9,10].map((n,i) => [`ww${n}`, gradeData.ww[i]])),
    // PT scores
    ...Object.fromEntries([1,2,3,4,5,6,7,8,9,10].map((n,i) => [`pt${n}`, gradeData.pt[i]])),
    // Computed
    ww_total: computed.wwT, ww_ps: computed.wwPS, ww_ws: computed.wwWS,
    pt_total: computed.ptT, pt_ps: computed.ptPS, pt_ws: computed.ptWS,
    te_ps: computed.tePS,   te_ws: computed.teWS,
    initial_grade: computed.initial,
    term_grade:    computed.termGrade,
  };
  const { error } = await supabase
    .from('grades')
    .upsert(row, { onConflict: 'student_id,class_id,term' });
  if (error) console.error('[Supabase] Grade save error:', error);
}

async function supaGetGrades(classId) {
  if (!supabase) return {};
  const { data } = await supabase
    .from('grades')
    .select('*, students(full_name)')
    .eq('class_id', classId);
  // Convert to APP format: { term: { studentName: {ww:[...], pt:[...], te:...} } }
  const result = { 1: {}, 2: {}, 3: {} };
  (data || []).forEach(row => {
    const name = row.students?.full_name;
    if (!name) return;
    result[row.term][name] = {
      ww: [1,2,3,4,5,6,7,8,9,10].map(i => row[`ww${i}`]),
      pt: [1,2,3,4,5,6,7,8,9,10].map(i => row[`pt${i}`]),
      te: row.te,
    };
  });
  return result;
}

// ════════════════════════════════════════════════════════════════
// ATTENDANCE — Save/load attendance records
// ════════════════════════════════════════════════════════════════

async function supaSaveAttendance(classId, studentId, date, status) {
  if (!supabase) return;
  if (status === '') {
    // Remove record
    await supabase.from('attendance')
      .delete()
      .eq('student_id', studentId)
      .eq('class_id', classId)
      .eq('att_date', date);
  } else {
    await supabase.from('attendance')
      .upsert({ student_id: studentId, class_id: classId, att_date: date, status },
               { onConflict: 'student_id,class_id,att_date' });
  }
}

async function supaGetAttendance(classId) {
  if (!supabase) return {};
  const { data } = await supabase
    .from('attendance')
    .select('*, students(full_name)')
    .eq('class_id', classId)
    .order('att_date');
  // Convert to APP format: { 'YYYY-MM-DD': { studentName: 'P'|'A'|'L' } }
  const result = {};
  (data || []).forEach(row => {
    const date = row.att_date;
    const name = row.students?.full_name;
    if (!date || !name) return;
    if (!result[date]) result[date] = {};
    result[date][name] = row.status;
  });
  return result;
}

// ════════════════════════════════════════════════════════════════
// REGISTRAR SUBMISSION
// ════════════════════════════════════════════════════════════════

async function supaSubmitToRegistrar(classId, teacherId, gradeSnapshot) {
  if (!supabase) throw new Error('Phase 2 not enabled');
  // Mark class as submitted
  await supabase.from('classes')
    .update({ is_submitted: true, submitted_at: new Date().toISOString() })
    .eq('id', classId);
  // Create submission record
  const { data, error } = await supabase
    .from('registrar_submissions')
    .insert({
      class_id:       classId,
      teacher_id:     teacherId,
      grade_snapshot: gradeSnapshot,
      status:         'pending',
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function supaGetRegistrarQueue() {
  // For Registrar role — view all pending submissions
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('registrar_submissions')
    .select(`
      *,
      classes(grade_level, section, subject, school_year),
      teacher_profiles(first_name, last_name, emp_id)
    `)
    .order('submitted_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

async function supaUpdateSubmissionStatus(submissionId, status, notes, reviewerId) {
  if (!supabase) return;
  await supabase.from('registrar_submissions')
    .update({
      status,
      registrar_notes: notes,
      reviewed_by:     reviewerId,
      reviewed_at:     new Date().toISOString(),
    })
    .eq('id', submissionId);
}

// ════════════════════════════════════════════════════════════════
// FULL SYNC — Push entire APP state to Supabase
// Call this after any significant change when Phase 2 is active
// ════════════════════════════════════════════════════════════════

async function supaFullSync(classDbId, studentIdMap) {
  if (!supabase || !PHASE2_ENABLED || !classDbId) return;
  const cd = getCD();
  // Sync HPS for all 3 terms
  for (let t = 1; t <= 3; t++) {
    await supaSaveHPS(classDbId, t, cd.hps[t]);
  }
  // Sync grades for all students for all terms
  for (let t = 1; t <= 3; t++) {
    const stuList = allStu();
    for (const s of stuList) {
      const studentId = studentIdMap[s.name];
      if (!studentId) continue;
      const g = (cd.grades[t] && cd.grades[t][s.name]) || {};
      const computed = calcT(s.name, t);
      await supaSaveGrade(studentId, classDbId, t, {
        ww: g.ww || Array(10).fill(null),
        pt: g.pt || Array(10).fill(null),
        te: g.te !== undefined ? g.te : null,
      }, computed);
    }
  }
  console.log('[Supabase] Full sync complete');
}

// ════════════════════════════════════════════════════════════════
// REAL-TIME SYNC — Listen for changes from other devices
// ════════════════════════════════════════════════════════════════

let realtimeChannel = null;

function supaStartRealtime(classId, onGradeUpdate, onAttendanceUpdate) {
  if (!supabase || !PHASE2_ENABLED) return;
  realtimeChannel = supabase
    .channel(`class-${classId}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'grades',
      filter: `class_id=eq.${classId}`,
    }, payload => {
      console.log('[Realtime] Grade update:', payload);
      if (onGradeUpdate) onGradeUpdate(payload);
    })
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'attendance',
      filter: `class_id=eq.${classId}`,
    }, payload => {
      console.log('[Realtime] Attendance update:', payload);
      if (onAttendanceUpdate) onAttendanceUpdate(payload);
    })
    .subscribe();
  console.log('[Supabase] Realtime listening on class:', classId);
}

function supaStopRealtime() {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

// ════════════════════════════════════════════════════════════════
// STATUS INDICATOR
// Shows Phase 2 connection status in UI
// ════════════════════════════════════════════════════════════════

function renderPhase2Status() {
  const existing = document.getElementById('phase2Status');
  if (existing) existing.remove();
  const pill = document.createElement('div');
  pill.id = 'phase2Status';
  pill.style.cssText = `
    position:fixed; bottom:20px; left:20px; z-index:9998;
    padding:6px 12px; border-radius:99px; font-size:11px; font-weight:600;
    display:flex; align-items:center; gap:6px;
    background:${PHASE2_ENABLED ? '#dcfce7' : '#fef9ec'};
    color:${PHASE2_ENABLED ? '#14532d' : '#713f12'};
    border:1px solid ${PHASE2_ENABLED ? '#86efac' : '#fcd34d'};
    box-shadow:0 2px 8px rgba(0,0,0,.1);
  `;
  pill.innerHTML = `
    <div style="width:7px;height:7px;border-radius:50%;background:${PHASE2_ENABLED ? '#16a34a' : '#d97706'}"></div>
    ${PHASE2_ENABLED ? '☁ Supabase Connected' : '💾 Local Mode (Phase 1)'}
  `;
  document.body.appendChild(pill);
}

// Show status when app loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderPhase2Status);
} else {
  renderPhase2Status();
}

console.log(`[ANHS E-Class] Phase 2 (Supabase): ${PHASE2_ENABLED ? 'ENABLED' : 'DISABLED — running Phase 1 (localStorage)'}`);
