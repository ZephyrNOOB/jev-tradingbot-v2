import fs from 'node:fs';
import path from 'node:path';

export function atomicWriteFile(filePath, data, fileSystem = fs) {
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fileSystem.writeFileSync(tempPath, data, { flag: 'wx' });
    fileSystem.renameSync(tempPath, filePath);
  } catch (error) {
    try { fileSystem.unlinkSync(tempPath); } catch {}
    throw error;
  }
}
