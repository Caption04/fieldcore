const { prisma } = require('../db');

const PERMISSION_CATALOG = [
  {
    key: 'Home',
    label: 'Home page',
    help: 'Choose which summaries they can see when they sign in.',
    permissions: [
      { key: 'dashboard.operational.view', label: 'View work summary', help: 'Jobs, workers, and today’s schedule.', targets: ['index.html', 'GET /api/dashboard'] },
      { key: 'dashboard.financial.view', label: 'View money summary', help: 'Money received and unpaid invoices.', targets: ['index.html', 'GET /api/dashboard'] }
    ]
  },
  {
    key: 'Customers',
    label: 'Customers',
    help: 'Choose what they can do with customer records.',
    permissions: [
      { key: 'customers.view', label: 'View customers', targets: ['customers.html', 'GET /api/customers'] },
      { key: 'customers.create', label: 'Add customers', targets: ['POST /api/customers'] },
      { key: 'customers.edit', label: 'Edit customers', targets: ['PATCH /api/customers/:id'] },
      { key: 'customers.delete', label: 'Delete customers', targets: ['DELETE /api/customers/:id'] }
    ]
  },
  {
    key: 'Jobs',
    label: 'Jobs',
    help: 'Choose what they can do with jobs.',
    permissions: [
      { key: 'jobs.view', label: 'View jobs', targets: ['jobs.html', 'GET /api/jobs'] },
      { key: 'jobs.create', label: 'Add jobs', targets: ['POST /api/jobs'] },
      { key: 'jobs.edit', label: 'Edit jobs', targets: ['PATCH /api/jobs/:id'] },
      { key: 'jobs.assign', label: 'Assign jobs', targets: ['POST /api/jobs/:id/assign-worker'] },
      { key: 'job.reassign.after_dispatch', label: 'Move a dispatched job', help: 'Change the worker after dispatch.', targets: ['POST /api/jobs/:id/assign-worker'] }
    ]
  },
  {
    key: 'Scheduling',
    label: 'Schedule',
    help: 'Choose what they can do with the work calendar.',
    permissions: [
      { key: 'schedule.view', label: 'View the schedule', targets: ['schedule.html', 'GET /api/schedule'] },
      { key: 'schedule.manage', label: 'Change the schedule', targets: ['POST/PATCH/DELETE /api/schedule'] },
      { key: 'schedule.override', label: 'Ignore schedule warnings', help: 'Allow a job even when the system finds a clash.', targets: ['adminOverride on schedule actions'] }
    ]
  },
  {
    key: 'Workforce',
    label: 'Workers',
    help: 'Choose what they can see and change about workers.',
    permissions: [
      { key: 'workers.view', label: 'View workers', targets: ['GET /api/workers'] },
      { key: 'workers.manage', label: 'Manage workers', targets: ['POST/PATCH /api/workers'] },
      { key: 'workers.location.view', label: 'View worker locations', targets: ['map.html', 'GET /api/worker-location/latest'] }
    ]
  },
  {
    key: 'Bookings',
    label: 'Booking requests',
    help: 'Choose what they can do with new customer requests.',
    permissions: [
      { key: 'bookings.view', label: 'View booking requests', targets: ['booking-requests.html', 'GET /api/booking-requests'] },
      { key: 'bookings.manage', label: 'Manage booking requests', help: 'Review, decline, or turn a request into work.', targets: ['POST /api/booking-requests/:id/*'] }
    ]
  },
  {
    key: 'Quotes',
    label: 'Quotes',
    help: 'Choose what they can do with quotes.',
    permissions: [
      { key: 'quotes.view', label: 'View quotes', targets: ['quotes.html', 'GET /api/quotes'] },
      { key: 'quotes.create', label: 'Create quotes', targets: ['POST /api/quotes'] },
      { key: 'quotes.edit', label: 'Edit quotes', targets: ['PATCH /api/quotes/:id'] },
      { key: 'quotes.send', label: 'Send quotes', targets: ['POST /api/quotes/:id/send'] },
      { key: 'quote.discount.approve', label: 'Approve quote discounts', targets: ['quote discount approval'] }
    ]
  },
  {
    key: 'Invoices',
    label: 'Invoices',
    help: 'Choose what they can do with invoices.',
    permissions: [
      { key: 'invoices.view', label: 'View invoices', targets: ['invoices.html', 'GET /api/invoices'] },
      { key: 'invoices.create', label: 'Create invoices', targets: ['POST /api/invoices'] },
      { key: 'invoices.edit', label: 'Edit invoices', targets: ['PATCH /api/invoices/:id'] },
      { key: 'invoices.send', label: 'Send invoices', targets: ['POST /api/invoices/:id/send'] },
      { key: 'invoice.void', label: 'Cancel invoices', targets: ['POST /api/invoices/:id/void'] },
      { key: 'invoice.discount.approve', label: 'Approve invoice discounts', targets: ['invoice discount approval'] }
    ]
  },
  {
    key: 'Finance',
    label: 'Money',
    help: 'Choose what they can do with payments and money settings.',
    permissions: [
      { key: 'payments.view', label: 'View payments', targets: ['collections.html', 'GET /api/payments'] },
      { key: 'payments.manage', label: 'Manage payments', targets: ['POST/PATCH /api/payments'] },
      { key: 'payment.refund', label: 'Approve refunds', targets: ['POST /api/payments/:id/refund'] },
      { key: 'settings.finance.manage', label: 'Change money settings', targets: ['settings.html#finance', 'PATCH /api/company/finance-settings'] },
      { key: 'finance.exports.manage', label: 'Download money files', targets: ['GET /api/finance/export/*', 'GET /api/reports/export'] },
      { key: 'finance.integrations.manage', label: 'Manage accounting links', help: 'Connect or update the company accounting system.', targets: ['settings.html#finance', 'GET/POST/PATCH /api/finance/integrations'] }
    ]
  },
  {
    key: 'Reports',
    label: 'Reports',
    help: 'Choose the business results they can see.',
    permissions: [
      { key: 'dashboard.executive.view', label: 'View business performance', help: 'Money, jobs, workers, sales, branches, and stock in one place.', targets: ['executive-dashboard.html', 'GET /api/analytics/*'] },
      { key: 'reports.money.view', label: 'View money reports', targets: ['reports.html', 'money report APIs'] },
      { key: 'reports.work.view', label: 'View job reports', targets: ['reports.html', 'job and SLA report APIs'] },
      { key: 'reports.workers.view', label: 'View worker reports', targets: ['reports.html', 'worker report APIs'] },
      { key: 'reports.sales.view', label: 'View sales and customer reports', targets: ['reports.html', 'sales report APIs'] },
      { key: 'reports.stock.view', label: 'View stock reports', targets: ['reports.html', 'stock report APIs'] }
    ]
  },
  {
    key: 'Inventory',
    label: 'Stock and buying',
    help: 'Choose what they can do with stock and orders.',
    permissions: [
      { key: 'inventory.view', label: 'View stock', targets: ['inventory.html', 'GET /api/inventory'] },
      { key: 'inventory.manage', label: 'Manage stock', targets: ['POST/PATCH/DELETE /api/inventory'] },
      { key: 'stock.adjust', label: 'Change stock counts', targets: ['POST /api/inventory/adjustments'] },
      { key: 'purchaseRequest.create', label: 'Create purchase requests', targets: ['purchase-requests.html', 'POST /api/purchase-requests'] },
      { key: 'purchaseRequest.approve', label: 'Approve purchase requests', targets: ['POST /api/purchase-requests/:id/approve'] },
      { key: 'purchaseOrder.manage', label: 'Manage purchase orders', targets: ['purchase-orders.html', 'GET/POST/PATCH /api/purchase-orders'] },
      { key: 'purchaseOrder.send', label: 'Send purchase orders', targets: ['POST /api/purchase-orders/:id/send'] },
      { key: 'purchaseOrder.approve', label: 'Approve purchase orders', targets: ['POST /api/purchase-orders/:id/approve'] }
    ]
  },
  {
    key: 'Company',
    label: 'Company settings',
    help: 'Choose which company settings they can see or change.',
    permissions: [
      { key: 'company.settings.view', label: 'View company settings', targets: ['settings.html'] },
      { key: 'company.settings.manage', label: 'Change company settings', targets: ['PATCH /api/company/profile', 'PATCH /api/company/scheduling-settings'] },
      { key: 'company.branding.manage', label: 'Change company brand', targets: ['PATCH /api/company/branding'] }
    ]
  },
  {
    key: 'People',
    label: 'Team access',
    help: 'Choose what they can do with company accounts and saved roles.',
    permissions: [
      { key: 'members.view', label: 'View company members', targets: ['members.html', 'GET /api/members'] },
      { key: 'members.invite', label: 'Invite members', targets: ['POST /api/member-invitations'] },
      { key: 'members.manage', label: 'Disable members and invites', targets: ['PATCH /api/members/:id/status', 'revoke invite'] },
      { key: 'roles.manage', label: 'Create saved roles', targets: ['POST /api/role-templates'] },
      { key: 'permissions.manage', label: 'Change member access', targets: ['PATCH /api/members/:id/access'] }
    ]
  },
  {
    key: 'Security',
    label: 'Security',
    help: 'Choose which company security records they can see.',
    permissions: [
      { key: 'security.view', label: 'View security activity', targets: ['security-center.html', 'GET /api/security/events'] },
      { key: 'audit.view', label: 'View company activity', targets: ['settings.html#admin-tools', 'GET /api/audit-logs'] }
    ]
  },
  {
    key: 'Messages',
    label: 'Sent messages',
    help: 'Choose who can check messages sent by FieldCore.',
    permissions: [
      { key: 'notifications.view', label: 'View sent messages', targets: ['settings.html#notifications', 'GET /api/notification-logs'] }
    ]
  },
  {
    key: 'Integrations',
    label: 'Connected apps',
    help: 'Choose who can see or change connected services.',
    permissions: [
      { key: 'integration.view', label: 'View connected apps', targets: ['settings.html#integrations', 'GET /api/admin/integrations'] },
      { key: 'integration.manage', label: 'Manage connected apps', targets: ['POST/PATCH /api/admin/integrations'] }
    ]
  },
  {
    key: 'Organization',
    label: 'Branches and teams',
    help: 'Choose what they can do with branches and teams.',
    permissions: [
      { key: 'branch.view', label: 'View branches', targets: ['branches.html', 'GET /api/branches'] },
      { key: 'branch.manage', label: 'Manage branches', targets: ['POST/PATCH/DELETE /api/branches'] },
      { key: 'team.view', label: 'View teams', targets: ['GET /api/teams'] },
      { key: 'team.manage', label: 'Manage teams', targets: ['POST/PATCH /api/teams'] }
    ]
  },
  {
    key: 'Approvals',
    label: 'Approvals',
    help: 'Choose who can set rules or approve requests.',
    permissions: [
      { key: 'approval.policy.manage', label: 'Set approval rules', targets: ['POST/PATCH /api/approval-policies'] },
      { key: 'approval.request.decide', label: 'Approve or reject requests', targets: ['approvals.html', 'POST /api/approvals/:id/*'] }
    ]
  },
  {
    key: 'Enterprise',
    label: 'Advanced tools',
    help: 'Only turn these on when the person needs these tools.',
    permissions: [
      { key: 'mobile.sync.manage', label: 'Manage worker app sync', targets: ['mobile-sync.html', '/api/admin/mobile-sync/*'] },
      { key: 'contract.automation.manage', label: 'Manage assets and contracts', targets: ['assets.html', 'service-contracts.html', 'contract-automation.html'] },
      { key: 'contract.sla.override', label: 'Override service deadlines', targets: ['POST /api/jobs/:id/sla/waive'] }
    ]
  }
];

