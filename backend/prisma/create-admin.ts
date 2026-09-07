/**
 * Creates (or updates) an administrator account.
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' npm run create-admin
 *
 * There is no default account and no password printed anywhere: the only way
 * an account exists is if somebody with shell access to the server made it.
 * Passing the password on the command line would put it in your shell history,
 * so it is read from the environment instead.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || 'Administrator';

  if (!email || !password) {
    console.error(
      [
        '',
        'Set ADMIN_EMAIL and ADMIN_PASSWORD, then run this again.',
        '',
        '  PowerShell:',
        '    $env:ADMIN_EMAIL="you@example.com"; $env:ADMIN_PASSWORD="a long passphrase"; npm run create-admin',
        '',
        '  bash:',
        '    ADMIN_EMAIL=you@example.com ADMIN_PASSWORD="a long passphrase" npm run create-admin',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  if (password.length < 12) {
    console.error('Password must be at least 12 characters.');
    process.exit(1);
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('That does not look like an email address.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    create: { name, email, passwordHash, role: 'ADMIN', active: true },
    update: { passwordHash, role: 'ADMIN', active: true },
  });

  /* Any session that existed under an old password is no longer valid. */
  await prisma.session.deleteMany({ where: { userId: user.id } });

  console.log(`\nAdministrator ready: ${user.email}`);
  console.log('Sign in at /admin/login\n');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
