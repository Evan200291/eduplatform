// ─────────────────────────────────────────────────────────────────────────────
// Tenancy routes
// `/organizations` is platform-facing; `/schools` is shared, with a school admin
// seeing exactly one school and platform staff seeing all of them. The scoping
// is applied inside the service, so a crafted query cannot widen it.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { idParam } from '../../core/http/validate';
import { created, ok, paginated } from '../../core/http/respond';
import { validate } from '../../core/http/validate';
import { authenticate, getContext, getSchoolId } from '../../core/middleware/authenticate';
import { requirePermission } from '../../core/middleware/require-permission';
import { tenantContext } from '../../core/middleware/tenant-context';
import * as tenancy from './tenancy.service';
import {
  createOrganizationSchema,
  createSchoolSchema,
  organizationListQuery,
  publicSchoolParams,
  schoolListQuery,
  tenantStatusSchema,
  updateOrganizationSchema,
  updateSchoolSchema,
  updateSchoolSettingsSchema,
} from './tenancy.validation';

// ── Public (unauthenticated) ────────────────────────────────────────────────

const publicRouter = Router();

publicRouter.get(
  '/schools/:slug',
  validate({ params: publicSchoolParams }),
  asyncHandler(async (req, res) => {
    ok(res, await tenancy.publicSchoolProfile(req.params.slug));
  }),
);

export const publicTenancyRouter = publicRouter;

// ── Organizations ───────────────────────────────────────────────────────────

const organizationRouter = Router();
organizationRouter.use(authenticate, tenantContext);

organizationRouter.get(
  '/',
  requirePermission('organization.read'),
  validate({ query: organizationListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof tenancy.listOrganizations>[1];
    const { items, totalItems } = await tenancy.listOrganizations(getContext(req), query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

organizationRouter.post(
  '/',
  requirePermission('organization.create'),
  validate({ body: createOrganizationSchema }),
  asyncHandler(async (req, res) => {
    const organization = await tenancy.createOrganization(getContext(req), req.body);
    created(res, organization, `/api/v1/organizations/${organization.id}`);
  }),
);

organizationRouter.get(
  '/:id',
  requirePermission('organization.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await tenancy.getOrganization(getContext(req), req.params.id));
  }),
);

organizationRouter.patch(
  '/:id',
  requirePermission('organization.update'),
  validate({ params: idParam, body: updateOrganizationSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await tenancy.updateOrganization(getContext(req), req.params.id, req.body));
  }),
);

organizationRouter.post(
  '/:id/status',
  requirePermission('organization.archive'),
  validate({ params: idParam, body: tenantStatusSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await tenancy.setOrganizationStatus(
        getContext(req),
        req.params.id,
        req.body.status,
        req.body.reason,
      ),
    );
  }),
);

export const organizationRouterInstance = organizationRouter;

// ── Schools ─────────────────────────────────────────────────────────────────

const schoolRouter = Router();
schoolRouter.use(authenticate, tenantContext);

schoolRouter.get(
  '/',
  requirePermission('school.read'),
  validate({ query: schoolListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof tenancy.listSchools>[1];
    const { items, totalItems } = await tenancy.listSchools(getContext(req), query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

schoolRouter.post(
  '/',
  requirePermission('school.create'),
  validate({ body: createSchoolSchema }),
  asyncHandler(async (req, res) => {
    const school = await tenancy.createSchool(getContext(req), req.body);
    created(res, school, `/api/v1/schools/${school.id}`);
  }),
);

/** The school the caller is currently acting inside. */
schoolRouter.get(
  '/current',
  requirePermission('school.read'),
  asyncHandler(async (req, res) => {
    ok(res, await tenancy.getSchool(getContext(req), getSchoolId(req)));
  }),
);

schoolRouter.get(
  '/current/settings',
  requirePermission('school.settings.read'),
  asyncHandler(async (req, res) => {
    ok(res, await tenancy.getSchoolSettings(getSchoolId(req)));
  }),
);

schoolRouter.patch(
  '/current/settings',
  requirePermission('school.settings.write'),
  validate({ body: updateSchoolSettingsSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await tenancy.updateSchoolSettings(getContext(req), getSchoolId(req), req.body));
  }),
);

schoolRouter.get(
  '/:id',
  requirePermission('school.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await tenancy.getSchool(getContext(req), req.params.id));
  }),
);

schoolRouter.patch(
  '/:id',
  requirePermission('school.update'),
  validate({ params: idParam, body: updateSchoolSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await tenancy.updateSchool(getContext(req), req.params.id, req.body));
  }),
);

schoolRouter.get(
  '/:id/settings',
  requirePermission('school.settings.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    // Reading the school first applies the tenant scope check.
    await tenancy.getSchool(getContext(req), req.params.id);
    ok(res, await tenancy.getSchoolSettings(req.params.id));
  }),
);

schoolRouter.patch(
  '/:id/settings',
  requirePermission('school.settings.write'),
  validate({ params: idParam, body: updateSchoolSettingsSchema }),
  asyncHandler(async (req, res) => {
    await tenancy.getSchool(getContext(req), req.params.id);
    ok(res, await tenancy.updateSchoolSettings(getContext(req), req.params.id, req.body));
  }),
);

schoolRouter.post(
  '/:id/status',
  requirePermission('school.archive'),
  validate({ params: idParam, body: tenantStatusSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await tenancy.setSchoolStatus(
        getContext(req),
        req.params.id,
        req.body.status,
        req.body.reason,
      ),
    );
  }),
);

export const schoolRouterInstance = schoolRouter;