const PERMISSION_GROUPS = Object.fromEntries(PERMISSION_CATALOG.map((group) => [group.key, group.permissions.map((item) => item.key)]));
const FULL_ACCESS_ONLY_PERMISSION_KEYS = ['subscription.view', 'subscription.manage'];
const CURRENT_PERMISSION_KEYS = [...new Set(PERMISSION_CATALOG.flatMap((group) => group.permissions.map((item) => item.key)).concat(FULL_ACCESS_ONLY_PERMISSION_KEYS))];

// Old keys remain valid for saved roles, but they are never shown as new choices.
const LEGACY_PERMISSION_KEYS = [
  'finance.reports.view',
  'report.enterprise.view',
  'jobs.cancel',
  'jobs.review',
  'teams.manage',
  'security.manage'
];
const permissionKeys = [...new Set(CURRENT_PERMISSION_KEYS.concat(LEGACY_PERMISSION_KEYS))];
const delegatablePermissionKeys = [...CURRENT_PERMISSION_KEYS];

const PERMISSION_DEPENDENCIES = {
  'customers.create': ['customers.view'],
  'customers.edit': ['customers.view'],
  'customers.delete': ['customers.view'],
  'jobs.create': ['jobs.view'],
  'jobs.edit': ['jobs.view'],
  'jobs.assign': ['jobs.view', 'workers.view'],
  'job.reassign.after_dispatch': ['jobs.assign'],
  'schedule.manage': ['schedule.view', 'jobs.view', 'workers.view'],
  'schedule.override': ['schedule.manage'],
  'workers.manage': ['workers.view'],
  'workers.location.view': ['workers.view'],
  'bookings.manage': ['bookings.view'],
  'quotes.create': ['quotes.view'],
  'quotes.edit': ['quotes.view'],
  'quotes.send': ['quotes.view'],
  'quote.discount.approve': ['quotes.view'],
  'invoices.create': ['invoices.view'],
  'invoices.edit': ['invoices.view'],
  'invoices.send': ['invoices.view'],
  'invoice.void': ['invoices.view'],
  'invoice.discount.approve': ['invoices.view'],
  'payments.manage': ['payments.view'],
  'payment.refund': ['payments.manage'],
  'inventory.manage': ['inventory.view'],
  'stock.adjust': ['inventory.manage'],
  'purchaseRequest.approve': ['purchaseRequest.create'],
  'purchaseOrder.send': ['purchaseOrder.manage'],
  'purchaseOrder.approve': ['purchaseOrder.manage'],
  'company.settings.manage': ['company.settings.view'],
  'company.branding.manage': ['company.settings.view'],
  'members.invite': ['members.view'],
  'members.manage': ['members.view'],
  'roles.manage': ['members.view'],
  'permissions.manage': ['members.view'],
  'subscription.manage': ['subscription.view'],
  'integration.manage': ['integration.view'],
  'branch.manage': ['branch.view'],
  'team.manage': ['team.view'],
  'contract.sla.override': ['contract.automation.manage']
};

