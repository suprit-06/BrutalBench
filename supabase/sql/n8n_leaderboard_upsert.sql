-- Paste this query into the final n8n PostgreSQL node.
-- Operation: Execute an SQL Query
-- Expression mapping: enabled

insert into public.leaderboard (
  github_username,
  current_score,
  brutal_roast,
  has_vulnerabilities,
  fix_suggestion,
  updated_at
)
values (
  '{{ String($json.github_user || "unknown-developer").replace(/'/g, "''") }}',
  {{ Math.max(0, Math.min(100, Number($json.score || 0))) }},
  '{{ String($json.roast || "").replace(/'/g, "''") }}',
  {{ Boolean($json.critical_vulnerability) }},
  '{{ String($json.optimization_tip || "").replace(/'/g, "''") }}',
  now()
)
on conflict (github_username)
do update set
  current_score = excluded.current_score,
  brutal_roast = excluded.brutal_roast,
  has_vulnerabilities = excluded.has_vulnerabilities,
  fix_suggestion = excluded.fix_suggestion,
  updated_at = now();
