const { prisma } = require('../db');

const PERMISSION_GROUPS = {
  Dashboard: ['dashboard.operational.view', 'dashboard.financial.view', 'dashboard.executive.view'],
  Customers: ['customers.view', 'customers.create', 'customers.edit', 'customers.delete'],
  Jobs: ['jobs.view', 'jobs.create', 'jobs.edit', 'jobs.assign', 'jobs.cancel', 'jobs.review', 'job.reassign.after_dispatch'],
  Scheduling: ['schedule.view', 'schedule.manage', 'schedule.override'],
  Workforce: ['workers.view', 'workers.manage', 'workers.location.view', 'teams.manage'],
  Bookings: ['bookings.view', 'bookings.manage'],
  Quotes: ['quotes.view', 'quotes.create', 'quotes.edit', 'quotes.send', 'quote.discount.approve'],
  Invoices: ['invoices.view', 'invoices.create', 'invoices.edit', 'invoices.send', 'invoice.void', 'invoice.discount.approve'],
  Finance: ['payments.view', 'payments.manage', 'payment.refund', 'finance.reports.view', 'settings.finance.manage', 'finance.exports.manage', 'finance.integrations.manage'],
  Inventory: ['inventory.view', 'inventory.manage', 'stock.adjust', 'purchaseRequest.create', 'purchaseRequest.approve', 'purchaseOrder.manage', 'purchaseOrder.send', 'purchaseOrder.approve'],
  Company: ['company.settings.view', 'company.settings.manage', 'company.branding.manage'],
  People: ['members.view', 'members.invite', 'members.manage', 'roles.manage', 'permissions.manage'],
  Subscription: ['subscription.view', 'subscription.manage'],
  Security: ['security.view', 'security.manage', 'audit.view'],
  Integrations: ['integration.view', 'integration.manage'],
  Organization: ['branch.view', 'branch.manage', 'team.view', 'team.manage'],
  Enterprise: ['approval.policy.manage', 'approval.request.decide', 'report.enterprise.view', 'mobile.sync.manage', 'contract.automation.manage', 'contract.sla.override']
};

const permissionKeys = [...new Set(Object.values(PERMISSION_GROUPS).flat())];

// Ownership itself is not represented by a permission key. Therefore every permission
// key may be delegated when the actor is allowed to delegate it. OWNER-only powers
// (transfer ownership, delete company, remove final owner) remain protected separately.
const delegatablePermissionKeys = [...permissionKeys];

const operationsPermissions = permissionKeys.filter((key) => !key.startsWith('subscription.') && !key.startsWith('security.') && !['dashboard.financial.view', 'dashboard.executive.view', 'finance.reports.view', 'settings.finance.manage', 'finance.exports.manage', 'finance.integrations.manage', 'integration.manage', 'permissions.manage', 'roles.manage'].includes(key));
const financePermissions = permissionKeys.filter((key) => key.startsWith('invoices.') || key.startsWith('payments.') || key.startsWith('finance.') || key === 'settings.finance.manage' || key === 'dashboard.financial.view' || key === 'invoice.void' || key === 'invoice.discount.approve' || key === 'payment.refund');
const workerPermissions = ['dashboard.operational.view', 'jobs.view', 'schedule.view'];

const defaultPermissionBundles = {
  OWNER: permissionKeys,
  ADMIN: permissionKeys.filter((key) => !key.startsWith('subscription.') && !['security.manage', 'integration.manage', 'permissions.manage', 'roles.manage'].includes(key)),
  WORKER: workerPermissions,
  CLIENT: []
};

