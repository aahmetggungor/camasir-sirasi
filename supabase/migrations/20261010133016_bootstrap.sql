-- ÇamaşırSırası: her mekân bir tenant; demo/gerçek kullanıcı eklenmez.
create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;
set search_path=public,extensions;

create table public.cs_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100), email text not null
);
create table public.cs_spaces (
  id uuid primary key default gen_random_uuid(), name text not null check (char_length(name) between 2 and 100),
  kind text not null check (char_length(kind) between 1 and 50), owner_id uuid not null references public.cs_profiles(id),
  timezone text not null default 'Europe/Istanbul' check (timezone = 'Europe/Istanbul'),
  rules jsonb not null default '{"openHour":7,"closeHour":23,"peakStartHour":18,"peakEndHour":22,"dailyLimit":2,"peakDailyLimit":1,"startGraceMinutes":5,"pickupMinutes":10,"offerMinutes":2,"arrivalMinutes":5}',
  created_at timestamptz not null default now()
);
create table public.cs_memberships (
  id uuid primary key default gen_random_uuid(), space_id uuid not null references public.cs_spaces(id) on delete cascade,
  user_id uuid not null references public.cs_profiles(id) on delete cascade, room text not null default '' check (char_length(room)<=50),
  role text not null default 'member' check (role in ('owner','admin','member')),
  status text not null default 'pending' check (status in ('pending','active','rejected','removed','blocked')),
  verified_by uuid references public.cs_profiles(id), verified_at timestamptz, reason text not null default '',
  created_at timestamptz not null default now(), unique(space_id,user_id)
);
create index cs_memberships_user_idx on public.cs_memberships(user_id,status,space_id);
create table private.cs_invites (
  id uuid primary key default gen_random_uuid(), space_id uuid not null references public.cs_spaces(id) on delete cascade,
  code_hash text not null unique, expires_at timestamptz not null, revoked boolean not null default false,
  created_by uuid not null references public.cs_profiles(id), created_at timestamptz not null default now()
);
create table public.cs_machines (
  id uuid primary key default gen_random_uuid(), space_id uuid not null references public.cs_spaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  status text not null default 'available' check (status in ('available','running','awaiting_pickup','out_of_order','needs_check')),
  qr_token text not null default encode(extensions.gen_random_bytes(24),'hex'), estimated_end_at timestamptz,
  current_reservation_id uuid, unique(id,space_id)
);
create index cs_machines_space_idx on public.cs_machines(space_id);
create table public.cs_programs (
  id uuid primary key default gen_random_uuid(), machine_id uuid not null references public.cs_machines(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80), duration_minutes integer not null check (duration_minutes between 10 and 240),
  unique(id,machine_id)
);
create index cs_programs_machine_idx on public.cs_programs(machine_id);
create table public.cs_reservations (
  id uuid primary key default gen_random_uuid(), space_id uuid not null references public.cs_spaces(id),
  user_id uuid not null references public.cs_profiles(id), machine_id uuid not null, program_id uuid not null,
  starts_at timestamptz not null, ends_at timestamptz not null check (ends_at>starts_at),
  status text not null check (status in ('offered','confirmed','running','completed','cancelled','no_show')),
  started_at timestamptz, estimated_end_at timestamptz, start_deadline timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key(machine_id,space_id) references public.cs_machines(id,space_id),
  foreign key(program_id,machine_id) references public.cs_programs(id,machine_id),
  exclude using gist (machine_id with =, tstzrange(starts_at,ends_at,'[)') with &&)
    where (status in ('offered','confirmed','running'))
);
create unique index cs_one_active_reservation on public.cs_reservations(space_id,user_id) where status in ('offered','confirmed','running');
create index cs_reservations_user_idx on public.cs_reservations(user_id,space_id,starts_at);
alter table public.cs_machines add constraint cs_current_reservation_fk foreign key(current_reservation_id) references public.cs_reservations(id);
create table public.cs_waitlist (
  id uuid primary key default gen_random_uuid(), space_id uuid not null references public.cs_spaces(id),
  user_id uuid not null references public.cs_profiles(id), program_id uuid not null references public.cs_programs(id),
  created_at timestamptz not null default now(), available_until timestamptz not null,
  status text not null default 'waiting' check (status in ('waiting','offered','accepted','cancelled'))
);
create unique index cs_one_waitlist on public.cs_waitlist(space_id,user_id) where status in ('waiting','offered');
create index cs_waitlist_fifo_idx on public.cs_waitlist(space_id,created_at) where status='waiting';
create table public.cs_offers (
  id uuid primary key default gen_random_uuid(), space_id uuid not null references public.cs_spaces(id),
  user_id uuid not null references public.cs_profiles(id), machine_id uuid not null references public.cs_machines(id),
  program_id uuid not null references public.cs_programs(id), reservation_id uuid not null references public.cs_reservations(id),
  waitlist_id uuid not null references public.cs_waitlist(id), expires_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','accepted','expired','declined'))
);
create index cs_offers_user_idx on public.cs_offers(user_id,status,expires_at);
create index cs_offers_space_idx on public.cs_offers(space_id,status);
create table public.cs_notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.cs_profiles(id) on delete cascade,
  title text not null, body text not null, created_at timestamptz not null default now()
);
create index cs_notifications_user_idx on public.cs_notifications(user_id,created_at desc);

