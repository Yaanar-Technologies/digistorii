export interface BannerSchedule {
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  isScheduled?: boolean;
}

/**
 * Evaluates whether a banner or promo section is currently active
 * based on optional scheduling parameters.
 */
export function isBannerActive(
  schedule?: BannerSchedule | null,
  now: Date = new Date()
): boolean {
  if (!schedule) return true;
  if (!schedule.isScheduled) return true;

  const nowMs = now.getTime();

  if (schedule.startDate) {
    const startMs = new Date(schedule.startDate).getTime();
    if (!isNaN(startMs) && nowMs < startMs) {
      return false;
    }
  }

  if (schedule.endDate) {
    const endMs = new Date(schedule.endDate).getTime();
    if (!isNaN(endMs) && nowMs > endMs) {
      return false;
    }
  }

  return true;
}

/**
 * Returns formatted countdown or scheduling status details for admin preview.
 */
export function getBannerScheduleStatus(
  schedule?: BannerSchedule | null,
  now: Date = new Date()
): {
  status: "always_active" | "scheduled_future" | "active" | "expired";
  label: string;
} {
  if (!schedule || !schedule.isScheduled) {
    return { status: "always_active", label: "Always Active" };
  }

  const nowMs = now.getTime();
  const startMs = schedule.startDate ? new Date(schedule.startDate).getTime() : null;
  const endMs = schedule.endDate ? new Date(schedule.endDate).getTime() : null;

  if (startMs && !isNaN(startMs) && nowMs < startMs) {
    const daysUntil = Math.ceil((startMs - nowMs) / (1000 * 60 * 60 * 24));
    return {
      status: "scheduled_future",
      label: `Scheduled to start in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`,
    };
  }

  if (endMs && !isNaN(endMs) && nowMs > endMs) {
    return { status: "expired", label: "Expired" };
  }

  if (endMs && !isNaN(endMs)) {
    const daysLeft = Math.ceil((endMs - nowMs) / (1000 * 60 * 60 * 24));
    return {
      status: "active",
      label: `Active (${daysLeft} day${daysLeft === 1 ? "" : "s"} left)`,
    };
  }

  return { status: "active", label: "Active" };
}
