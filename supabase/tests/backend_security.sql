-- Gerçek kullanıcı eklemez: bütün senaryo tek transaction sonunda ROLLBACK.
-- Supabase SQL editor/execute_sql içinde postgres rolüyle tek seferde çalıştırılır.
begin;
create temporary table cs_test_context(k text primary key,v text);
grant all on cs_test_context to authenticated;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'TEST FAILED: %',label; end if; end $$;
create function pg_temp.expect_error(query text,pattern text) returns void language plpgsql as $$
begin
 execute query;
 raise exception 'EXPECTED ERROR NOT RAISED';
exception when others then
 if sqlerrm='EXPECTED ERROR NOT RAISED' or sqlerrm not like pattern then raise exception 'TEST FAILED, expected %, got %',pattern,sqlerrm; end if;
end $$;
grant execute on function pg_temp.assert_true(boolean,text),pg_temp.expect_error(text,text) to authenticated;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data)
values
 ('11111111-1111-4111-a111-111111111111','authenticated','authenticated','cs-test-owner@example.invalid',now(),'{"name":"Test owner"}','{}'),
 ('22222222-2222-4222-a222-222222222222','authenticated','authenticated','cs-test-member@example.invalid',now(),'{"name":"Test member"}','{}'),
 ('33333333-3333-4333-a333-333333333333','authenticated','authenticated','cs-test-outsider@example.invalid',now(),'{"name":"Test outsider"}','{}');
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-a111-111111111111","role":"authenticated"}',true);
set local role authenticated;
insert into cs_test_context values('space',public.cs_command('createSpace','{"name":"Transaction test laundry","kind":"Test"}')#>>'{}');
insert into cs_test_context values('invite',public.cs_command('createInvite',jsonb_build_object('spaceId',(select v from cs_test_context where k='space')))->>'code');
select public.cs_command('saveRules',jsonb_build_object('spaceId',(select v from cs_test_context where k='space'),'rules','{"openHour":0,"closeHour":24,"peakStartHour":18,"peakEndHour":22,"dailyLimit":10,"peakDailyLimit":10,"startGraceMinutes":5,"pickupMinutes":10,"offerMinutes":2,"arrivalMinutes":5}'::jsonb));
select public.cs_command('addMachine',jsonb_build_object('spaceId',(select v from cs_test_context where k='space'),'name','Test washer','programs','[{"name":"Quick","durationMinutes":10}]'::jsonb));
insert into cs_test_context select 'machine',id::text from public.cs_machines where space_id=(select v::uuid from cs_test_context where k='space');
insert into cs_test_context select 'program',id::text from public.cs_programs where machine_id=(select v::uuid from cs_test_context where k='machine');
insert into cs_test_context select 'qr',qr_token from public.cs_machines where id=(select v::uuid from cs_test_context where k='machine');
select pg_temp.expect_error('update public.cs_memberships set role=''owner''','%permission denied%');

select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-a222-222222222222","role":"authenticated"}',true);
select public.cs_command('requestMembership',jsonb_build_object('code',(select v from cs_test_context where k='invite'),'room','204'));
insert into cs_test_context select 'membership',id::text from public.cs_memberships where user_id=(select auth.uid());
select pg_temp.assert_true((public.cs_snapshot()->'machines')='[]'::jsonb,'pending cannot see machines');
select pg_temp.assert_true((select count(*)=0 from public.cs_machines),'RLS pending read');
select pg_temp.expect_error(format('select public.cs_command(''reserve'',%L::jsonb)',jsonb_build_object('machineId',(select v from cs_test_context where k='machine'),'programId',(select v from cs_test_context where k='program'),'startsAt',clock_timestamp()+interval '1 minute')::text),'%üyeliğiniz aktif değil%');

select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-a111-111111111111","role":"authenticated"}',true);
select pg_temp.expect_error(format('select public.cs_command(''approveMember'',%L::jsonb)',jsonb_build_object('membershipId',(select v from cs_test_context where k='membership'),'verified',false)::text),'%doğrulama%');
select public.cs_command('approveMember',jsonb_build_object('membershipId',(select v from cs_test_context where k='membership'),'verified',true));

select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-a222-222222222222","role":"authenticated"}',true);
select pg_temp.assert_true(jsonb_array_length(public.cs_snapshot()->'machines')=1,'approved sees own space');
select pg_temp.assert_true(jsonb_array_length(public.cs_command('getAvailability',jsonb_build_object('machineId',(select v from cs_test_context where k='machine'),'programId',(select v from cs_test_context where k='program'),'day',(clock_timestamp() at time zone 'Europe/Istanbul')::date)))>0,'availability returns typed slots');
select pg_temp.expect_error(format('select public.cs_command(''createInvite'',%L::jsonb)',jsonb_build_object('spaceId',(select v from cs_test_context where k='space'))::text),'%yetkiniz yok%');
insert into cs_test_context values('reservation',public.cs_command('reserve',jsonb_build_object('machineId',(select v from cs_test_context where k='machine'),'programId',(select v from cs_test_context where k='program'),'startsAt',clock_timestamp()-interval '1 second'))#>>'{}');
select pg_temp.expect_error(format('select public.cs_command(''startUsage'',%L::jsonb)',jsonb_build_object('reservationId',(select v from cs_test_context where k='reservation'),'machineQr','wrong-qr')::text),'%QR kodu%');
select public.cs_command('startUsage',jsonb_build_object('reservationId',(select v from cs_test_context where k='reservation'),'machineQr',(select v from cs_test_context where k='qr')));
select pg_temp.assert_true((select status='running' from public.cs_machines where id=(select v::uuid from cs_test_context where k='machine')),'start running');

select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-a111-111111111111","role":"authenticated"}',true);
select pg_temp.expect_error(format('select public.cs_command(''reserve'',%L::jsonb)',jsonb_build_object('machineId',(select v from cs_test_context where k='machine'),'programId',(select v from cs_test_context where k='program'),'startsAt',clock_timestamp()+interval '1 minute')::text),'%başka bir kullanıcı%');
-- Geçmiş QR/finish çağrısı, sonraki kullanımı boşaltamaz.
select public.cs_command('finishUsage',jsonb_build_object('reservationId',(select v from cs_test_context where k='reservation')));
insert into cs_test_context values('nextReservation',public.cs_command('reserve',jsonb_build_object('machineId',(select v from cs_test_context where k='machine'),'programId',(select v from cs_test_context where k='program'),'startsAt',clock_timestamp()-interval '1 second'))#>>'{}');
select public.cs_command('startUsage',jsonb_build_object('reservationId',(select v from cs_test_context where k='nextReservation'),'machineQr',(select v from cs_test_context where k='qr')));
select pg_temp.expect_error(format('select public.cs_command(''finishUsage'',%L::jsonb)',jsonb_build_object('reservationId',(select v from cs_test_context where k='reservation'))::text),'%aktif kullanımı değil%');
select pg_temp.assert_true((select status='running' from public.cs_machines where id=(select v::uuid from cs_test_context where k='machine')),'old finish does not free new session');

-- Timer süresini fixture için postgres değiştirir; authenticated bunu yapamaz.
reset role;
update public.cs_machines set estimated_end_at=clock_timestamp()-interval '1 minute' where id=(select v::uuid from cs_test_context where k='machine');
set local role authenticated;
select public.cs_command('refreshTimers');
select pg_temp.assert_true((select status='awaiting_pickup' from public.cs_machines where id=(select v::uuid from cs_test_context where k='machine')),'elapsed estimate is not physical vacancy');
select public.cs_command('finishUsage',jsonb_build_object('reservationId',(select v from cs_test_context where k='nextReservation')));
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-a222-222222222222","role":"authenticated"}',true);
select public.cs_command('joinWaitlist',jsonb_build_object('spaceId',(select v from cs_test_context where k='space'),'programId',(select v from cs_test_context where k='program'),'availableUntil',clock_timestamp()+interval '2 hours'));
insert into cs_test_context select 'offer',id::text from public.cs_offers where user_id=(select auth.uid()) and status='pending';
select pg_temp.assert_true(exists(select 1 from cs_test_context where k='offer'),'free slot offered to waiting member');
reset role;
update public.cs_offers set expires_at=clock_timestamp()-interval '1 second' where id=(select v::uuid from cs_test_context where k='offer');
set local role authenticated;
select pg_temp.expect_error(format('select public.cs_command(''acceptOffer'',%L::jsonb)',jsonb_build_object('offerId',(select v from cs_test_context where k='offer'))::text),'%Teklif süresi dolmuş%');
select public.cs_command('refreshTimers');
select pg_temp.assert_true((select status='expired' from public.cs_offers where id=(select v::uuid from cs_test_context where k='offer')),'expired offer released');

select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-a111-111111111111","role":"authenticated"}',true);
select public.cs_command('blockMember',jsonb_build_object('membershipId',(select v from cs_test_context where k='membership')));
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-a222-222222222222","role":"authenticated"}',true);
select pg_temp.assert_true((public.cs_snapshot()->'machines')='[]'::jsonb,'blocked loses all occupancy access');
select pg_temp.expect_error(format('select public.cs_command(''requestMembership'',%L::jsonb)',jsonb_build_object('code',(select v from cs_test_context where k='invite'),'room','204')::text),'%yeniden katılamazsınız%');
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-a333-333333333333","role":"authenticated"}',true);
select pg_temp.assert_true(jsonb_array_length(public.cs_snapshot()->'spaces')=0,'outsider has no tenant visibility');
select pg_temp.expect_error(format('select public.cs_command(''getAvailability'',%L::jsonb)',jsonb_build_object('machineId',(select v from cs_test_context where k='machine'),'programId',(select v from cs_test_context where k='program'),'day',current_date)::text),'%yetkiniz yok%');
reset role;
select 'PASS: guarded membership, RLS, QR, reservation collision, session ownership, pickup, expired offer, blocked rejoin and outsider isolation' as result;
rollback;
