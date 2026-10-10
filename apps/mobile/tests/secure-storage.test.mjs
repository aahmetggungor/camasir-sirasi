import test from 'node:test';
import assert from 'node:assert/strict';
import { createSecureStorage } from '../src/services/secureStorage.ts';

function nativeMemory() {
  const data = new Map();
  return {data, getItemAsync: async key => data.get(key) ?? null,
    setItemAsync: async (key, value) => {assert.ok(Buffer.byteLength(value, 'utf8') < 2048, 'native değer 2 KB sınırını aşamaz'); assert.equal(Buffer.from(value).toString('utf8'), value, 'surrogate çiftleri bölünmemeli'); data.set(key, value);},
    deleteItemAsync: async key => {data.delete(key);}};
}

test('büyük unicode oturum küçük şifreli parçalarla kayıpsız okunur', async () => {
  const native = nativeMemory(); const storage = createSecureStorage(native);
  const session = JSON.stringify({name: 'Ahmet', text: 'Çamaşır 🧺 漢字'.repeat(900)});
  await storage.setItem('auth-token', session);
  assert.equal(await storage.getItem('auth-token'), session);
  assert.ok(native.data.size > 2);
  await storage.removeItem('auth-token');
  assert.equal(await storage.getItem('auth-token'), null);
  assert.equal(native.data.size, 0);
});

test('kesilen yazmada önceki geçerli oturum korunur', async () => {
  const native = nativeMemory(); const storage = createSecureStorage(native);
  await storage.setItem('auth-token', 'eski oturum');
  const write = native.setItemAsync;
  native.setItemAsync = async (key, value) => {if (value.includes('bozuk')) throw new Error('native yazma başarısız'); await write(key, value);};
  await assert.rejects(storage.setItem('auth-token', 'bozuk yeni oturum'.repeat(200)), /native yazma başarısız/);
  assert.equal(await storage.getItem('auth-token'), 'eski oturum');
});

test('ardışık token yenilemede eski parçalar silinir, çıkış kayıt bırakmaz', async () => {
  const native = nativeMemory(); const storage = createSecureStorage(native);
  await Promise.all([storage.setItem('auth-token', 'ilk'.repeat(3000)), storage.setItem('auth-token', 'ikinci'.repeat(1000))]);
  assert.equal(await storage.getItem('auth-token'), 'ikinci'.repeat(1000));
  assert.equal(native.data.size, 13);
  await storage.removeItem('auth-token');
  assert.equal(native.data.size, 0);
});

test('eski düz kayıt okunur, eksik parçalar sessizce geçerli oturuma çevrilmez', async () => {
  const native = nativeMemory(); const storage = createSecureStorage(native);
  native.data.set('auth-token', 'eski SDK kaydı');
  assert.equal(await storage.getItem('auth-token'), 'eski SDK kaydı');
  native.data.set('auth-token', 'cs-chunks-v1:abcdef:2');
  native.data.set('auth-token.abcdef.0', 'ilk parça');
  await assert.rejects(storage.getItem('auth-token'), /Oturum deposu eksik/);
});
