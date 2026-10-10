-- QR walk-in uses the same tenant lock, quotas and booking exclusion as reservations.
create table public.cs_machine_watches (
 machine_id uuid not null, space_id uuid not null, user_id uuid not null references public.cs_profiles(id) on delete cascade,
 expires_at timestamptz not null, primary key(machine_id,user_id),
 foreign key(machine_id,space_id) references public.cs_machines(id,space_id) on delete cascade
);
create index cs_machine_watches_user_idx on public.cs_machine_watches(user_id,space_id);
alter table public.cs_machine_watches enable row level security;
revoke all on public.cs_machine_watches from public,anon,authenticated;
grant select on public.cs_machine_watches to authenticated;
create policy cs_machine_watches_select on public.cs_machine_watches for select to authenticated
 using(user_id=(select auth.uid()) and private.cs_has_role(space_id));

-- One-shot notifications: elapsed time is distinct from actual collection.
create function private.cs_machine_notice() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.status='awaiting_pickup' and old.status='running' then
  insert into public.cs_notifications(user_id,title,body)
   select r.user_id,'Tahmini yıkama süresi doldu',new.name||': çamaşırlarını kontrol edip aldıktan sonra teslimi onayla.'
   from public.cs_reservations r join public.cs_memberships mm on mm.space_id=r.space_id and mm.user_id=r.user_id and mm.status='active'
   where r.id=new.current_reservation_id;
 elsif new.status='available' and old.status in ('running','awaiting_pickup') then
  insert into public.cs_notifications(user_id,title,body)
   select w.user_id,'Makinenin teslimi onaylandı',new.name||': çamaşırlar alındı. Uygun saatleri kontrol et; bu bildirim sana rezervasyon hakkı ayırmaz.'
   from public.cs_machine_watches w join public.cs_memberships mm on mm.space_id=w.space_id and mm.user_id=w.user_id and mm.status='active'
   where w.machine_id=new.id and w.expires_at>clock_timestamp();
  delete from public.cs_machine_watches where machine_id=new.id;
 elsif new.status in ('out_of_order','needs_check') then
  delete from public.cs_machine_watches where machine_id=new.id;
 end if;
 return new;
end $$;
revoke all on function private.cs_machine_notice() from public,anon,authenticated;
create trigger cs_machine_notice after update of status on public.cs_machines
 for each row when(old.status is distinct from new.status) execute function private.cs_machine_notice();

alter function private.cs_command(text,jsonb) rename to cs_command_v1;
revoke all on function private.cs_command_v1(text,jsonb) from public,anon,authenticated;
create function private.cs_command(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); m public.cs_machines; p public.cs_programs; s public.cs_spaces; r public.cs_reservations;
 v_now timestamptz; v_end timestamptz; rid uuid;
begin
 if p_action not in ('resolveMachine','startWalkIn','watchMachine','addProgram') then
  return private.cs_command_v1(p_action,p_payload);
 end if;
 if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then
  raise exception 'Önce giriş yapıp e-posta adresinizi doğrulayın.';
 end if;
 if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Geçersiz işlem bilgisi.'; end if;
 if p_action in ('resolveMachine','startWalkIn') then
  select * into m from public.cs_machines where qr_token=p_payload->>'machineQr';
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

alter function private.cs_snapshot() rename to cs_snapshot_v1;
revoke all on function private.cs_snapshot_v1() from public,anon,authenticated;
create function private.cs_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare base jsonb;
begin
 base:=private.cs_snapshot_v1();
 return base||jsonb_build_object('watches',coalesce(
  (select jsonb_agg(jsonb_build_object('machineId',w.machine_id,'spaceId',w.space_id,'expiresAt',w.expires_at))
   from public.cs_machine_watches w where w.user_id=auth.uid() and w.expires_at>clock_timestamp() and private.cs_has_role(w.space_id)),'[]'::jsonb));
end $$;
revoke all on function private.cs_snapshot() from public,anon,authenticated;
grant execute on function private.cs_snapshot() to authenticated;

do $$
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='cs_machine_watches') then
   alter publication supabase_realtime add table public.cs_machine_watches;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='cs_programs') then
   alter publication supabase_realtime add table public.cs_programs;
  end if;
 end if;
end $$;
