-- Public anon access is required by Karambell's browser-only Supabase provider.
-- The existing sessions/participants/matches tables expose public CRUD policies;
-- these new tables follow that same access model. Do not put a service-role key in
-- the client. Tighten these policies together with adding authentication/ownership.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.competition_participants,
  public.tournament_groups,
  public.tournament_group_members,
  public.match_progressions
TO anon;

DROP POLICY IF EXISTS competition_participants_anon_access ON public.competition_participants;
CREATE POLICY competition_participants_anon_access ON public.competition_participants
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tournament_groups_anon_access ON public.tournament_groups;
CREATE POLICY tournament_groups_anon_access ON public.tournament_groups
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tournament_group_members_anon_access ON public.tournament_group_members;
CREATE POLICY tournament_group_members_anon_access ON public.tournament_group_members
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS match_progressions_anon_access ON public.match_progressions;
CREATE POLICY match_progressions_anon_access ON public.match_progressions
  FOR ALL TO anon USING (true) WITH CHECK (true);
