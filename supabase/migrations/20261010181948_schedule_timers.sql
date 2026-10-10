create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('camasir-sirasi-timers','* * * * *','select private.cs_run_timers();');

