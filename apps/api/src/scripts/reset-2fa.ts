import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

/**
 * Turns off two-factor sign-in for one account when its owner lost their phone and
 * no other super admin can reset it from Admin → Staff:
 *
 *   node dist/scripts/reset-2fa.js --email owner@talkclub.kz
 *
 * Signs the account out everywhere; a required role sets 2FA up again at next sign-in.
 */
function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const email = arg('email')?.trim().toLowerCase();
  if (!email) {
    console.error('Usage: reset-2fa --email <email>');
    process.exit(2);
  }
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.error(`No account with email ${email}.`);
      process.exit(1);
    }
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null, totpRecoveryCodes: [], totpFailedCount: 0, totpLockedUntil: null },
      }),
      prisma.authSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
      prisma.auditLog.create({ data: { actorLabel: 'reset-2fa script', action: 'staff.reset_2fa', entityType: 'User', entityId: user.id } }),
    ]);
    console.log(`Two-factor sign-in turned off for ${email}. Set it up again at the next sign-in.`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