const SYSTEM_ROLE_TEMPLATES = [
  { key: 'owner', name: 'Owner', description: 'Legal company owner with full access.', systemRole: 'OWNER', permissions: permissionKeys, scope: 'COMPANY' },
  { key: 'executive', name: 'Executive / COO', description: 'Senior executive access across the company without ownership powers.', systemRole: 'ADMIN', permissions: delegatablePermissionKeys, scope: 'COMPANY' },
  { key: 'general-manager', name: 'General Manager', description: 'Broad company management excluding ownership powers.', systemRole: 'ADMIN', permissions: defaultPermissionBundles.ADMIN, scope: 'COMPANY' },
  { key: 'operations-manager', name: 'Operations Manager', description: 'Jobs, scheduling, workforce, customers, and operational reporting.', systemRole: 'ADMIN', permissions: operationsPermissions, scope: 'COMPANY' },
  { key: 'finance-manager', name: 'Finance Manager', description: 'Finance leadership, reporting, invoices, payments, and exports.', systemRole: 'ADMIN', permissions: financePermissions.concat(['members.view']), scope: 'COMPANY' },
  { key: 'accountant', name: 'Accountant', description: 'Invoices, payments, finance reports, exports, and accounting integrations.', systemRole: 'ADMIN', permissions: financePermissions.filter((key) => !['payment.refund', 'invoice.void', 'invoice.discount.approve'].includes(key)), scope: 'COMPANY' },
  { key: 'office-administrator', name: 'Office Administrator', description: 'Customers, bookings, quotes, jobs, and everyday office administration.', systemRole: 'ADMIN', permissions: operationsPermissions.concat(['company.settings.view', 'members.view']), scope: 'COMPANY' },
  { key: 'dispatcher', name: 'Dispatcher / Scheduler', description: 'Scheduling, assignments, workers, and active jobs.', systemRole: 'ADMIN', permissions: ['dashboard.operational.view', 'jobs.view', 'jobs.edit', 'jobs.assign', 'schedule.view', 'schedule.manage', 'workers.view', 'workers.location.view', 'customers.view'], scope: 'COMPANY' },
  { key: 'customer-service', name: 'Customer Service', description: 'Customers, bookings, quotes, and job status visibility.', systemRole: 'ADMIN', permissions: ['dashboard.operational.view', 'customers.view', 'customers.create', 'customers.edit', 'bookings.view', 'bookings.manage', 'quotes.view', 'quotes.create', 'jobs.view'], scope: 'COMPANY' },
  { key: 'department-manager', name: 'Department Manager', description: 'Operational management within an assigned branch or team.', systemRole: 'ADMIN', permissions: operationsPermissions, scope: 'BRANCH' },
  // Supervisors use ADMIN as the coarse web-app classification. Their real access is
  // restricted by permissions + TEAM scope, so they can supervise without being treated
  // as a field-only WORKER by legacy routes and navigation.
  { key: 'team-supervisor', name: 'Team Supervisor', description: 'Supervises workers and jobs in an assigned team.', systemRole: 'ADMIN', permissions: ['dashboard.operational.view', 'jobs.view', 'jobs.review', 'schedule.view', 'workers.view', 'team.view'], scope: 'TEAM' },
  { key: 'senior-field-worker', name: 'Senior Field Worker / Senior Technician', description: 'Field work plus limited team review.', systemRole: 'WORKER', permissions: workerPermissions.concat(['jobs.review', 'team.view']), scope: 'TEAM' },
  { key: 'field-worker', name: 'Field Worker / Technician', description: 'Own assigned jobs and schedule.', systemRole: 'WORKER', permissions: workerPermissions, scope: 'SELF' },
  { key: 'apprentice', name: 'Apprentice / Junior Field Worker', description: 'Own assigned work with restricted operational actions.', systemRole: 'WORKER', permissions: workerPermissions, scope: 'SELF' }
];

function uniquePermissions(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((key) => permissionKeys.includes(key)))];
}

function isSubset(requested, allowed) {
  const allowedSet = new Set(allowed || []);
  return uniquePermissions(requested).every((key) => allowedSet.has(key));
}

function scopeContains(actorAccess, requested = {}) {
  if (!actorAccess) return false;
  if (actorAccess.scopeType === 'COMPANY') return true;
  if (requested.scopeType === 'SELF') return true;
  if (actorAccess.scopeType === 'SELF') return false;
  if (actorAccess.scopeType === 'BRANCH') {
    if (requested.scopeType !== 'BRANCH') return false;
    const allowed = new Set(actorAccess.branchIds || []);
    return (requested.branchIds || []).every((id) => allowed.has(id));
  }
  if (actorAccess.scopeType === 'TEAM') {
    if (requested.scopeType !== 'TEAM') return false;
    const allowed = new Set(actorAccess.teamIds || []);
    return (requested.teamIds || []).every((id) => allowed.has(id));
  }
  return false;
}

