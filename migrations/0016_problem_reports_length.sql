-- ===========================================================================
-- Fíchame — 0016_problem_reports_length
--
-- O balão de feedback aceita até 4000 caracteres, o limite comum aos produtos
-- da NexForge; problem_reports (0009) só aceitava 2000. Sem esta migration, um
-- texto mais longo é recusado pela BD e o dono vê o aviso de erro.
--
-- Só ALARGA o limite. Idempotente. Aplicar depois de 0015.
-- ===========================================================================

alter table problem_reports drop constraint if exists problem_reports_message_check;
alter table problem_reports add constraint problem_reports_message_check
  check (char_length(message) between 1 and 4000);

insert into schema_migrations (version) values ('0016_problem_reports_length')
on conflict (version) do nothing;

notify pgrst, 'reload schema';
