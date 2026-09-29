/**
 * DFD Level 1 data store D6 "Service Requests" (process 5.0)
 * Activity: "Submit Service Request" (Guest), "Handle Escalated Guest Request" (Receptionist)
 * Use case: Handle Escalated AI Query ; UC-2 ; UC-3 step 4 (operational exceptions)
 * Charges on service requests are added to the final bill at check-out (Payment.Contactless.Process: incidental charges).
 * IMPLEMENTATION ASSUMPTION: the service catalogue and prices below are not in the documents.
 */
import { prisma } from '../../lib/prisma.js';
import { badRequest, forbidden, notFound, unprocessable } from '../../lib/errors.js';
import { toNumber } from '../../lib/money.js';
import { trace } from '../../lib/trace.js';
import { AuditLog } from '../../domain/AuditLog.js';
import { ROLES } from '../../domain/rbac.js';
import { hasPermission } from '../../middleware/auth.js';
import { notificationService } from '../../integrations/NotificationService.js';

export const SERVICE_CATALOG = {
  AMENITIES: { label: 'Amenities delivery', charge: 0, eta: 'Housekeeping usually delivers within 20 minutes.' },
  HOUSEKEEPING: { label: 'Housekeeping', charge: 0, eta: 'Housekeeping will come by within the hour.' },
  LATE_CHECKOUT: { label: 'Late check-out (until 2 pm)', charge: 1500, eta: 'The front desk will confirm availability shortly.' },
  EARLY_CHECKIN: { label: 'Early check-in', charge: 1500, eta: 'The front desk will confirm availability shortly.' },
  EXTRA_BED: { label: 'Extra bed', charge: 2000, eta: 'It will be set up before the evening.' },
  TRANSPORT: { label: 'Airport / taxi transfer', charge: 1800, eta: 'The concierge desk will confirm the pick-up time.' },
  MAINTENANCE: { label: 'Maintenance', charge: 0, eta: 'An engineer will visit within 30 minutes.' },
  WAKE_UP_CALL: { label: 'Wake-up call', charge: 0, eta: 'The front desk will call your room at the requested time.' },
  ROOM_SERVICE: { label: 'Room service', charge: 0, eta: 'In-room dining will call to confirm your order.' },
  SPA: { label: 'Spa appointment', charge: 3500, eta: 'The spa will confirm your slot.' },
  CONCIERGE_ESCALATION: { label: 'Question for the front desk', charge: 0, eta: 'A receptionist will reply shortly.' },
  OTHER: { label: 'Other request', charge: 0, eta: 'Our team will get back to you shortly.' },
};

function view(s) {
  return {
    id: s.id, category: s.category, label: SERVICE_CATALOG[s.category]?.label ?? s.category, description: s.description, status: s.status,
    isEscalation: s.isEscalation, charge: toNumber(s.charge), staffNote: s.staffNote, createdAt: s.createdAt, updatedAt: s.updatedAt, completedAt: s.completedAt,
    guest: s.guest ? { id: s.guest.id, name: s.guest.user?.name, guestId: s.guest.guestId } : undefined,
    reservation: s.reservation ? { id: s.reservation.id, reservationNumber: s.reservation.reservationNumber, roomNumber: s.reservation.room?.roomNumber } : null,
    assignedTo: s.assignedTo?.name ?? null,
    conversation: s.conversation ? { query: s.conversation.query } : null,
  };
}

const include = {
  guest: { include: { user: { select: { name: true } } } },
  reservation: { include: { room: { select: { roomNumber: true } } } },
  assignedTo: { select: { name: true } },
  conversation: { select: { query: true } },
};

/** "Submit Service Request" */
export async function createServiceRequest(user, { category, description, reservationId }, { skipTrace } = {}) {
  const spec = SERVICE_CATALOG[category];
  if (!spec || category === 'CONCIERGE_ESCALATION') throw badRequest('Unknown service category.');
  let reservation = null;
  if (reservationId) {
    reservation = await prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!reservation || reservation.guestId !== user.guestPk) throw notFound('Reservation');
    if (!['CONFIRMED', 'CHECKED_IN'].includes(reservation.status)) throw unprocessable('NO_ACTIVE_STAY', 'Service requests can only be made for a confirmed or current stay.');
  }
  if (!skipTrace) trace('Guest', 'HRMS', 'Submit Service Request', { ref: 'Activity', activity: 'Submit Service Request', dfd: '5.0 → D6 Service Requests' });
  const created = await prisma.serviceRequest.create({
    data: { guestId: user.guestPk, reservationId: reservation?.id ?? null, category, description, charge: spec.charge },
    include,
  });
  await notificationService.notifyRole([ROLES.RECEPTIONIST], { type: 'SERVICE_REQUEST', subject: `New request: ${spec.label}`, body: `${user.name}${created.reservation ? ` (room ${created.reservation.room.roomNumber})` : ''}: ${description.slice(0, 160)}` });
  await AuditLog.record({ action: 'SERVICE_REQUEST_CREATED', entityType: 'ServiceRequest', entityId: created.id, performedBy: user.id, details: { category, charge: spec.charge } });
  return view(created);
}

export async function listServiceRequests(user, q = {}) {
  const where = {};
  if (user.guestPk) where.guestId = user.guestPk;
  else if (!hasPermission(user, 'service.manage')) throw forbidden();
  if (q.status) where.status = { in: q.status.split(',') };
  if (q.escalations === 'true') where.isEscalation = true;
  const rows = await prisma.serviceRequest.findMany({ where, include, orderBy: [{ createdAt: 'desc' }], take: 200 });
  return rows.map(view);
}

/** Receptionist: update status / reply / charge ("Handle Escalated Guest Request") */
export async function updateServiceRequest(user, id, { status, staffNote, charge, assignToMe }) {
  const existing = await prisma.serviceRequest.findUnique({ where: { id }, include });
  if (!existing) throw notFound('Service request');
  if (user.guestPk) {
    if (existing.guestId !== user.guestPk) throw notFound('Service request');
    if (status !== 'CANCELLED' || existing.status !== 'OPEN') throw forbidden('You can only cancel an open request.');
  }
  const updated = await prisma.serviceRequest.update({
    where: { id },
    data: {
      status: status ?? undefined,
      staffNote: user.guestPk ? undefined : staffNote ?? undefined,
      charge: !user.guestPk && charge != null ? charge : undefined,
      assignedToId: assignToMe && !user.guestPk ? user.id : undefined,
      completedAt: status === 'COMPLETED' ? new Date() : undefined,
    },
    include,
  });
  await AuditLog.record({ action: 'SERVICE_REQUEST_UPDATED', entityType: 'ServiceRequest', entityId: id, performedBy: user.id, details: { status, staffNote, charge } });
  if (!user.guestPk && (staffNote || status)) {
    const guestUser = await prisma.guest.findUnique({ where: { id: existing.guestId }, select: { userId: true } });
    await notificationService.notifyUser(guestUser.userId, {
      type: 'SERVICE_REQUEST_UPDATE', channels: ['IN_APP', 'PUSH'],
      subject: `${SERVICE_CATALOG[existing.category]?.label ?? 'Request'} · ${(status ?? updated.status).replace('_', ' ').toLowerCase()}`,
      body: staffNote || `Your request #${id} is now ${(status ?? updated.status).replace('_', ' ').toLowerCase()}.`,
    });
  }
  return view(updated);
}

export function catalog() {
  return Object.entries(SERVICE_CATALOG).filter(([k]) => k !== 'CONCIERGE_ESCALATION').map(([key, v]) => ({ key, ...v }));
}
