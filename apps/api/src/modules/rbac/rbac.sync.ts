import type { PrismaClient } from '@prisma/client';
import { ALL_PERMISSIONS, DEFAULT_ROLES, PERMISSIONS, ROLE_KEYS } from './permissions';

/**
 * Makes the database match the permission catalog in code:
 * - every permission key exists (new features add keys),
 * - default roles exist (created with their default permissions),
 * - SUPER_ADMIN always holds every permission.
 * Existing role assignments edited by admins are left untouched.
 */
export async function syncRbac(prisma: PrismaClient): Promise<void> {
  for (const key of ALL_PERMISSIONS) {
    const def = PERMISSIONS[key];
    await prisma.permission.upsert({
      where: { key },
      create: { key, group: def.group, description: def.description },
      update: { group: def.group, description: def.description },
    });
  }
  const permissions = await prisma.permission.findMany();
  const byKey = new Map(permissions.map((p) => [p.key, p.id]));

  for (const [key, role] of Object.entries(DEFAULT_ROLES)) {
    const existing = await prisma.role.findUnique({ where: { key } });
    if (existing) continue;
    await prisma.role.create({
      data: {
        key,
        name: role.name,
        description: role.description,
        isSystem: true,
        permissions: { create: role.permissions.map((p) => ({ permissionId: byKey.get(p)! })) },
      },
    });
  }

  const superAdmin = await prisma.role.findUniqueOrThrow({ where: { key: ROLE_KEYS.SUPER_ADMIN } });
  await prisma.rolePermission.createMany({
    data: permissions.map((p) => ({ roleId: superAdmin.id, permissionId: p.id })),
    skipDuplicates: true,
  });
}