-- SECURITY DEFINER sadece RPC iç yazımı ve RLS üyelik sorgusunda gerekir.
-- Yetki bilgisi JWT metadata'sından değil canlı üyelik tablosundan alınır.
create function private.cs_has_role(p_space uuid,p_admin boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.cs_memberships
 where space_id=p_space and user_id=(select auth.uid()) and status='active' and (not p_admin or role in ('owner','admin')))
$$;
create function private.cs_require(p_space uuid,p_admin boolean default false) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if not private.cs_has_role(p_space,p_admin) then raise exception 'Bu alan için yetkiniz yok veya üyeliğiniz aktif değil.'; end if;
end $$;
create function private.cs_rules_valid(r jsonb) returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(r)='object' and
 (r->>'openHour')::int between 0 and 23 and (r->>'closeHour')::int between 1 and 24 and (r->>'openHour')::int<(r->>'closeHour')::int and
 (r->>'peakStartHour')::int between 0 and 23 and (r->>'peakEndHour')::int between 1 and 24 and (r->>'peakStartHour')::int<(r->>'peakEndHour')::int and
 (r->>'dailyLimit')::int between 1 and 10 and (r->>'peakDailyLimit')::int between 1 and (r->>'dailyLimit')::int and
 (r->>'startGraceMinutes')::int between 1 and 30 and (r->>'pickupMinutes')::int between 1 and 60 and
 (r->>'offerMinutes')::int between 1 and 10 and (r->>'arrivalMinutes')::int between 1 and 30
 and r ?& array['openHour','closeHour','peakStartHour','peakEndHour','dailyLimit','peakDailyLimit','startGraceMinutes','pickupMinutes','offerMinutes','arrivalMinutes']
$$;
alter table public.cs_spaces add constraint cs_rules_valid check(private.cs_rules_valid(rules));

-- Aynı tenant lock'u iki makinede eşzamanlı hak/quota yarışını da önler.
create function private.cs_lock(sid uuid) returns void language sql set search_path='' as $$
 select pg_advisory_xact_lock(hashtextextended(sid::text,0))
$$;
create function private.cs_quota(sid uuid,uid uuid,at_time timestamptz,skip_id uuid default null) returns boolean
language sql stable set search_path='' as $$
 select (select count(*) from public.cs_reservations r where r.space_id=sid and r.user_id=uid
   and r.status in ('offered','confirmed','running','completed','no_show') and r.id is distinct from skip_id
   and (r.starts_at at time zone s.timezone)::date=(at_time at time zone s.timezone)::date)<(s.rules->>'dailyLimit')::int
 and (extract(hour from at_time at time zone s.timezone)<(s.rules->>'peakStartHour')::int
   or extract(hour from at_time at time zone s.timezone)>=(s.rules->>'peakEndHour')::int
   or (select count(*) from public.cs_reservations r where r.space_id=sid and r.user_id=uid
     and r.status in ('offered','confirmed','running','completed','no_show') and r.id is distinct from skip_id
     and (r.starts_at at time zone s.timezone)::date=(at_time at time zone s.timezone)::date
     and extract(hour from r.starts_at at time zone s.timezone)>=(s.rules->>'peakStartHour')::int
     and extract(hour from r.starts_at at time zone s.timezone)<(s.rules->>'peakEndHour')::int)<(s.rules->>'peakDailyLimit')::int)
 from public.cs_spaces s where s.id=sid
$$;
create function private.cs_in_hours(sid uuid,a timestamptz,b timestamptz) returns boolean language sql stable set search_path='' as $$
 select (a at time zone timezone)::date=((b-interval '1 microsecond') at time zone timezone)::date
 and a>=((date_trunc('day',a at time zone timezone)+make_interval(hours=>(rules->>'openHour')::int)) at time zone timezone)
 and b<=((date_trunc('day',a at time zone timezone)+make_interval(hours=>(rules->>'closeHour')::int)) at time zone timezone)
 from public.cs_spaces where id=sid
$$;

-- İç timer invoker: cron postgres olarak veya guarded RPC içinden çağırır.
create function private.cs_tick(sid uuid) returns void language plpgsql security invoker set search_path='' as $$
declare o record; r record; m record; w record; s public.cs_spaces; v_now timestamptz:=clock_timestamp();
 v_start timestamptz; v_end timestamptz; v_id uuid;
