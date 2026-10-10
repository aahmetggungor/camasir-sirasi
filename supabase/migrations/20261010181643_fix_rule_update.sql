create or replace function private.cs_command(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); sid uuid; mid uuid; pid uuid; rid uuid; id_new uuid;
 s public.cs_spaces; m public.cs_machines; p public.cs_programs; r public.cs_reservations; mm public.cs_memberships;
 o public.cs_offers; w public.cs_waitlist; inv private.cs_invites; item jsonb; v_rules jsonb;
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
  v_rules:=p_payload->'rules';
  if private.cs_rules_valid(v_rules) is distinct from true then raise exception 'Çalışma saatlerini ve kullanım sınırlarını kontrol edin.'; end if;
  update public.cs_spaces set rules=v_rules where id=sid;
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
