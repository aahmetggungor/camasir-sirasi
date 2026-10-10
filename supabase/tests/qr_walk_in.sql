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
insert into cs_test_context select 'qr',item->>'qrToken' from jsonb_array_elements(public.cs_snapshot()->'machines') item where item->>'id'=(select v from cs_test_context where k='machine');
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

select pg_temp.assert_true(jsonb_typeof(public.cs_snapshot()->'watches')='array','watch contract');
select pg_temp.assert_true((select bool_and(qr_token='') from public.cs_machines),'shared machine rows contain no QR tokens');
select pg_temp.assert_true(not exists(select 1 from jsonb_array_elements(public.cs_snapshot()->'machines') item where item->>'qrToken'<>''),'member snapshot contains no QR tokens');
select pg_temp.expect_error('select * from private.cs_machine_codes','%permission denied%');
select pg_temp.expect_error(format('select public.cs_command(''addProgram'',%L::jsonb)',jsonb_build_object('machineId',(select v from cs_test_context where k='machine'),'name','Extra','durationMinutes',30)::text),'%yetkiniz yok%');
select pg_temp.expect_error('select private.cs_command_v1(''refreshTimers'',''{}'')','%permission denied%');
select pg_temp.expect_error('insert into public.cs_machine_watches(machine_id,space_id,user_id,expires_at) select machine_id,space_id,user_id,expires_at from public.cs_machine_watches','%permission denied%');
select pg_temp.expect_error(format('select public.cs_command(''startWalkIn'',%L::jsonb)',jsonb_build_object('machineQr','wrong-token','programId',(select v from cs_test_context where k='program'))::text),'%Makine bulunamadı%');
select pg_temp.assert_true(public.cs_command('resolveMachine',jsonb_build_object('machineQr',(select v from cs_test_context where k='qr')))->>'machineId'=(select v from cs_test_context where k='machine'),'QR resolves authorized machine');
select pg_temp.assert_true(not exists(select 1 from public.cs_reservations),'scan does not start usage');
insert into cs_test_context values('walkIn',public.cs_command('startWalkIn',jsonb_build_object('machineQr',(select v from cs_test_context where k='qr'),'programId',(select v from cs_test_context where k='program')))#>>'{}');
select pg_temp.assert_true((select status='running' and started_at is not null and estimated_end_at-started_at=interval '10 minutes' from public.cs_reservations where id=(select v::uuid from cs_test_context where k='walkIn')),'server chooses time and program duration');
select pg_temp.expect_error(format('select public.cs_command(''startWalkIn'',%L::jsonb)',jsonb_build_object('machineQr',(select v from cs_test_context where k='qr'),'programId',(select v from cs_test_context where k='program'))::text),'%fiziksel olarak boş değil%');

select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-a111-111111111111","role":"authenticated"}',true);
select public.cs_command('addMachine',jsonb_build_object('spaceId',(select v from cs_test_context where k='space'),'name','Other washer','programs','[{"name":"Quick","durationMinutes":10}]'::jsonb));
insert into cs_test_context select 'otherMachine',id::text from public.cs_machines where name='Other washer';
insert into cs_test_context select 'otherProgram',id::text from public.cs_programs where machine_id=(select v::uuid from cs_test_context where k='otherMachine');
insert into cs_test_context select 'otherQr',item->>'qrToken' from jsonb_array_elements(public.cs_snapshot()->'machines') item where item->>'id'=(select v from cs_test_context where k='otherMachine');
select public.cs_command('watchMachine',jsonb_build_object('machineId',(select v from cs_test_context where k='machine'),'enabled',true));
select public.cs_command('watchMachine',jsonb_build_object('machineId',(select v from cs_test_context where k='machine'),'enabled',true));
select pg_temp.assert_true(jsonb_array_length(public.cs_snapshot()->'watches')=1,'watch idempotence');
reset role;
update public.cs_machine_watches set expires_at=clock_timestamp()-interval '1 second' where machine_id=(select v::uuid from cs_test_context where k='machine');
set local role authenticated;
select public.cs_command('watchMachine',jsonb_build_object('machineId',(select v from cs_test_context where k='machine'),'enabled',true));
select pg_temp.assert_true(jsonb_array_length(public.cs_snapshot()->'watches')=1,'expired watch can be renewed');
select public.cs_command('addProgram',jsonb_build_object('machineId',(select v from cs_test_context where k='machine'),'name','Cotton','durationMinutes',60));
select pg_temp.expect_error(format('select public.cs_command(''addProgram'',%L::jsonb)',jsonb_build_object('machineId',(select v from cs_test_context where k='machine'),'name','cotton','durationMinutes',60)::text),'%zaten var%');

select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-a222-222222222222","role":"authenticated"}',true);
select pg_temp.assert_true(jsonb_array_length(public.cs_snapshot()->'watches')=0,'watches private');
select pg_temp.expect_error(format('select public.cs_command(''startWalkIn'',%L::jsonb)',jsonb_build_object('machineQr',(select v from cs_test_context where k='otherQr'),'programId',(select v from cs_test_context where k='otherProgram'))::text),'%zaten aktif%');
select pg_temp.expect_error(format('select public.cs_command(''startWalkIn'',%L::jsonb)',jsonb_build_object('machineQr',(select v from cs_test_context where k='otherQr'),'programId',(select v from cs_test_context where k='program'))::text),'%Program bu makineye ait değil%');
select public.cs_command('watchMachine',jsonb_build_object('machineId',(select v from cs_test_context where k='machine'),'enabled',true));
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-a111-111111111111","role":"authenticated"}',true);
select public.cs_command('blockMember',jsonb_build_object('membershipId',(select v from cs_test_context where k='membership')));
reset role;
select pg_temp.assert_true(not exists(select 1 from public.cs_machine_watches where user_id='22222222-2222-4222-a222-222222222222'),'blocking removes watch even before reapproval');
set local role authenticated;
select public.cs_command('approveMember',jsonb_build_object('membershipId',(select v from cs_test_context where k='membership'),'verified',true));
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-a222-222222222222","role":"authenticated"}',true);

reset role;
update public.cs_machines set estimated_end_at=clock_timestamp()-interval '1 second' where id=(select v::uuid from cs_test_context where k='machine');
set local role authenticated;
select public.cs_command('refreshTimers');
select public.cs_command('refreshTimers');
select pg_temp.assert_true((select count(*)=1 from public.cs_notifications where user_id=auth.uid() and title='Tahmini yıkama süresi doldu'),'end reminder exactly once');
select pg_temp.assert_true((select status='awaiting_pickup' from public.cs_machines where id=(select v::uuid from cs_test_context where k='machine')),'estimate not vacancy');
select public.cs_command('finishUsage',jsonb_build_object('reservationId',(select v from cs_test_context where k='walkIn')));
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-a111-111111111111","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=1 from public.cs_notifications where user_id=auth.uid() and title='Makinenin teslimi onaylandı'),'collection watch exactly once');
select pg_temp.assert_true(jsonb_array_length(public.cs_snapshot()->'watches')=0,'one-shot watch removed');

