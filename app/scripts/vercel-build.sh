#!/usr/bin/env bash
#
# Vercel production build.
#
# This exists for two reasons, both of which bit us in real deploys.
#
# 1. vercel.json caps `buildCommand` at 256 characters. Inlining the
#    Supabase URL and anon key blew past it, and Vercel rejects the whole
#    deployment before the build starts — with an EMPTY build log, which
#    is a miserable thing to diagnose.
#
# 2. ⚠️ The Vercel project has stale VITE_SUPABASE_URL and
#    VITE_SUPABASE_ANON_KEY variables set in its dashboard, pointing at
#    aylaiatvrrownsqzlntc — V0's old project, which is now PAUSED and has
#    none of the V1 schema. Vite gives real environment variables
#    precedence over .env files, so those dashboard values silently won
#    and the V1 app shipped pointing at a dead backend. Confirmed by
#    grepping the deployed bundle, which contained that project's URL and
#    not ours.
#
#    Sourcing .env.production here makes the repo authoritative.
#
#    ✅ TO UNDO: delete those two variables in the Vercel dashboard
#    (Project → Settings → Environment Variables). Then this script is
#    unnecessary — point `buildCommand` back at the plain npm run and
#    dashboard precedence works as it should.

set -euo pipefail
cd "$(dirname "$0")/.."

npm ci

# `set -a` exports everything the file defines, which is what lets these
# beat the values Vercel injected into the environment.
set -a
# shellcheck disable=SC1091
. ./.env.production
set +a

echo "building against ${VITE_SUPABASE_URL}"
npm run build

# Assert the bundle actually contains the project we asked for.
#
# This is the check that was missing the first two times. A wrong
# backend produced a SUCCESSFUL build of the RIGHT size — only the
# embedded URL differed — so nothing failed and the mistake shipped.
# Verify the artifact, not the intent.
host="${VITE_SUPABASE_URL#https://}"
if ! grep -rqF "$host" dist/assets/*.js; then
  echo "FATAL: built bundle does not contain ${host}." >&2
  echo "Something overrode the build environment. Endpoints found:" >&2
  grep -rhoE 'https://[a-z0-9]+\.supabase\.co' dist/assets/*.js | sort -u >&2
  exit 1
fi
echo "verified: bundle points at ${host}"

# V0, preserved at /legacy/. The trailing slash matters — see VERCEL.md.
mkdir -p dist/legacy
cp -r ../index.html ../assets ../CHEATSHEET.html dist/legacy/