begin
 perform private.cs_lock(sid);
 select * into s from public.cs_spaces where id=sid;
 for o in select * from public.cs_offers where space_id=sid and status='pending' and expires_at<=v_now for update loop
  update public.cs_offers set status='expired' where id=o.id;
  update public.cs_reservations set status='cancelled' where id=o.reservation_id and status='offered';
  update public.cs_waitlist set status='cancelled' where id=o.waitlist_id and status='offered';
  insert into public.cs_notifications(user_id,title,body) values(o.user_id,'Teklif süresi doldu','Yeni bir kullanım için tekrar sıraya katılabilirsiniz.');
 end loop;
 update public.cs_waitlist set status='cancelled' where space_id=sid and status='waiting' and available_until<=v_now;
 update public.cs_machines set status='awaiting_pickup' where space_id=sid and status='running' and estimated_end_at<=v_now;
 update public.cs_reservations rr set start_deadline=v_now+make_interval(mins=>(s.rules->>'startGraceMinutes')::int)
 from public.cs_machines mach where mach.id=rr.machine_id and rr.space_id=sid and rr.status='confirmed'
 and rr.starts_at<=v_now and mach.status in ('running','awaiting_pickup','needs_check','out_of_order');
 -- Fiziksel olarak boş değilken sıradaki kişiye no-show uygulanmaz; admin gecikmeyi çözer.
 for r in select rr.* from public.cs_reservations rr join public.cs_machines mach on mach.id=rr.machine_id
  where rr.space_id=sid and rr.status='confirmed' and rr.start_deadline<=v_now and mach.status='available' for update of rr loop
  update public.cs_reservations set status='no_show' where id=r.id;
  insert into public.cs_notifications(user_id,title,body) values(r.user_id,'Rezervasyon süresi geçti','Makine boşken başlangıç onayı gelmediği için hakkınız bırakıldı.');
 end loop;
 -- FIFO: sadece seçilen makine/program; tüm blok bir sonraki randevu ve kapanışa sığmalı.
 for m in select * from public.cs_machines where space_id=sid and status='available' order by id for update loop
  if exists(select 1 from public.cs_reservations where machine_id=m.id and status in ('offered','confirmed','running') and starts_at<=v_now and ends_at>v_now) then continue; end if;
  for w in select ww.*,pp.duration_minutes from public.cs_waitlist ww join public.cs_programs pp on pp.id=ww.program_id
   join public.cs_memberships membership on membership.space_id=ww.space_id and membership.user_id=ww.user_id and membership.status='active'
   where ww.space_id=sid and ww.status='waiting' and pp.machine_id=m.id order by ww.created_at,ww.id for update of ww loop
   v_start:=v_now;
   v_end:=v_start+make_interval(mins=>(s.rules->>'offerMinutes')::int+(s.rules->>'arrivalMinutes')::int+w.duration_minutes+(s.rules->>'pickupMinutes')::int);
   if w.available_until<v_start+make_interval(mins=>(s.rules->>'offerMinutes')::int+(s.rules->>'arrivalMinutes')::int)
     or not private.cs_in_hours(sid,v_start,v_end) or not private.cs_quota(sid,w.user_id,v_start)
     or exists(select 1 from public.cs_reservations where space_id=sid and user_id=w.user_id and status in ('offered','confirmed','running'))
     or exists(select 1 from public.cs_reservations where machine_id=m.id and status in ('offered','confirmed','running') and tstzrange(starts_at,ends_at,'[)') && tstzrange(v_start,v_end,'[)')) then continue; end if;
   insert into public.cs_reservations(space_id,user_id,machine_id,program_id,starts_at,ends_at,status,start_deadline)
     values(sid,w.user_id,m.id,w.program_id,v_start,v_end,'offered',v_start+make_interval(mins=>(s.rules->>'offerMinutes')::int+(s.rules->>'arrivalMinutes')::int)) returning id into v_id;
   insert into public.cs_offers(space_id,user_id,machine_id,program_id,reservation_id,waitlist_id,expires_at)
     values(sid,w.user_id,m.id,w.program_id,v_id,w.id,v_now+make_interval(mins=>(s.rules->>'offerMinutes')::int));
   update public.cs_waitlist set status='offered' where id=w.id;
   insert into public.cs_notifications(user_id,title,body) values(w.user_id,'Makine sizin için boşaldı','Teklifi süresi dolmadan kabul edin.');
   exit;
  end loop;
 end loop;
end $$;
create function private.cs_command(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); sid uuid; mid uuid; pid uuid; rid uuid; id_new uuid;
 s public.cs_spaces; m public.cs_machines; p public.cs_programs; r public.cs_reservations; mm public.cs_memberships;
 o public.cs_offers; w public.cs_waitlist; inv private.cs_invites; item jsonb; rules jsonb;
 v_now timestamptz:=clock_timestamp(); v_start timestamptz; v_end timestamptz; v_deadline timestamptz;
 v_code text; v_exp timestamptz; result jsonb; d date;
