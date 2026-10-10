import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createRequire} from 'node:module';

const source=fs.readFileSync(new URL('../apps/mobile/src/services/secureStorage.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
new Function('module','exports','require',compiled)(module,module.exports,createRequire(import.meta.url));
const {createSecureStorage}=module.exports;
function fixture(){
  const values=new Map();let fail=false;
  return {values,set fail(value){fail=value;},store:{
    async getItemAsync(key){return values.get(key)??null;},
    async setItemAsync(key,value){assert.ok(Buffer.byteLength(value,'utf8')<=2048);if(fail&&key.endsWith('.1'))throw Error('device write failed');values.set(key,value);},
    async deleteItemAsync(key){values.delete(key);}
  }};
}
test('Büyük Unicode oturumu 2048 bayt sınırını aşmadan saklar ve çıkışta bütün parçaları siler',async()=>{
  const f=fixture(),adapter=createSecureStorage(f.store);const session='İ🧺ğş'.repeat(1500);
  await adapter.setItem('session',session);assert.equal(await adapter.getItem('session'),session);
  await adapter.removeItem('session');assert.equal(await adapter.getItem('session'),null);assert.equal(f.values.size,0);
});
test('Kesilen yeni yazma önceki oturumu bozmaz; sonraki başarılı yazma kullanılabilir',async()=>{
  const f=fixture(),adapter=createSecureStorage(f.store);await adapter.setItem('session','previous');
  f.fail=true;await assert.rejects(adapter.setItem('session','x'.repeat(1500)),/device write failed/);
  assert.equal(await adapter.getItem('session'),'previous');f.fail=false;
  await adapter.setItem('session','updated');assert.equal(await adapter.getItem('session'),'updated');
});
test('Eşzamanlı yenilemeler sıralanır ve son tam oturum okunur',async()=>{
  const f=fixture(),adapter=createSecureStorage(f.store);
  await Promise.all([adapter.setItem('session','a'.repeat(2500)),adapter.setItem('session','b'.repeat(2500))]);
  assert.equal(await adapter.getItem('session'),'b'.repeat(2500));
});