function expandPermissionDependencies(values) {
  const expanded = new Set((Array.isArray(values) ? values : []).filter((key) => permissionKeys.includes(key)));
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of [...expanded]) {
      for (const dependency of PERMISSION_DEPENDENCIES[key] || []) {
        if (!expanded.has(dependency)) {
          expanded.add(dependency);
          changed = true;
        }
      }
    }
  }
  return [...expanded];
}

const operationsPermissions = delegatablePermissionKeys.filter((key) => !key.startsWith('subscription.') && !key.startsWith('security.') && !['dashboard.financial.view', 'dashboard.executive.view', 'reports.money.view', 'settings.finance.manage', 'finance.exports.manage', 'finance.integrations.manage', 'integration.manage', 'permissions.manage', 'roles.manage'].includes(key));
const financePermissions = delegatablePermissionKeys.filter((key) => key.startsWith('invoices.') || key.startsWith('payments.') || key === 'finance.exports.manage' || key === 'finance.integrations.manage' || key === 'reports.money.view' || key === 'settings.finance.manage' || key === 'dashboard.financial.view' || key === 'invoice.void' || key === 'invoice.discount.approve' || key === 'payment.refund');
const workerPermissions = ['dashboard.operational.view', 'jobs.view', 'schedule.view'];

const defaultPermissionBundles = {
  OWNER: delegatablePermissionKeys,
  ADMIN: delegatablePermissionKeys.filter((key) => !key.startsWith('subscription.') && !['integration.manage', 'permissions.manage', 'roles.manage'].includes(key)),
  WORKER: workerPermissions,
  CLIENT: []
};

