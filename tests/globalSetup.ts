import { execSync } from 'child_process';
import { rmSync } from 'fs';

// Recreate the test database (prisma/test.db) from the schema before the run.
export default function setup() {
  for (const suffix of ['', '-journal']) {
    rmSync(`prisma/test.db${suffix}`, { force: true });
  }
  execSync('npx prisma db push --skip-generate', {
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    stdio: 'pipe',
  });
}
