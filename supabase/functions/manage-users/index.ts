/**
 * manage-users — the two account operations that need service_role.
 *
 * Everything else about an account is ordinary SQL and lives in
 * migration 0031: roles, status, and a person's own details are rows in
 * public tables, and the database can authorize them itself. Only two
 * things cannot be done from a client holding the anon key:
 *
 *   create   minting an auth identity, and stamping the tenant into
 *            app_metadata — the claim app.current_school_id() reads.
 *            A client that could write app_metadata could move itself
 *            to another school, so this must be server-side or the
 *            whole tenancy model is decorative.
 *
 *   reset    setting someone else's password. Supabase exposes this
 *            only to the admin API.
 *
 * ── AUTHORIZATION ─────────────────────────────────────────────────────
 * Two clients, the same split compute-period-grades uses:
 *
 *   userClient    the caller's own JWT. Used to ASK THE DATABASE
 *                 whether this person may manage accounts, via
 *                 staff_directory()'s permissions block. Authorization
 *                 is therefore not reimplemented in TypeScript — there
 *                 is one definition of "may manage accounts" and it is
 *                 the permission catalogue.
 *
 *   adminClient   service_role. Used only for the auth-identity calls
 *                 and the public.users insert that RLS will not allow
 *                 the caller to make directly.
 *
 * THE TENANT IS NEVER TAKEN FROM THE REQUEST BODY. It comes from the
 * caller's verified token. A body that names a school_id is ignored,
 * so an administrator at one school cannot mint an account at another
 * however the request is shaped.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Postgres and GoTrue errors are precise and unreadable. The real text
 * goes to the logs; the administrator gets a sentence they can act on.
 */
function humanError(e: unknown, fallback: string): string {
  const raw = e instanceof Error ? e.message : String(e);
  console.error('[manage-users]', raw);
  if (/already been registered|already registered|duplicate key.*users_email/i.test(raw)) {
    return 'That email address already has an account. '
      + 'Every account across all schools needs its own address.';
  }
  if (/users_school_id_email_key|unique.*email/i.test(raw)) {
    return 'Someone at this school already uses that email address.';
  }
  if (/password/i.test(raw) && /short|weak|least/i.test(raw)) {
    return 'That password is too short. Use at least 8 characters.';
  }
  if (/not permitted|42501|permission denied|insufficient/i.test(raw)) {
    return 'You are not allowed to manage accounts.';
  }
  return fallback;
}

interface CreateBody {
  action: 'create';
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  suffix?: string | null;
  employeeId?: string | null;
  position?: string | null;
  roles?: string[];
}

interface ResetBody {
  action: 'reset_password';
  userId: string;
  password: string;
}

type Body = CreateBody | ResetBody;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Not signed in.' }, 401);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'Not signed in.' }, 401);

  // The tenant, from the verified token. Never from the body.
  const schoolId = (user.app_metadata as Record<string, unknown> | null)?.school_id;
  if (typeof schoolId !== 'string' || schoolId === '') {
    return json({
      error: 'Your account is not attached to a school. Contact Mendtrix support.',
    }, 403);
  }

  /* ---- may this person manage accounts? Ask the database. ---------- */
  const { data: dir, error: dirError } = await userClient.rpc('staff_directory');
  if (dirError) {
    return json({ error: humanError(dirError, 'Could not check your permissions.') }, 403);
  }
  const canWrite = (dir as { permissions?: { canWrite?: boolean } } | null)
    ?.permissions?.canWrite === true;
  if (!canWrite) {
    return json({ error: 'You are not allowed to create or reset accounts.' }, 403);
  }

  const adminClient = createClient(url, serviceKey, { auth: { persistSession: false } });

  /* ================= reset_password ================================= */
  if (body.action === 'reset_password') {
    const { userId, password } = body;
    if (!userId || !password) {
      return json({ error: 'userId and password are required.' }, 400);
    }
    if (password.length < 8) {
      return json({ error: 'Use a password of at least 8 characters.' }, 400);
    }

    // Confirm the target is in the CALLER's school before touching the
    // auth identity. service_role bypasses RLS, so this is the only
    // thing standing between an administrator and another tenant.
    const { data: target } = await adminClient
      .from('users').select('id')
      .eq('id', userId).eq('school_id', schoolId).is('deleted_at', null)
      .maybeSingle();
    if (!target) {
      return json({ error: 'No such account in this school.' }, 403);
    }

    const { error: pwError } = await adminClient.auth.admin
      .updateUserById(userId, { password });
    if (pwError) {
      return json({ error: humanError(pwError, 'Could not reset the password.') }, 400);
    }

    // They must replace it with one only they know.
    await adminClient.from('users')
      .update({ must_change_password: true }).eq('id', userId);

    return json({ ok: true });
  }

  /* ================= create ========================================= */
  if (body.action !== 'create') {
    return json({ error: 'Unknown action.' }, 400);
  }

  const email = (body.email ?? '').trim().toLowerCase();
  const { password, firstName, lastName } = body;
  if (!email || !password || !firstName?.trim() || !lastName?.trim()) {
    return json({
      error: 'An email, a temporary password, a first name and a last name are all required.',
    }, 400);
  }
  if (password.length < 8) {
    return json({ error: 'Use a temporary password of at least 8 characters.' }, 400);
  }

  /* 1. the auth identity, with the tenant stamped into app_metadata */
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    // No SMTP is configured, so an unconfirmed account could never
    // confirm itself and would simply be unable to sign in. The
    // administrator vouching for the address IS the confirmation.
    email_confirm: true,
    app_metadata: { school_id: schoolId },
  });
  if (createError || !created?.user) {
    return json({ error: humanError(createError, 'Could not create the account.') }, 400);
  }
  const newId = created.user.id;

  /* 2. the person record. public.users.id mirrors auth.users.id (0015) */
  const { error: rowError } = await adminClient.from('users').insert({
    id: newId,
    school_id: schoolId,
    email,
    employee_id: body.employeeId?.trim() || null,
    first_name: firstName.trim(),
    middle_name: body.middleName?.trim() || null,
    last_name: lastName.trim(),
    suffix: body.suffix?.trim() || null,
    status: 'active',
    must_change_password: true,
  });

  if (rowError) {
    // Leaving an auth identity with no person record behind would be a
    // login that resolves to "your account is not set up" and cannot be
    // repaired from any screen — and the address would then be taken,
    // so the administrator could not even retry. Undo it.
    await adminClient.auth.admin.deleteUser(newId).catch(() => {});
    return json({ error: humanError(rowError, 'Could not create the account.') }, 400);
  }

  if (body.position?.trim()) {
    await adminClient.from('staff_profiles')
      .insert({ user_id: newId, school_id: schoolId, position: body.position.trim() });
  }

  /* 3. roles, through the caller's own JWT so roles.assign is checked */
  const roles = (body.roles ?? []).filter((r) => typeof r === 'string' && r);
  if (roles.length > 0) {
    const { error: roleError } = await userClient
      .rpc('set_user_roles', { p_user_id: newId, p_role_codes: roles });
    if (roleError) {
      // The account exists and is usable; only the roles did not land.
      // Say so precisely rather than reporting a failure that would
      // send the administrator to create a duplicate.
      return json({
        ok: true,
        userId: newId,
        warning: 'The account was created, but its roles were not assigned: '
          + humanError(roleError, 'permission denied') + ' Set them from the directory.',
      });
    }
  }

  return json({ ok: true, userId: newId });
});