const SYSTEM_ROLE_TEMPLATES = [
  { key: 'owner', name: 'Owner', description: 'Legal company owner with full access.', systemRole: 'OWNER', permissions: delegatablePermissionKeys, scope: 'COMPANY' },
  { key: 'executive', name: 'Executive / COO', description: 'Senior executive access across the company without ownership powers.', systemRole: 'ADMIN', permissions: delegatablePermissionKeys, scope: 'COMPANY' },
  { key: 'general-manager', name: 'General Manager', description: 'Broad company management excluding ownership powers.', systemRole: 'ADMIN', permissions: defaultPermissionBundles.ADMIN, scope: 'COMPANY' },
  { key: 'operations-manager', name: 'Operations Manager', description: 'Jobs, scheduling, workers, customers, and work reports.', systemRole: 'ADMIN', permissions: operationsPermissions, scope: 'COMPANY' },
  { key: 'finance-manager', name: 'Finance Manager', description: 'Invoices, payments, money reports, and exports.', systemRole: 'ADMIN', permissions: financePermissions.concat(['members.view']), scope: 'COMPANY' },
  { key: 'accountant', name: 'Accountant', description: 'Invoices, payments, money reports, exports, and accounting links.', systemRole: 'ADMIN', permissions: financePermissions.filter((key) => !['payment.refund', 'invoice.void', 'invoice.discount.approve'].includes(key)), scope: 'COMPANY' },
  { key: 'office-administrator', name: 'Office Administrator', description: 'Customers, bookings, quotes, jobs, and daily office work.', systemRole: 'ADMIN', permissions: operationsPermissions.concat(['company.settings.view', 'members.view']), scope: 'COMPANY' },
  { key: 'dispatcher', name: 'Dispatcher / Scheduler', description: 'Schedules work, assigns workers, and follows active jobs.', systemRole: 'ADMIN', permissions: ['dashboard.operational.view', 'jobs.view', 'jobs.edit', 'jobs.assign', 'schedule.view', 'schedule.manage', 'workers.view', 'workers.location.view', 'customers.view'], scope: 'COMPANY' },
  { key: 'customer-service', name: 'Customer Service', description: 'Customers, booking requests, quotes, and job updates.', systemRole: 'ADMIN', permissions: ['dashboard.operational.view', 'customers.view', 'customers.create', 'customers.edit', 'bookings.view', 'bookings.manage', 'quotes.view', 'quotes.create', 'jobs.view'], scope: 'COMPANY' },
  { key: 'department-manager', name: 'Department Manager', description: 'Manages work in an assigned branch or team.', systemRole: 'ADMIN', permissions: operationsPermissions, scope: 'BRANCH' },
  { key: 'team-supervisor', name: 'Team Supervisor', description: 'Sees workers and jobs in an assigned team.', systemRole: 'ADMIN', permissions: ['dashboard.operational.view', 'jobs.view', 'jobs.edit', 'schedule.view', 'workers.view', 'team.view'], scope: 'TEAM' },
  { key: 'senior-field-worker', name: 'Senior Field Worker / Senior Technician', description: 'Completes field work and sees their team.', systemRole: 'WORKER', permissions: workerPermissions.concat(['team.view']), scope: 'TEAM' },
  { key: 'field-worker', name: 'Field Worker / Technician', description: 'Sees their own jobs and schedule.', systemRole: 'WORKER', permissions: workerPermissions, scope: 'SELF' },
  { key: 'apprentice', name: 'Apprentice / Junior Field Worker', description: 'Sees their own assigned work.', systemRole: 'WORKER', permissions: workerPermissions, scope: 'SELF' }
];

