/** How long before an online session its join link is shown to booked clients. */
export const ONLINE_LINK_LEAD_MINUTES = 15;

/** When the join link of a session starting at `startsAt` becomes visible. */
export function onlineLinkOpensAt(startsAt: Date): Date {
  return new Date(startsAt.getTime() - ONLINE_LINK_LEAD_MINUTES * 60_000);
}

/**
 * The join link a booked client may see right now: from 15 minutes before the start
 * until the session ends, and never for an offline session or one without a link.
 */
export function visibleOnlineUrl(
  session: { format: string; onlineUrl: string | null; startsAt: Date; endsAt: Date },
  now: Date,
): { onlineUrl: string | null; onlineUrlOpensAt: Date | null } {
  if (session.format !== 'ONLINE' || !session.onlineUrl) return { onlineUrl: null, onlineUrlOpensAt: null };
  const opensAt = onlineLinkOpensAt(session.startsAt);
  const open = now >= opensAt && now <= session.endsAt;
  return { onlineUrl: open ? session.onlineUrl : null, onlineUrlOpensAt: opensAt };
}
