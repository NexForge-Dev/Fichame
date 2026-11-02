-- ===========================================================================
-- Fíchame — 0000_reset
--
-- ⚠️  DESTRUTIVO. Apaga TODAS as tabelas, views, funções e ficheiros do Fíchame.
--
-- Serve para recomeçar o schema do zero durante o desenvolvimento.
-- NUNCA correr num projeto com dados reais de candidatos.
--
-- Depois deste ficheiro, aplicar 0001 → 0002 → 0003.
-- ===========================================================================

-- Objetos do Storage (os ficheiros em si).
delete from storage.objects where bucket_id in ('cvs', 'media');
delete from storage.buckets where id in ('cvs', 'media');

drop view if exists admin_user_list cascade;
drop view if exists admin_restaurant_list cascade;
drop view if exists platform_metrics cascade;
drop view if exists job_list cascade;
drop view if exists restaurant_metrics cascade;
drop view if exists application_status_counts cascade;
drop view if exists application_list cascade;
drop view if exists session_context cascade;
drop view if exists session_user cascade;   -- nome usado antes de 2026-10-06

drop function if exists purge_test_data(jsonb);
drop function if exists touch_session(jsonb);
drop function if exists toggle_user_blocked(jsonb);
drop function if exists toggle_restaurant_active(jsonb);
drop function if exists mark_notifications_read(jsonb);
drop function if exists delete_job(jsonb);
drop function if exists toggle_job_active(jsonb);
drop function if exists delete_application(jsonb);
drop function if exists toggle_favorite(jsonb);
drop function if exists set_application_status(jsonb);
drop function if exists submit_interest(jsonb);
drop function if exists submit_application(jsonb);
drop function if exists register_restaurant(jsonb);
drop function if exists claim_founders_seat(jsonb);

drop table if exists stripe_events cascade;
drop table if exists email_changes cascade;
drop table if exists password_help_requests cascade;
drop table if exists terms_acceptances cascade;
drop table if exists problem_reports cascade;
drop table if exists error_events cascade;
drop table if exists security_logs cascade;
drop table if exists sessions cascade;
drop table if exists notifications cascade;
drop table if exists consents cascade;
drop table if exists application_history cascade;
drop table if exists application_notes cascade;
drop table if exists cvs cascade;
drop table if exists applications cascade;
drop table if exists candidates cascade;
drop table if exists jobs cascade;
drop table if exists users cascade;
drop table if exists restaurants cascade;
drop table if exists schema_migrations cascade;

drop function if exists set_updated_at() cascade;

notify pgrst, 'reload schema';