function uniquePermissions(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((key) => permissionKeys.includes(key)))];
}

function isSubset(requested, allowed) {
  const allowedSet = new Set(allowed || []);
  return uniquePermissions(requested).every((key) => allowedSet.has(key));
}

function hasFullBusinessAccess(user, access) {
  if (!user || !access) return false;
  if (user.role === 'OWNER') return true;
  return user.fullBusinessAccess === true && access.scopeType === 'COMPANY';
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
  let templateApplied = false;

  if (user.roleTemplateId && prisma.permissionRoleTemplate) {
    const template = await prisma.permissionRoleTemplate.findFirst({ where: { id: user.roleTemplateId, active: true, OR: [{ companyId }, { companyId: null }] } });
    if (template) {
      templateApplied = true;
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

  // Preserve the former broad ADMIN behavior only for old, unconfigured accounts.
  // Invited/configured members use a saved role, overrides, or scoped grants and therefore
  // receive only the access that was explicitly selected for them.
  const isUnconfiguredLegacyAdmin = user.role === 'ADMIN'
    && !templateApplied
    && overrides.length === 0
    && grants.length === 0
    && branchAccesses.length === 0;
  if (isUnconfiguredLegacyAdmin) permissions.add('integration.manage');

  // Grants may add capabilities, but they never widen the data scope by themselves.
  for (const grant of grants) uniquePermissions(grant.permissions).forEach((key) => permissions.add(key));
  if (grants.some((item) => item.scopeType === 'COMPANY')) scopeType = 'COMPANY';
  else if (teamIds.length) scopeType = 'TEAM';
  else if (branchIds.length) scopeType = 'BRANCH';
  else scopeType = user.defaultScopeType || scopeType;

  // Translate older saved permissions into current working access.
  if (permissions.has('finance.reports.view')) permissions.add('reports.money.view');
  if (permissions.has('report.enterprise.view')) {
    permissions.add('reports.work.view');
    permissions.add('reports.workers.view');
    permissions.add('reports.sales.view');
    permissions.add('reports.stock.view');
  }
  if (permissions.has('jobs.cancel') || permissions.has('jobs.review')) permissions.add('jobs.edit');
  if (permissions.has('teams.manage')) permissions.add('team.manage');
  if (permissions.has('security.manage')) permissions.add('security.view');

  if (user.role === 'OWNER') {
    delegatablePermissionKeys.forEach((key) => permissions.add(key));
    permissions.add('finance.integrations.manage');
    scopeType = 'COMPANY';
  }
  return { permissions: expandPermissionDependencies([...permissions]).filter((key) => permissionKeys.includes(key)).sort(), scopeType, branchIds, teamIds };
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
  FULL_ACCESS_ONLY_PERMISSION_KEYS,
  PERMISSION_CATALOG,
  PERMISSION_DEPENDENCIES,
  PERMISSION_GROUPS,
  SYSTEM_ROLE_TEMPLATES,
  defaultPermissionBundles,
  delegatablePermissionKeys,
  effectiveAccessForUser,
  expandPermissionDependencies,
  hasFullBusinessAccess,
  isSubset,
  permissionKeys,
  scopeContains,
  seedSystemRoleTemplates,
  uniquePermissions
};
