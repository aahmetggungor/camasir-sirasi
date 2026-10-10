-- Keep existing printed labels valid while removing their tokens from shared rows and Realtime.
create table private.cs_machine_codes (
 machine_id uuid primary key references public.cs_machines(id) on delete cascade,
 token text not null unique
);
alter table private.cs_machine_codes enable row level security;
revoke all on private.cs_machine_codes from public,anon,authenticated;
create policy cs_machine_codes_no_client_access on private.cs_machine_codes for all to anon,authenticated using(false) with check(false);
insert into private.cs_machine_codes(machine_id,token) select id,qr_token from public.cs_machines;
update public.cs_machines set qr_token='';
alter table public.cs_machines alter column qr_token set default '';
alter table public.cs_machines add constraint cs_public_machine_code_hidden check(qr_token='');
create function private.cs_create_machine_code() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into private.cs_machine_codes(machine_id,token) values(new.id,encode(extensions.gen_random_bytes(24),'hex'));
 return new;
end $$;
revoke all on function private.cs_create_machine_code() from public,anon,authenticated;
create trigger cs_create_machine_code after insert on public.cs_machines for each row execute function private.cs_create_machine_code();
create or replace function private.cs_command(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); m public.cs_machines; p public.cs_programs; s public.cs_spaces; r public.cs_reservations;
 v_now timestamptz; v_end timestamptz; rid uuid;
