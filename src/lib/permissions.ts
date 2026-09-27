import type { UserRole } from '../types/index.ts';

// Role -> permission mapping, shared by the API (enforcement) and the UI
// (hiding controls the user cannot use). Every authenticated role can read.
export type Permission = 'manage' | 'operate' | 'approve';

const PERMISSION_ROLES: Record<Permission, readonly UserRole[]> = {
  // Agents, policies and SDK API keys.
  manage: ['owner', 'admin'],
  // Runs, steps, incidents and browser sessions.
  operate: ['owner', 'admin', 'analyst'],
  // Approving or denying approval requests.
  approve: ['owner', 'admin', 'approver'],
};

export function hasPermission(role: string | undefined, permission: Permission): boolean {
  return !!role && (PERMISSION_ROLES[permission] as readonly string[]).includes(role);
}