-- Existing future booking cannot be displaced by walk-in. No public writes bypass the exclusion.
insert into cs_test_context values('future',public.cs_command('reserve',jsonb_build_object('machineId',(select v from cs_test_context where k='machine'),'programId',(select v from cs_test_context where k='program'),'startsAt',clock_timestamp()+interval '5 minutes'))#>>'{}');
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-a222-222222222222","role":"authenticated"}',true);
select pg_temp.expect_error(format('select public.cs_command(''startWalkIn'',%L::jsonb)',jsonb_build_object('machineQr',(select v from cs_test_context where k='qr'),'programId',(select v from cs_test_context where k='program'))::text),'%sonraki rezervasyona sığmıyor%');
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-a111-111111111111","role":"authenticated"}',true);
select public.cs_command('cancelReservation',jsonb_build_object('reservationId',(select v from cs_test_context where k='future')));
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-a222-222222222222","role":"authenticated"}',true);
select public.cs_command('joinWaitlist',jsonb_build_object('spaceId',(select v from cs_test_context where k='space'),'programId',(select v from cs_test_context where k='program'),'availableUntil',clock_timestamp()+interval '2 hours'));
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-a111-111111111111","role":"authenticated"}',true);
select pg_temp.expect_error(format('select public.cs_command(''startWalkIn'',%L::jsonb)',jsonb_build_object('machineQr',(select v from cs_test_context where k='qr'),'programId',(select v from cs_test_context where k='program'))::text),'%bir kişi için ayrıldı%');
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-a333-333333333333","role":"authenticated"}',true);
select pg_temp.expect_error(format('select public.cs_command(''resolveMachine'',%L::jsonb)',jsonb_build_object('machineQr',(select v from cs_test_context where k='qr'))::text),'%yetkiniz yok%');
reset role;
select 'PASS: QR selection, atomic walk-in, single right, program/admin guard, countdown reminder, private one-shot watches, future booking and FIFO priority' as result;
rollback;