begin
 if uid is null then raise exception 'Önce giriş yapmalısınız.'; end if;
 if not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then raise exception 'Önce e-posta adresinizi doğrulayın.'; end if;
 insert into public.cs_profiles(id,name,email)
 select id,left(coalesce(nullif(trim(raw_user_meta_data->>'name'),''),split_part(email,'@',1),'Üye'),100),coalesce(email,'') from auth.users where id=uid
 on conflict(id) do update set name=excluded.name,email=excluded.email;
 if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Geçersiz işlem bilgisi.'; end if;

 if p_action='createSpace' then
  insert into public.cs_spaces(name,kind,owner_id) values(trim(p_payload->>'name'),trim(p_payload->>'kind'),uid) returning id into sid;
  insert into public.cs_memberships(space_id,user_id,role,status,verified_by,verified_at) values(sid,uid,'owner','active',uid,v_now);
  return to_jsonb(sid::text);
 elsif p_action in ('previewInvite','requestMembership') then
  if length(coalesce(p_payload->>'code','')) not between 12 and 128 then raise exception 'Davet kodu geçersiz veya süresi dolmuş.'; end if;
  select * into inv from private.cs_invites where code_hash=encode(extensions.digest(upper(trim(p_payload->>'code')),'sha256'),'hex') and not revoked and expires_at>v_now;
  if not found then raise exception 'Davet kodu geçersiz veya süresi dolmuş.'; end if;
  select * into s from public.cs_spaces where id=inv.space_id;
  if p_action='previewInvite' then return jsonb_build_object('spaceId',s.id,'spaceName',s.name,'expiresAt',inv.expires_at); end if;
  perform private.cs_lock(s.id);
  select * into mm from public.cs_memberships where space_id=s.id and user_id=uid;
  if found then
   if mm.status in ('blocked','removed','rejected') then raise exception 'Yönetici kararı olmadan bu alana yeniden katılamazsınız.'; end if;
   if mm.status='active' then raise exception 'Bu alana zaten üyesiniz.'; end if;
   raise exception 'Başvurunuz zaten yönetici onayını bekliyor.';
  end if;
  insert into public.cs_memberships(space_id,user_id,room) values(s.id,uid,trim(coalesce(p_payload->>'room','')));
  insert into public.cs_notifications(user_id,title,body) select user_id,'Yeni üyelik başvurusu','Yeni bir katılım talebi doğrulama bekliyor.' from public.cs_memberships where space_id=s.id and status='active' and role in ('owner','admin');
  return 'null'::jsonb;
 elsif p_action='refreshTimers' then
  for item in select to_jsonb(space_id) from public.cs_memberships where user_id=uid and status='active' order by space_id loop
   perform private.cs_tick((item#>>'{}')::uuid);
  end loop;
  return 'null'::jsonb;
 end if;

 -- İstemcinin verdiği spaceId'ye güvenmeyiz; alt kaynakların gerçek alanını buluruz.
 if p_action in ('createInvite','saveRules','addMachine','joinWaitlist') then sid:=(p_payload->>'spaceId')::uuid;
 elsif p_action in ('approveMember','rejectMember','blockMember') then
  select * into mm from public.cs_memberships where id=(p_payload->>'membershipId')::uuid; sid:=mm.space_id;
 elsif p_action in ('setMachineStatus','getAvailability','reserve') then
  select * into m from public.cs_machines where id=(p_payload->>'machineId')::uuid; sid:=m.space_id; mid:=m.id;
 elsif p_action in ('cancelReservation','startUsage','finishUsage') then
  select * into r from public.cs_reservations where id=(p_payload->>'reservationId')::uuid; sid:=r.space_id; mid:=r.machine_id; rid:=r.id;
 elsif p_action='leaveWaitlist' then select * into w from public.cs_waitlist where id=(p_payload->>'entryId')::uuid; sid:=w.space_id;
 elsif p_action in ('acceptOffer','declineOffer') then select * into o from public.cs_offers where id=(p_payload->>'offerId')::uuid; sid:=o.space_id; mid:=o.machine_id; rid:=o.reservation_id;
 else raise exception 'Bilinmeyen işlem.'; end if;
 if sid is null then raise exception 'Kayıt bulunamadı veya erişim yetkiniz yok.'; end if;
 perform private.cs_lock(sid);
 perform private.cs_require(sid,p_action in ('createInvite','saveRules','addMachine','setMachineStatus','approveMember','rejectMember','blockMember'));
 perform private.cs_tick(sid);
 select * into s from public.cs_spaces where id=sid;
 if mid is not null then select * into m from public.cs_machines where id=mid for update; end if;
 if rid is not null then select * into r from public.cs_reservations where id=rid for update; end if;
 v_now:=clock_timestamp();

 if p_action='createInvite' then
  -- Tek aktif kod: yenileme eski linkleri iptal eder; yalnız SHA-256 özeti saklanır.
  update private.cs_invites set revoked=true where space_id=sid and not revoked;
  v_code:=upper(encode(extensions.gen_random_bytes(12),'hex')); v_exp:=v_now+interval '7 days';
  insert into private.cs_invites(space_id,code_hash,expires_at,created_by) values(sid,encode(extensions.digest(v_code,'sha256'),'hex'),v_exp,uid);
  return jsonb_build_object('code',v_code,'expiresAt',v_exp);
 elsif p_action in ('approveMember','rejectMember','blockMember') then
  select * into mm from public.cs_memberships where id=mm.id for update;
  if mm.role='owner' or mm.user_id=uid then raise exception 'Alan sahibinin veya kendi üyeliğinizin durumunu bu işlemle değiştiremezsiniz.'; end if;
  if p_action='approveMember' then
   if (p_payload->>'verified')::boolean is distinct from true then raise exception 'Sakin veya izinli kişi kontrolünü tamamlayıp doğrulama onayı verin.'; end if;
   if mm.status not in ('pending','rejected','removed','blocked') then raise exception 'Üyelik zaten aktif.'; end if;
   update public.cs_memberships set status='active',verified_by=uid,verified_at=v_now,reason='' where id=mm.id;
   insert into public.cs_notifications(user_id,title,body) values(mm.user_id,'Üyeliğiniz onaylandı',s.name||' alanında rezervasyon yapabilirsiniz.');
  else
   update public.cs_memberships set status=case when p_action='blockMember' then 'blocked' else 'rejected' end,reason=left(coalesce(p_payload->>'reason',''),300) where id=mm.id;
   -- Devam eden yıkama fiziksel olarak yer kaplar; yöneticinin teslim alması gerekir.
   update public.cs_reservations set status='cancelled' where space_id=sid and user_id=mm.user_id and status in ('offered','confirmed');
   update public.cs_offers set status='declined' where space_id=sid and user_id=mm.user_id and status='pending';
   update public.cs_waitlist set status='cancelled' where space_id=sid and user_id=mm.user_id and status in ('waiting','offered');
  end if;
 elsif p_action='saveRules' then
  rules:=p_payload->'rules';
  if private.cs_rules_valid(rules) is distinct from true then raise exception 'Çalışma saatlerini ve kullanım sınırlarını kontrol edin.'; end if;
  update public.cs_spaces set rules=rules where id=sid;
 elsif p_action='addMachine' then
  if jsonb_typeof(p_payload->'programs') is distinct from 'array' or jsonb_array_length(p_payload->'programs') not between 1 and 12 then raise exception 'En az bir, en fazla 12 program ekleyin.'; end if;
  insert into public.cs_machines(space_id,name) values(sid,trim(p_payload->>'name')) returning id into mid;
  for item in select value from jsonb_array_elements(p_payload->'programs') loop
   insert into public.cs_programs(machine_id,name,duration_minutes) values(mid,trim(item->>'name'),(item->>'durationMinutes')::int);
  end loop;
 elsif p_action='setMachineStatus' then
  if p_payload->>'status' not in ('available','out_of_order','needs_check') then raise exception 'Yıkama durumu kullanım akışıyla değiştirilir.'; end if;
  if m.current_reservation_id is not null then raise exception 'Devam eden kullanımın çamaşırlarını teslim aldığınızı onaylayın.'; end if;
  if p_payload->>'status'='available' then
   -- Bekleyen kişi fiziksel engel nedeniyle geç kaldıysa boşalma sonrası yeni geliş toleransı.
   update public.cs_reservations set start_deadline=v_now+make_interval(mins=>(s.rules->>'startGraceMinutes')::int) where machine_id=mid and status='confirmed' and starts_at<=v_now;
  else
   update public.cs_reservations set status='cancelled' where machine_id=mid and status in ('offered','confirmed');
   update public.cs_offers set status='declined' where machine_id=mid and status='pending';
   update public.cs_waitlist set status='cancelled' where program_id in(select id from public.cs_programs where machine_id=mid) and status in ('waiting','offered');
  end if;
  update public.cs_machines set status=p_payload->>'status',estimated_end_at=null where id=mid;
 elsif p_action in ('reserve','getAvailability') then
  pid:=(p_payload->>'programId')::uuid;
  select * into p from public.cs_programs where id=pid and machine_id=mid;
  if not found then raise exception 'Program bu makineye ait değil.'; end if;
  if p_action='getAvailability' then
   d:=(p_payload->>'day')::date;
   select coalesce(jsonb_agg(jsonb_build_object('startsAt',a,'endsAt',b,'available',
    a>=v_now and a<=v_now+interval '24 hours' and m.status not in ('out_of_order','needs_check')
    and private.cs_in_hours(sid,a,b) and private.cs_quota(sid,uid,a)
    and not exists(select 1 from public.cs_reservations rr where rr.machine_id=mid and rr.status in ('offered','confirmed','running') and tstzrange(rr.starts_at,rr.ends_at,'[)')&&tstzrange(a,b,'[)'))
    and not exists(select 1 from public.cs_reservations rr where rr.space_id=sid and rr.user_id=uid and rr.status in ('offered','confirmed','running'))
    and not exists(select 1 from public.cs_waitlist ww where ww.space_id=sid and ww.user_id=uid and ww.status in ('waiting','offered'))
   ) order by a),'[]'::jsonb) into result
   from (select a,a+make_interval(mins=>p.duration_minutes+(s.rules->>'startGraceMinutes')::int+(s.rules->>'pickupMinutes')::int) b
     from generate_series((d::timestamp+make_interval(hours=>(s.rules->>'openHour')::int)) at time zone s.timezone,
       (d::timestamp+make_interval(hours=>(s.rules->>'closeHour')::int)) at time zone s.timezone,interval '15 minutes') a) slots;
   return result;
  end if;
  v_start:=(p_payload->>'startsAt')::timestamptz;
  if v_start<v_now-interval '5 seconds' or v_start>v_now+interval '24 hours' then raise exception 'Rezervasyon gelecek 24 saat içinde olmalıdır.'; end if;
  v_end:=v_start+make_interval(mins=>p.duration_minutes+(s.rules->>'startGraceMinutes')::int+(s.rules->>'pickupMinutes')::int);
  if m.status in ('out_of_order','needs_check') then raise exception 'Bu makine kullanıma kapalı.'; end if;
  if not private.cs_in_hours(sid,v_start,v_end) then raise exception 'Program ve teslim süresi çalışma saatlerine sığmıyor.'; end if;
  if exists(select 1 from public.cs_reservations where space_id=sid and user_id=uid and status in ('offered','confirmed','running'))
   or exists(select 1 from public.cs_waitlist where space_id=sid and user_id=uid and status in ('waiting','offered')) then raise exception 'Bu alanda zaten aktif bir kullanım hakkınız veya sıranız var.'; end if;
  if not private.cs_quota(sid,uid,v_start) then raise exception 'Günlük veya yoğun saat kullanım sınırına ulaştınız.'; end if;
  insert into public.cs_reservations(space_id,user_id,machine_id,program_id,starts_at,ends_at,status,start_deadline)
   values(sid,uid,mid,pid,v_start,v_end,'confirmed',v_start+make_interval(mins=>(s.rules->>'startGraceMinutes')::int)) returning id into id_new;
  return to_jsonb(id_new::text);
 elsif p_action='cancelReservation' then
  if r.user_id<>uid and not private.cs_has_role(sid,true) then raise exception 'Yalnız kendi rezervasyonunuzu iptal edebilirsiniz.'; end if;
  if r.status not in ('offered','confirmed') then raise exception 'Başlayan veya tamamlanan kullanım iptal edilemez.'; end if;
  update public.cs_reservations set status='cancelled' where id=rid;
  update public.cs_waitlist set status='cancelled' where id in(select waitlist_id from public.cs_offers where reservation_id=rid);
  update public.cs_offers set status='declined' where reservation_id=rid and status='pending';
 elsif p_action='startUsage' then
  if r.user_id<>uid then raise exception 'Yalnız kendi rezervasyonunuzu başlatabilirsiniz.'; end if;
  if r.status<>'confirmed' then raise exception 'Rezervasyon başlatılabilir durumda değil.'; end if;
  if m.qr_token is distinct from trim(p_payload->>'machineQr') then raise exception 'QR kodu rezervasyon yaptığınız makineye ait değil.'; end if;
  if m.status<>'available' or m.current_reservation_id is not null then raise exception 'Makine henüz fiziksel olarak boş değil. Yöneticiye bildirin.'; end if;
  if v_now<r.starts_at or v_now>r.start_deadline then raise exception 'Kullanım başlangıç zamanı henüz gelmedi veya tolerans süresi geçti.'; end if;
  select * into p from public.cs_programs where id=r.program_id;
  v_end:=v_now+make_interval(mins=>p.duration_minutes+(s.rules->>'pickupMinutes')::int);
  -- Geciken başlangıç mevcut bloğa sığmalı; sonraki onaylanmış saat kaydırılmaz.
  if v_end>r.ends_at then raise exception 'Gecikme nedeniyle program sonraki rezervasyona sığmıyor. İptal edip yeni saat seçin.'; end if;
  update public.cs_reservations set status='running',started_at=v_now,estimated_end_at=v_now+make_interval(mins=>p.duration_minutes) where id=rid;
  update public.cs_machines set status='running',current_reservation_id=rid,estimated_end_at=v_now+make_interval(mins=>p.duration_minutes) where id=mid;
 elsif p_action='finishUsage' then
  if r.user_id<>uid and not private.cs_has_role(sid,true) then raise exception 'Bu kullanımın teslimini onaylayamazsınız.'; end if;
  if r.status<>'running' or m.current_reservation_id is distinct from rid then raise exception 'Bu kullanım makinenin aktif kullanımı değil.'; end if;
  update public.cs_reservations set status='completed' where id=rid;
  update public.cs_machines set status='available',current_reservation_id=null,estimated_end_at=null where id=mid and current_reservation_id=rid;
  update public.cs_reservations set start_deadline=v_now+make_interval(mins=>(s.rules->>'startGraceMinutes')::int) where machine_id=mid and status='confirmed' and starts_at<=v_now;
 elsif p_action='joinWaitlist' then
  select * into p from public.cs_programs where id=(p_payload->>'programId')::uuid;
  select * into m from public.cs_machines where id=p.machine_id and space_id=sid;
  if not found or m.status in ('out_of_order','needs_check') then raise exception 'Bu program alanda kullanılabilir değil.'; end if;
  v_exp:=(p_payload->>'availableUntil')::timestamptz;
  if v_exp<=v_now or v_exp>v_now+interval '24 hours' then raise exception 'Sıra için gelecek 24 saat içindeki uygunluk sürenizi seçin.'; end if;
  if exists(select 1 from public.cs_reservations where space_id=sid and user_id=uid and status in ('offered','confirmed','running'))
   or exists(select 1 from public.cs_waitlist where space_id=sid and user_id=uid and status in ('waiting','offered')) then raise exception 'Bu alanda zaten aktif bir kullanım hakkınız veya sıranız var.'; end if;
  insert into public.cs_waitlist(space_id,user_id,program_id,available_until) values(sid,uid,p.id,v_exp);
 elsif p_action='leaveWaitlist' then
  select * into w from public.cs_waitlist where id=w.id for update;
  if w.user_id<>uid then raise exception 'Yalnız kendi sıranızdan ayrılabilirsiniz.'; end if;
  update public.cs_waitlist set status='cancelled' where id=w.id;
  update public.cs_reservations set status='cancelled' where id in(select reservation_id from public.cs_offers where waitlist_id=w.id and status='pending') and status='offered';
  update public.cs_offers set status='declined' where waitlist_id=w.id and status='pending';
 elsif p_action in ('acceptOffer','declineOffer') then
  select * into o from public.cs_offers where id=o.id for update;
  if o.user_id<>uid then raise exception 'Bu teklif size ait değil.'; end if;
  if o.status<>'pending' or o.expires_at<=v_now or r.status<>'offered' then raise exception 'Teklif süresi dolmuş veya işleme alınmış.'; end if;
  if p_action='declineOffer' then
   update public.cs_offers set status='declined' where id=o.id;
   update public.cs_reservations set status='cancelled' where id=rid;
   update public.cs_waitlist set status='cancelled' where id=o.waitlist_id;
  else
   if m.status<>'available' or m.current_reservation_id is not null then raise exception 'Makine artık kullanıma uygun değil.'; end if;
   if not private.cs_quota(sid,uid,v_now,rid) then raise exception 'Kullanım sınırına ulaştınız.'; end if;
   select * into p from public.cs_programs where id=r.program_id;
   v_deadline:=v_now+make_interval(mins=>(s.rules->>'arrivalMinutes')::int);
   v_end:=v_deadline+make_interval(mins=>p.duration_minutes+(s.rules->>'pickupMinutes')::int);
   if v_end>r.ends_at or not private.cs_in_hours(sid,v_now,v_end) then raise exception 'Teklif artık yeterli süre sağlamıyor.'; end if;
   update public.cs_reservations set status='confirmed',starts_at=v_now,start_deadline=v_deadline where id=rid;
   update public.cs_offers set status='accepted' where id=o.id;
   update public.cs_waitlist set status='accepted' where id=o.waitlist_id;
  end if;
 end if;
 perform private.cs_tick(sid);
 return 'null'::jsonb;
exception when exclusion_violation then raise exception 'Bu saat başka bir kullanıcı tarafından alındı. Başka saat seçin.';
 when unique_violation then raise exception 'Bu alanda zaten aktif bir hakkınız veya başvurunuz var.';
end $$;
create function private.cs_run_timers() returns void language plpgsql security invoker set search_path='' as $$
declare s record;
begin
 for s in select id from public.cs_spaces order by id loop perform private.cs_tick(s.id); end loop;
end $$;

create function private.cs_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
 if uid is null then raise exception 'Önce giriş yapmalısınız.'; end if;
 if not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then raise exception 'Önce e-posta adresinizi doğrulayın.'; end if;
 select jsonb_build_object(
 'profile',(select jsonb_build_object('id',u.id,'name',left(coalesce(nullif(trim(u.raw_user_meta_data->>'name'),''),split_part(u.email,'@',1),'Üye'),100),'email',coalesce(u.email,'')) from auth.users u where u.id=uid),
 'spaces',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'kind',s.kind,'ownerId',s.owner_id,'timezone',s.timezone,'role',mm.role,'membershipStatus',mm.status,'rules',s.rules) order by s.created_at) from public.cs_spaces s join public.cs_memberships mm on mm.space_id=s.id and mm.user_id=uid),'[]'::jsonb),
 'memberships',coalesce((select jsonb_agg(jsonb_build_object('id',mm.id,'spaceId',mm.space_id,'userId',mm.user_id,'name',p.name,'email',p.email,'room',mm.room,'role',mm.role,'status',mm.status,'createdAt',mm.created_at) order by mm.created_at) from public.cs_memberships mm join public.cs_profiles p on p.id=mm.user_id where mm.user_id=uid or private.cs_has_role(mm.space_id,true)),'[]'::jsonb),
 'machines',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'spaceId',m.space_id,'name',m.name,'status',m.status,'qrToken',m.qr_token,'estimatedEndAt',m.estimated_end_at) order by m.name) from public.cs_machines m where private.cs_has_role(m.space_id)),'[]'::jsonb),
 'programs',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'machineId',p.machine_id,'name',p.name,'durationMinutes',p.duration_minutes) order by p.duration_minutes) from public.cs_programs p join public.cs_machines m on m.id=p.machine_id where private.cs_has_role(m.space_id)),'[]'::jsonb),
 'reservations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'spaceId',r.space_id,'userId',r.user_id,'userName',p.name,'machineId',r.machine_id,'programId',r.program_id,'startsAt',r.starts_at,'endsAt',r.ends_at,'status',r.status,'startedAt',r.started_at,'estimatedEndAt',r.estimated_end_at) order by r.starts_at) from public.cs_reservations r join public.cs_profiles p on p.id=r.user_id where private.cs_has_role(r.space_id)),'[]'::jsonb),
 'waitlist',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'spaceId',w.space_id,'userId',w.user_id,'programId',w.program_id,'createdAt',w.created_at,'availableUntil',w.available_until,'status',w.status) order by w.created_at) from public.cs_waitlist w where private.cs_has_role(w.space_id) and (w.user_id=uid or private.cs_has_role(w.space_id,true))),'[]'::jsonb),
 'offers',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'spaceId',o.space_id,'userId',o.user_id,'machineId',o.machine_id,'programId',o.program_id,'reservationId',o.reservation_id,'expiresAt',o.expires_at,'status',o.status) order by o.expires_at) from public.cs_offers o where private.cs_has_role(o.space_id) and (o.user_id=uid or private.cs_has_role(o.space_id,true))),'[]'::jsonb),
 'notifications',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'title',n.title,'body',n.body,'createdAt',n.created_at) order by n.created_at desc) from (select * from public.cs_notifications where user_id=uid order by created_at desc limit 100) n),'[]'::jsonb)
 ) into result;
 return result;
