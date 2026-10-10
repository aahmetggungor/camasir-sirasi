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


select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-a111-111111111111","role":"authenticated"}',true);
select pg_temp.assert_true((select machine_type='washer' from public.cs_machines where id=(select v::uuid from cs_test_context where k='machine')),'legacy machine defaults to washer');
select public.cs_command('addMachine',jsonb_build_object('spaceId',(select v from cs_test_context where k='space'),'name','Test dryer','machineType','dryer','programs','[{"name":"Dry","durationMinutes":10}]'::jsonb));
insert into cs_test_context select 'dryer',id::text from public.cs_machines where space_id=(select v::uuid from cs_test_context where k='space') and machine_type='dryer';
insert into cs_test_context select 'dryerProgram',id::text from public.cs_programs where machine_id=(select v::uuid from cs_test_context where k='dryer');
insert into cs_test_context select 'dryerQr',item->>'qrToken' from jsonb_array_elements(public.cs_snapshot()->'machines') item where item->>'id'=(select v from cs_test_context where k='dryer');
select pg_temp.assert_true(exists(select 1 from jsonb_array_elements(public.cs_snapshot()->'machines') item where item->>'type'='dryer'),'snapshot exposes dryer type');
select pg_temp.expect_error(format('select public.cs_command(''addMachine'',%L::jsonb)',jsonb_build_object('spaceId',(select v from cs_test_context where k='space'),'name','Wrong type','machineType','invalid','programs','[{"name":"Dry","durationMinutes":10}]'::jsonb)::text),'%Makine türü%');

select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-a222-222222222222","role":"authenticated"}',true);
select pg_temp.assert_true(public.cs_command('resolveMachine',jsonb_build_object('machineQr',(select v from cs_test_context where k='dryerQr')))->>'machineId'=(select v from cs_test_context where k='dryer'),'dryer QR resolution');
select pg_temp.expect_error(format('select public.cs_command(''startWalkIn'',%L::jsonb)',jsonb_build_object('machineQr',(select v from cs_test_context where k='dryerQr'),'programId',(select v from cs_test_context where k='program'))::text),'%Program bu makineye ait değil%');
insert into cs_test_context values('dryerUsage',public.cs_command('startWalkIn',jsonb_build_object('machineQr',(select v from cs_test_context where k='dryerQr'),'programId',(select v from cs_test_context where k='dryerProgram')))#>>'{}');
select pg_temp.assert_true((select status='running' from public.cs_machines where id=(select v::uuid from cs_test_context where k='dryer')),'dryer starts like washer');
select pg_temp.expect_error(format('select public.cs_command(''reserve'',%L::jsonb)',jsonb_build_object('machineId',(select v from cs_test_context where k='machine'),'programId',(select v from cs_test_context where k='program'),'startsAt',clock_timestamp()+interval '1 minute')::text),'%zaten aktif%');
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-a111-111111111111","role":"authenticated"}',true);
select public.cs_command('watchMachine',jsonb_build_object('machineId',(select v from cs_test_context where k='dryer'),'enabled',true));
select public.cs_command('addProgram',jsonb_build_object('machineId',(select v from cs_test_context where k='dryer'),'name','Cotton dry','durationMinutes',30));
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-a222-222222222222","role":"authenticated"}',true);
select public.cs_command('finishUsage',jsonb_build_object('reservationId',(select v from cs_test_context where k='dryerUsage')));
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-a111-111111111111","role":"authenticated"}',true);
select pg_temp.assert_true(exists(select 1 from public.cs_notifications where user_id=auth.uid() and title='Makinenin teslimi onaylandı'),'dryer watch notification');
select public.cs_command('joinWaitlist',jsonb_build_object('spaceId',(select v from cs_test_context where k='space'),'programId',(select v from cs_test_context where k='dryerProgram'),'availableUntil',clock_timestamp()+interval '2 hours'));
insert into cs_test_context select 'dryerOffer',id::text from public.cs_offers where user_id=auth.uid() and machine_id=(select v::uuid from cs_test_context where k='dryer') and status='pending';
select pg_temp.assert_true(exists(select 1 from cs_test_context where k='dryerOffer'),'dryer FIFO offer');
select public.cs_command('acceptOffer',jsonb_build_object('offerId',(select v from cs_test_context where k='dryerOffer')));
insert into cs_test_context select 'dryerReservation',reservation_id::text from public.cs_offers where id=(select v::uuid from cs_test_context where k='dryerOffer');
select public.cs_command('startUsage',jsonb_build_object('reservationId',(select v from cs_test_context where k='dryerReservation'),'machineQr',(select v from cs_test_context where k='dryerQr')));
select public.cs_command('finishUsage',jsonb_build_object('reservationId',(select v from cs_test_context where k='dryerReservation')));
select public.cs_command('setMachineStatus',jsonb_build_object('machineId',(select v from cs_test_context where k='dryer'),'status','out_of_order'));
select pg_temp.expect_error(format('select public.cs_command(''startWalkIn'',%L::jsonb)',jsonb_build_object('machineQr',(select v from cs_test_context where k='dryerQr'),'programId',(select v from cs_test_context where k='dryerProgram'))::text),'%fiziksel olarak boş değil%');
reset role;
select 'PASS: washer compatibility, dryer identity, QR, program isolation, shared single-right rule, watches, FIFO, reservation start, collection and maintenance' as result;
rollback;
