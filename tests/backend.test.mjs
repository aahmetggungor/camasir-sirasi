import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

// Aynı üretim kaynaklarını çalıştırır; ayrı bir test implementasyonu yoktur.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'work', 'backend-test');
await fs.mkdir(out, {recursive:true});
for (const name of ['demo','rules','types']) {
  const source = await fs.readFile(path.join(root,'packages/core/src',`${name}.ts`),'utf8');
  const compiled = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
    .replace(/from (['"])\.\/rules\1/g, 'from "./rules.mjs"');
  await fs.writeFile(path.join(out,`${name}.mjs`),compiled);
}
const { createDemoClient } = await import(pathToFileURL(path.join(out,'demo.mjs')).href);
const { DEFAULT_RULES } = await import(pathToFileURL(path.join(out,'rules.mjs')).href);
const storage=()=>{const data=new Map();return{getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);},removeItem:k=>{data.delete(k);}};};
const at=(day,hour,minute=0)=>new Date(`${day}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00+03:00`).getTime();

test('Onaysız kullanıcı makineyi göremez, onay sadece yönetici ve doğrulama ile açılır',async()=>{
  const c=createDemoClient(storage());
  await c.signIn('pending@demo.local','demo12345');
  let s=await c.getSnapshot();assert.equal(s.spaces[0].membershipStatus,'pending');assert.deepEqual(s.machines,[]);
  await assert.rejects(c.reserve('demo-machine-1','demo-program-1-quick',new Date().toISOString()),/aktif değil/);
  await assert.rejects(c.approveMember('demo-membership-2',true),/yetkiniz/);
  await c.signIn('owner@demo.local','demo12345');
  await assert.rejects(c.approveMember('demo-membership-2',false),/doğrulayın/);
  await c.approveMember('demo-membership-2',true);
  await c.signIn('pending@demo.local','demo12345');s=await c.getSnapshot();assert.equal(s.machines.length,3);
});

test('Engellenen üye eski davetle katılamaz; yeniden açma yönetici kararına bağlıdır',async()=>{
  const c=createDemoClient(storage());await c.signIn('owner@demo.local','demo12345');await c.blockMember('demo-membership-1');
  await c.signIn('member@demo.local','demo12345');assert.deepEqual((await c.getSnapshot()).machines,[]);
  await assert.rejects(c.requestMembership('KUZEY2026','204'),/Yönetici kararı/);
  await c.signIn('owner@demo.local','demo12345');await c.approveMember('demo-membership-1',true);
  await c.signIn('member@demo.local','demo12345');assert.equal((await c.getSnapshot()).machines.length,3);
});

test('Çifte rezervasyon, tek hak, yanlış QR ve eski teslim onayı engellenir',async()=>{
  const old=Date.now;let now=at('2026-10-10',10);Date.now=()=>now;
  try{
    const c=createDemoClient(storage());await c.signIn('member@demo.local','demo12345');
    const r=await c.reserve('demo-machine-1','demo-program-1-quick',new Date(now).toISOString());
    await assert.rejects(c.reserve('demo-machine-2','demo-program-2-quick',new Date(now).toISOString()),/aktif bir kullanım/);
    await assert.rejects(c.startUsage(r,'CAMASIR-DEMO-2'),/QR kodu/);
    await c.signIn('owner@demo.local','demo12345');await assert.rejects(c.reserve('demo-machine-1','demo-program-1-quick',new Date(now).toISOString()),/başka bir kullanıcı/);
    await c.signIn('member@demo.local','demo12345');await c.startUsage(r,'CAMASIR-DEMO-1');
    now+=31*60_000;await c.refreshTimers();assert.equal((await c.getSnapshot()).machines[0].status,'awaiting_pickup');
    await c.finishUsage(r);await c.signIn('owner@demo.local','demo12345');
    const next=await c.reserve('demo-machine-1','demo-program-1-quick',new Date(now).toISOString());await c.startUsage(next,'CAMASIR-DEMO-1');
    await assert.rejects(c.finishUsage(r),/aktif kullanımı değil/);assert.equal((await c.getSnapshot()).machines[0].status,'running');
  }finally{Date.now=old;}
});

test('Boşluk teklifini yalnız sahibi süresinde kabul eder; reddetme kota tüketmez',async()=>{
  const old=Date.now;let now=at('2026-10-10',10);Date.now=()=>now;
  try{
    const c=createDemoClient(storage());await c.signIn('member@demo.local','demo12345');
    await c.joinWaitlist('demo-space','demo-program-1-quick',new Date(now+2*3_600_000).toISOString());
    let s=await c.getSnapshot();assert.equal(s.offers[0].status,'pending');const offer=s.offers[0];
    await assert.rejects(c.reserve('demo-machine-2','demo-program-2-quick',new Date(now).toISOString()),/aktif bir kullanım/);
    await c.signIn('owner@demo.local','demo12345');await assert.rejects(c.acceptOffer(offer.id),/size ait değil/);
    await c.signIn('member@demo.local','demo12345');await c.declineOffer(offer.id);
    await c.joinWaitlist('demo-space','demo-program-1-quick',new Date(now+2*3_600_000).toISOString());
    s=await c.getSnapshot();const next=s.offers.find(o=>o.status==='pending');assert.ok(next);
    now+=3*60_000;await assert.rejects(c.acceptOffer(next.id),/süresi dolmuş/);await c.refreshTimers();
    s=await c.getSnapshot();assert.equal(s.offers.find(o=>o.id===next.id).status,'expired');
    await c.reserve('demo-machine-1','demo-program-1-quick',new Date(now).toISOString());
  }finally{Date.now=old;}
});

test('Program kapanışa ve sonraki rezervasyona sığmadan teklif verilmez; yerel gün kotası',async()=>{
  const old=Date.now;let now=at('2026-10-10',10);Date.now=()=>now;
  try{
    const c=createDemoClient(storage());await c.signIn('owner@demo.local','demo12345');
    await c.saveRules('demo-space',{...DEFAULT_RULES,openHour:7,closeHour:23,dailyLimit:1});
    const future=await c.reserve('demo-machine-1','demo-program-1-quick',new Date(now+20*60_000).toISOString());
    await c.signIn('member@demo.local','demo12345');await c.joinWaitlist('demo-space','demo-program-1-quick',new Date(now+3_600_000).toISOString());
    assert.equal((await c.getSnapshot()).offers.length,0);
    await c.leaveWaitlist((await c.getSnapshot()).waitlist[0].id);
    await c.signIn('owner@demo.local','demo12345');await c.cancelReservation(future);await c.signIn('member@demo.local','demo12345');
    now=at('2026-10-10',22,50);await assert.rejects(c.reserve('demo-machine-2','demo-program-2-quick',new Date(now).toISOString()),/saat kullanıma uygun/);
    now=at('2026-10-10',11);await c.signIn('owner@demo.local','demo12345');
    const r=await c.reserve('demo-machine-2','demo-program-2-quick',new Date(now).toISOString());await c.startUsage(r,'CAMASIR-DEMO-2');await c.finishUsage(r);
    await assert.rejects(c.reserve('demo-machine-1','demo-program-1-quick',new Date(now+60_000).toISOString()),/Günlük/);
    const tomorrow=at('2026-10-11',8);await c.reserve('demo-machine-1','demo-program-1-quick',new Date(tomorrow).toISOString());
  }finally{Date.now=old;}
});

test('Demo verisi sağlanan storage ile kalıcı, yeni davet eskisini iptal eder; okumalar bildirim döngüsü yaratmaz',async()=>{
  const st=storage(),c=createDemoClient(st);await c.signIn('owner@demo.local','demo12345');let calls=0;const unsub=c.subscribe(()=>calls++);
  await c.getSnapshot();assert.equal(calls,0);
  const invite=await c.createInvite('demo-space');assert.equal(calls,1);assert.ok(invite.code);
  await assert.rejects(c.previewInvite('KUZEY2026'),/geçersiz/);assert.equal((await c.previewInvite(invite.code)).spaceId,'demo-space');
  const another=createDemoClient(st);assert.equal((await another.getSession()).email,'owner@demo.local');unsub();
});
