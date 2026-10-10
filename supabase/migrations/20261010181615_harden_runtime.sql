create or replace function private.cs_tick(sid uuid) returns void language plpgsql security invoker set search_path='' as $$
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

do $ begin if to_regprocedure('public.rls_auto_enable()') is not null then execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated'; end if; end $;
create policy cs_invites_no_client_access on private.cs_invites for all to anon, authenticated using(false) with check(false);