end $$;

-- API'de yalnız invoker facade bulunur; ayrıcalıklı iç fonksiyonlar private şemasında.
create function public.cs_command(p_action text,p_payload jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.cs_command(p_action,p_payload) $$;
create function public.cs_snapshot() returns jsonb language sql security invoker set search_path='' as $$ select private.cs_snapshot() $$;

alter table public.cs_profiles enable row level security;
alter table public.cs_spaces enable row level security;
alter table public.cs_memberships enable row level security;
alter table private.cs_invites enable row level security;
alter table public.cs_machines enable row level security;
alter table public.cs_programs enable row level security;
alter table public.cs_reservations enable row level security;
alter table public.cs_waitlist enable row level security;
alter table public.cs_offers enable row level security;
alter table public.cs_notifications enable row level security;

create policy cs_profile_read on public.cs_profiles for select to authenticated using(
 id=(select auth.uid()) or exists(select 1 from public.cs_memberships mm where mm.user_id=cs_profiles.id and private.cs_has_role(mm.space_id,true)));
create policy cs_space_read on public.cs_spaces for select to authenticated using(
 exists(select 1 from public.cs_memberships mm where mm.space_id=cs_spaces.id and mm.user_id=(select auth.uid())));
create policy cs_membership_read on public.cs_memberships for select to authenticated using(
 user_id=(select auth.uid()) or private.cs_has_role(space_id,true));
create policy cs_machine_read on public.cs_machines for select to authenticated using(private.cs_has_role(space_id));
create policy cs_program_read on public.cs_programs for select to authenticated using(
 exists(select 1 from public.cs_machines m where m.id=machine_id and private.cs_has_role(m.space_id)));
create policy cs_reservation_read on public.cs_reservations for select to authenticated using(private.cs_has_role(space_id));
create policy cs_waitlist_read on public.cs_waitlist for select to authenticated using(private.cs_has_role(space_id) and (user_id=(select auth.uid()) or private.cs_has_role(space_id,true)));
create policy cs_offer_read on public.cs_offers for select to authenticated using(private.cs_has_role(space_id) and (user_id=(select auth.uid()) or private.cs_has_role(space_id,true)));
create policy cs_notification_read on public.cs_notifications for select to authenticated using(user_id=(select auth.uid()));

revoke all on schema private from public,anon;
grant usage on schema private to authenticated;
revoke all on all tables in schema private from public,anon,authenticated;
revoke all on public.cs_profiles,public.cs_spaces,public.cs_memberships,public.cs_machines,public.cs_programs,
 public.cs_reservations,public.cs_waitlist,public.cs_offers,public.cs_notifications from public,anon,authenticated;
grant select on public.cs_profiles,public.cs_spaces,public.cs_memberships,public.cs_machines,public.cs_programs,
 public.cs_reservations,public.cs_waitlist,public.cs_offers,public.cs_notifications to authenticated;
revoke execute on all functions in schema private from public,anon,authenticated;
grant execute on function private.cs_has_role(uuid,boolean),private.cs_command(text,jsonb),private.cs_snapshot() to authenticated;
revoke execute on function public.cs_command(text,jsonb),public.cs_snapshot() from public,anon;
grant execute on function public.cs_command(text,jsonb),public.cs_snapshot() to authenticated;
-- Timer için postgres sahibi dışında EXECUTE yoktur (cron postgres ile çalışır).
-- DELETE kullanılmaz: Realtime görünmez silinmiş satırları iletmesin.
do $$
declare t text;
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['cs_machines','cs_memberships','cs_reservations','cs_offers','cs_notifications'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
    execute format('alter publication supabase_realtime add table public.%I',t);
   end if;
  end loop;
 end if;
end $$;