begin
 if p_action='startUsage' then
  if uid is null then raise exception 'Önce giriş yapmalısınız.'; end if;
  select mach.* into m from public.cs_machines mach join public.cs_reservations rr on rr.machine_id=mach.id where rr.id=(p_payload->>'reservationId')::uuid;
  if not found then raise exception 'Kayıt bulunamadı veya erişim yetkiniz yok.'; end if;
  perform private.cs_lock(m.space_id);
  perform private.cs_require(m.space_id);
  if not exists(select 1 from private.cs_machine_codes code where code.machine_id=m.id and code.token=trim(p_payload->>'machineQr')) then
   raise exception 'QR kodu rezervasyon yaptığınız makineye ait değil.';
  end if;
  return private.cs_command_v1('startUsage',p_payload||jsonb_build_object('machineQr',''));
 elsif p_action not in ('resolveMachine','startWalkIn','watchMachine','addProgram') then
  return private.cs_command_v1(p_action,p_payload);
 end if;
 if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then
  raise exception 'Önce giriş yapıp e-posta adresinizi doğrulayın.';
 end if;
 if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Geçersiz işlem bilgisi.'; end if;
 if p_action in ('resolveMachine','startWalkIn') then
  select mach.* into m from public.cs_machines mach join private.cs_machine_codes code on code.machine_id=mach.id where code.token=p_payload->>'machineQr';
 else
  select * into m from public.cs_machines where id=(p_payload->>'machineId')::uuid;
 end if;
 if not found then raise exception 'Makine bulunamadı veya bu alan için erişiminiz yok.'; end if;
 perform private.cs_lock(m.space_id);
 perform private.cs_require(m.space_id,p_action='addProgram');
 perform private.cs_tick(m.space_id);
 select * into m from public.cs_machines where id=m.id for update;
 select * into s from public.cs_spaces where id=m.space_id;
 v_now:=clock_timestamp();
 if p_action='resolveMachine' then
  return jsonb_build_object('machineId',m.id,'spaceId',m.space_id);
 elsif p_action='addProgram' then
  if (select count(*) from public.cs_programs where machine_id=m.id)>=12 then raise exception 'Bir makine için en fazla 12 program ekleyin.'; end if;
  if exists(select 1 from public.cs_programs where machine_id=m.id and lower(name)=lower(trim(p_payload->>'name'))) then raise exception 'Bu program adı zaten var.'; end if;
  insert into public.cs_programs(machine_id,name,duration_minutes)
   values(m.id,trim(p_payload->>'name'),(p_payload->>'durationMinutes')::integer);
  return 'null'::jsonb;
 elsif p_action='watchMachine' then
  delete from public.cs_machine_watches where space_id=m.space_id and expires_at<=v_now;
  if (p_payload->>'enabled')::boolean is distinct from true then
   delete from public.cs_machine_watches where machine_id=m.id and user_id=uid;
  else
   if m.status not in ('running','awaiting_pickup') then raise exception 'Bu makinede takip edilecek aktif kullanım yok.'; end if;
   insert into public.cs_machine_watches(machine_id,space_id,user_id,expires_at)
    values(m.id,m.space_id,uid,v_now+interval '24 hours')
    on conflict(machine_id,user_id) do nothing;
  end if;
  return 'null'::jsonb;
 end if;

 -- Scanning never writes a usage record. Program + user confirmation triggers this atomic operation.
 if m.status<>'available' or m.current_reservation_id is not null then raise exception 'Makine henüz fiziksel olarak boş değil.'; end if;
 select * into p from public.cs_programs where id=(p_payload->>'programId')::uuid and machine_id=m.id;
 if not found then raise exception 'Program bu makineye ait değil.'; end if;
 select * into r from public.cs_reservations where space_id=m.space_id and user_id=uid and status in ('offered','confirmed','running');
 if found then
  if r.status='confirmed' and r.machine_id=m.id and r.program_id=p.id then
   perform private.cs_command_v1('startUsage',jsonb_build_object('reservationId',r.id,'machineQr',m.qr_token));
   return to_jsonb(r.id::text);
  end if;
  raise exception 'Bu alanda zaten aktif bir kullanım hakkınız var. Ayrılmış programınızı kullanın veya rezervasyonunuzu iptal edin.';
 end if;
 if exists(select 1 from public.cs_waitlist where space_id=m.space_id and user_id=uid and status in ('waiting','offered')) then
  raise exception 'Bu alanda zaten sıranız var. Teklifi kabul edin veya sıradan ayrılın.';
 end if;
 v_end:=v_now+make_interval(mins=>p.duration_minutes+(s.rules->>'pickupMinutes')::int);
 if not private.cs_in_hours(m.space_id,v_now,v_end) then raise exception 'Program ve teslim süresi çalışma saatlerine sığmıyor.'; end if;
 if not private.cs_quota(m.space_id,uid,v_now) then raise exception 'Günlük veya yoğun saat kullanım sınırına ulaştınız.'; end if;
 if exists(select 1 from public.cs_reservations where machine_id=m.id and status in ('offered','confirmed','running')
  and tstzrange(starts_at,ends_at,'[)')&&tstzrange(v_now,v_end,'[)')) then
  raise exception 'Program sonraki rezervasyona sığmıyor veya makine bir kişi için ayrıldı.';
 end if;
 insert into public.cs_reservations(space_id,user_id,machine_id,program_id,starts_at,ends_at,status,start_deadline,started_at,estimated_end_at)
  values(m.space_id,uid,m.id,p.id,v_now,v_end,'running',v_now,v_now,v_now+make_interval(mins=>p.duration_minutes)) returning id into rid;
 update public.cs_machines set status='running',current_reservation_id=rid,estimated_end_at=v_now+make_interval(mins=>p.duration_minutes) where id=m.id;
 return to_jsonb(rid::text);
exception when exclusion_violation then raise exception 'Makine başka bir kullanıcı için ayrıldı. Durumu yenileyin.';
 when unique_violation then raise exception 'Bu alanda zaten aktif bir kullanım hakkınız var.';
end $$;
revoke all on function private.cs_command(text,jsonb) from public,anon,authenticated;
grant execute on function private.cs_command(text,jsonb) to authenticated;



create or replace function private.cs_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare base jsonb;
begin
 base:=private.cs_snapshot_v1();
 return base||jsonb_build_object(
 'machines',coalesce((select jsonb_agg(item||jsonb_build_object('qrToken',
   case when private.cs_has_role((item->>'spaceId')::uuid,true)
     then (select code.token from private.cs_machine_codes code where code.machine_id=(item->>'id')::uuid)
     else '' end))
   from jsonb_array_elements(base->'machines') item),'[]'::jsonb),
 'watches',coalesce((select jsonb_agg(jsonb_build_object('machineId',w.machine_id,'spaceId',w.space_id,'expiresAt',w.expires_at))
   from public.cs_machine_watches w where w.user_id=auth.uid() and w.expires_at>clock_timestamp() and private.cs_has_role(w.space_id)),'[]'::jsonb));
end $$;
revoke all on function private.cs_snapshot() from public,anon,authenticated;
grant execute on function private.cs_snapshot() to authenticated;
