import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { atomicWriteFile } from '../v2/scripts/atomic_write.js';

test('atomic write leaves destination unchanged when temp write is interrupted', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-atomic-'));
  const target = path.join(dir, 'artifact.json');
  fs.writeFileSync(target, 'old');
  const interruptedFs = {
    writeFileSync(file, data) {
      fs.writeFileSync(file, data.slice(0, 2));
      throw new Error('interrupted');
    },
    renameSync: fs.renameSync,
    unlinkSync: fs.unlinkSync
  };

  assert.throws(() => atomicWriteFile(target, 'new artifact', interruptedFs), /interrupted/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'old');
  assert.deepEqual(fs.readdirSync(dir), ['artifact.json']);
  fs.rmSync(dir, { recursive: true, force: true });
});