async function effectiveAccessForUser(user, options = {}) {
  if (!user) return { permissions: [], scopeType: 'SELF', branchIds: [], teamIds: [] };
  const companyId = options.companyId || user.companyId;
  const permissions = new Set(defaultPermissionBundles[user.role] || []);
  let scopeType = user.role === 'WORKER' ? 'SELF' : 'COMPANY';

  if (user.roleTemplateId && prisma.permissionRoleTemplate) {
    const template = await prisma.permissionRoleTemplate.findFirst({ where: { id: user.roleTemplateId, active: true, OR: [{ companyId }, { companyId: null }] } });
    if (template) {
      permissions.clear();
      uniquePermissions(template.defaultPermissions).forEach((key) => permissions.add(key));
      scopeType = template.defaultScopeType || scopeType;
    }
  }

  const overrides = prisma.userPermissionOverride ? await prisma.userPermissionOverride.findMany({ where: { companyId, userId: user.id } }) : [];
  for (const override of overrides.filter((item) => !item.branchId || !options.branchId || item.branchId === options.branchId)) {
    if (!permissionKeys.includes(override.permissionKey)) continue;
    if (override.allowed) permissions.add(override.permissionKey);
    else permissions.delete(override.permissionKey);
  }

  const branchAccesses = prisma.userBranchAccess ? await prisma.userBranchAccess.findMany({ where: { companyId, userId: user.id, active: true } }) : [];
  const grants = prisma.userAccessGrant ? await prisma.userAccessGrant.findMany({ where: { companyId, userId: user.id, active: true } }) : [];
  const branchIds = [...new Set(branchAccesses.map((item) => item.branchId).concat(grants.filter((item) => item.scopeType === 'BRANCH' && item.branchId).map((item) => item.branchId)))];
  const teamIds = [...new Set(grants.filter((item) => item.scopeType === 'TEAM' && item.teamId).map((item) => item.teamId))];

  // Grants may add capabilities, but they never widen the data scope by themselves.
  for (const grant of grants) uniquePermissions(grant.permissions).forEach((key) => permissions.add(key));
  if (grants.some((item) => item.scopeType === 'COMPANY')) scopeType = 'COMPANY';
  else if (teamIds.length) scopeType = 'TEAM';
  else if (branchIds.length) scopeType = 'BRANCH';
  else scopeType = user.defaultScopeType || scopeType;

  if (user.role === 'OWNER') {
    permissionKeys.forEach((key) => permissions.add(key));
    scopeType = 'COMPANY';
  }
  return { permissions: [...permissions].sort(), scopeType, branchIds, teamIds };
}

async function seedSystemRoleTemplates(client = prisma) {
  if (!client.permissionRoleTemplate) return [];
  const rows = [];
  for (const template of SYSTEM_ROLE_TEMPLATES) {
    const existing = await client.permissionRoleTemplate.findFirst({ where: { companyId: null, key: template.key, verticalKey: 'generic' } });
    const data = { key: template.key, name: template.name, description: template.description, verticalKey: 'generic', systemRole: template.systemRole, isSystemTemplate: true, isCustom: false, defaultPermissions: uniquePermissions(template.permissions), defaultScopeType: template.scope, active: true };
    rows.push(existing ? await client.permissionRoleTemplate.update({ where: { id: existing.id }, data }) : await client.permissionRoleTemplate.create({ data }));
  }
  return rows;
}

module.exports = {
  PERMISSION_GROUPS,
  SYSTEM_ROLE_TEMPLATES,
  defaultPermissionBundles,
  delegatablePermissionKeys,
  effectiveAccessForUser,
  isSubset,
  permissionKeys,
  scopeContains,
  seedSystemRoleTemplates,
  uniquePermissions
};
