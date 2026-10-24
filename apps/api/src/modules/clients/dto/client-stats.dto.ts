export class FavoriteTeacherDto {
  id: string;
  name: string;
  sessions: number;
}

export class MonthlyAttendanceDto {
  /** yyyy-MM */
  month: string;
  attended: number;
  minutes: number;
}

export class ClientStatsDto {
  sessionsAttended: number;
  sessionsBooked: number;
  upcoming: number;
  noShows: number;
  cancelled: number;
  lateCancelled: number;
  /** attended / (attended + no-shows) × 100 */
  attendanceRate: number;
  visitsPurchased: number;
  visitsUsed: number;
  /** Consecutive weeks with at least one attended session */
  currentStreakWeeks: number;
  totalMinutesSpeaking: number;
  favoriteTeacher: FavoriteTeacherDto | null;
  /** ISO weekday 1–7 */
  mostAttendedWeekday: number | null;
  /** HH:mm of the most frequent start time */
  mostAttendedTime: string | null;
  thisMonth: MonthlyAttendanceDto;
  monthly: MonthlyAttendanceDto[];
  firstVisitAt: Date | null;
  lastVisitAt: Date | null;
}
