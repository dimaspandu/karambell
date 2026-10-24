-- READ ONLY. Produces ONE result row so Supabase SQL Editor displays the complete
-- catalog report rather than only the last SELECT result set.
-- Run 0001_multiformat_data_checks.sql separately, one query block at a time.

SELECT jsonb_pretty(jsonb_build_object(
  'environment', jsonb_build_object(
    'database', current_database(),
    'schema', current_schema(),
    'role', current_user,
    'postgres_version', version()
  ),
  'tables_columns', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'table', c.relname,
      'kind', c.relkind,
      'column', a.attname,
      'type', format_type(a.atttypid,a.atttypmod),
      'not_null', a.attnotnull,
      'default', pg_get_expr(d.adbin,d.adrelid)
    ) ORDER BY c.relname,a.attnum)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE n.nspname='public'
      AND c.relname IN ('sessions','players','teams','team_members','matches')
  ), '[]'::jsonb),
  'constraints', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'table',c.relname,'name',con.conname,'type',con.contype,
      'validated',con.convalidated,'definition',pg_get_constraintdef(con.oid,true)
    ) ORDER BY c.relname,con.conname)
    FROM pg_constraint con
    JOIN pg_class c ON c.oid=con.conrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND c.relname IN ('sessions','players','teams','team_members','matches')
  ), '[]'::jsonb),
  'indexes', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'table',tablename,'name',indexname,'definition',indexdef
    ) ORDER BY tablename,indexname)
    FROM pg_indexes
    WHERE schemaname='public'
      AND tablename IN ('sessions','players','teams','team_members','matches')
  ), '[]'::jsonb),
  'rls', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'table',c.relname,'enabled',c.relrowsecurity,'forced',c.relforcerowsecurity
    ) ORDER BY c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND c.relname IN ('sessions','players','teams','team_members','matches')
  ), '[]'::jsonb),
  'policies', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'table',tablename,'name',policyname,'permissive',permissive,
      'roles',roles,'command',cmd,'using',qual,'with_check',with_check
    ) ORDER BY tablename,policyname)
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('sessions','players','teams','team_members','matches')
  ), '[]'::jsonb),
  'grants', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'table',table_name,'grantee',grantee,'privilege',privilege_type,
      'grantable',is_grantable
    ) ORDER BY table_name,grantee,privilege_type)
    FROM information_schema.role_table_grants
    WHERE table_schema='public'
      AND table_name IN ('sessions','players','teams','team_members','matches')
  ), '[]'::jsonb),
  'individual_match_columns', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'column',column_name,'type',data_type,'udt',udt_name,'nullable',is_nullable
    ) ORDER BY column_name)
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='matches'
      AND column_name IN ('participant1_id','participant2_id','winner_id',
                          'team1_id','team2_id','winner_team_id')
  ), '[]'::jsonb)
)) AS preflight_report;
