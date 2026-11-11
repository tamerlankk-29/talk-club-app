import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { normalizePhone } from '../common/utils/phone';
import { hashPassword } from '../modules/auth/password';
import { ROLE_KEYS } from '../modules/rbac/permissions';
import { syncRbac } from '../modules/rbac/rbac.sync';

/**
 * Creates the first super-admin account on a fresh installation:
 *
 *   node dist/scripts/create-admin.js --email owner@talkclub.kz --name "Aida"
 *   (development: npx ts-node --transpile-only src/scripts/create-admin.ts --email … --name …)
 *
 * The password comes from ADMIN_PASSWORD, or a temporary one is generated and
 * printed once. Refuses to run when a super admin already exists (unless --force),
 * so it can't be used to take over a live installation.
 *
 *   node dist/scripts/create-admin.js --check     exits 0 when a super admin exists, 3 when not
 */
function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const email = arg('email')?.trim().toLowerCase();
  const displayName = arg('name')?.trim();
  const phoneRaw = arg('phone');
  const force = process.argv.includes('--force');
  if (process.argv.includes('--check')) {
    const prisma = new PrismaClient();
    try {
      const admins = await prisma.userRole.count({ where: { role: { key: ROLE_KEYS.SUPER_ADMIN }, user: { status: 'ACTIVE' } } });
      process.exitCode = admins > 0 ? 0 : 3;
    } finally {
      await prisma.$disconnect();
    }
    return;
  }
  if (!email || !email.includes('@') || !displayName) {
    console.error('Usage: create-admin --email <email> --name "<display name>" [--phone <phone>] [--force]');
    process.exit(2);
  }
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) {
    console.error('The phone number is not valid (expected a Kazakhstan mobile number).');
    process.exit(2);
  }

  const prisma = new PrismaClient();
  try {
    await syncRbac(prisma);
    const role = await prisma.role.findUniqueOrThrow({ where: { key: ROLE_KEYS.SUPER_ADMIN } });
    const existing = await prisma.userRole.count({ where: { roleId: role.id, user: { status: 'ACTIVE' } } });
    if (existing > 0 && !force) {
      console.error('A super admin already exists. Add more staff from Admin → Staff & roles (or pass --force).');
      process.exit(1);
    }
    if (await prisma.user.findUnique({ where: { email } })) {
      console.error(`An account with ${email} already exists.`);
      process.exit(1);
    }
    const supplied = process.env.ADMIN_PASSWORD;
    if (supplied !== undefined && supplied.length < 8) {
      console.error('ADMIN_PASSWORD must be at least 8 characters.');
      process.exit(2);
    }
    const password = supplied ?? `Tc-${randomBytes(9).toString('base64url')}`;
    const user = await prisma.user.create({
      data: {
        email,
        phone,
        displayName,
        passwordHash: await hashPassword(password),
        roles: { create: { roleId: role.id } },
      },
    });
    await prisma.auditLog.create({
      data: { actorId: null, actorLabel: 'create-admin script', action: 'staff.create', entityType: 'User', entityId: user.id, newValue: { email, roles: [ROLE_KEYS.SUPER_ADMIN] } },
    });
    console.log(`Super admin created: ${email}`);
    if (supplied === undefined) {
      console.log(`Temporary password (shown once — change it after signing in): ${password}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main();
