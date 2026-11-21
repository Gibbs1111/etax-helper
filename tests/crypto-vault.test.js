import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEncryptedVault,
  unlockEncryptedVault,
  exportAesKeyB64,
  importAesKeyFromB64,
  decryptPayloadWithKey,
  encryptPayloadWithKey,
} from '../src/security/crypto-vault.js';

const FAST_ITERATIONS = 10000; // Giảm vòng lặp riêng trong Unit Test để chạy nhanh

test('Mã hóa AES-256-GCM và giải mã đúng dữ liệu tiếng Việt với đúng mã PIN', async () => {
  const sample = {
    version: 1,
    companies: [
      {
        id: 'c1',
        mst: '0101234567',
        companyName: 'Công ty Cổ phần Minh Họa Việt Nam',
        account: '0101234567-QL',
        password: 'P@ssw0rd!TiếngViệt',
        note: 'Kê khai theo Quý',
      },
    ],
  };

  const { vaultRecord, key, saltBytes } = await createEncryptedVault('246810', sample, FAST_ITERATIONS);
  assert.equal(vaultRecord.schemaVersion, 1);
  assert.equal(vaultRecord.kdf, 'PBKDF2-SHA256');
  // Bảo đảm không chứa mật khẩu hay MST dạng rõ trong ciphertext
  const serialized = JSON.stringify(vaultRecord);
  assert.equal(serialized.includes('0101234567'), false);
  assert.equal(serialized.includes('P@ssw0rd'), false);

  const unlocked = await unlockEncryptedVault('246810', vaultRecord);
  assert.deepEqual(unlocked.data, sample);

  // Giả lập lưu khóa phiên sessionStorage (không lưu PIN gốc) và tái mã hóa dữ liệu mới
  const keyB64 = await exportAesKeyB64(key);
  const restoredKey = await importAesKeyFromB64(keyB64);
  const decryptedBySession = await decryptPayloadWithKey(vaultRecord, restoredKey);
  assert.deepEqual(decryptedBySession, sample);

  const updatedData = { version: 1, companies: [...sample.companies, { id: 'c2', mst: '0309999999' }] };
  const updatedVault = await encryptPayloadWithKey(updatedData, restoredKey, saltBytes, FAST_ITERATIONS);
  const unlocked2 = await unlockEncryptedVault('246810', updatedVault);
  assert.equal(unlocked2.data.companies.length, 2);
});

test('Nhập sai mã PIN phải từ chối giải mã với mã lỗi INVALID_PIN', async () => {
  const { vaultRecord } = await createEncryptedVault('123456', { version: 1, companies: [] }, FAST_ITERATIONS);

  await assert.rejects(
    () => unlockEncryptedVault('654321', vaultRecord),
    (err) => err && err.code === 'INVALID_PIN',
  );
});

test('Dữ liệu bị chỉnh sửa trái phép phải bị AES-GCM từ chối', async () => {
  const { vaultRecord } = await createEncryptedVault('123456', { version: 1, companies: [] }, FAST_ITERATIONS);
  const tampered = {
    ...vaultRecord,
    cipherB64: `${vaultRecord.cipherB64.slice(0, -4)}AAAA`,
  };

  await assert.rejects(
    () => unlockEncryptedVault('123456', tampered),
    (err) => err && err.code === 'INVALID_PIN',
  );
});
