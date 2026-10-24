export class FeedbackScoresDto {
  participation: number | null;
  fluency: number | null;
  vocabulary: number | null;
  confidence: number | null;
  pronunciation: number | null;
  conversation: number | null;
}

export class FeedbackPersonDto {
  id: string;
  name: string;
}

export class FeedbackTeacherDto extends FeedbackPersonDto {
  photoUrl: string | null;
}

export class FeedbackDto {
  id: string;
  bookingId: string;
  sessionId: string;
  sessionTitle: string;
  sessionStartsAt: Date;
  client: FeedbackPersonDto;
  teacher: FeedbackTeacherDto | null;
  scores: FeedbackScoresDto;
  comment: string | null;
  isVisibleToClient: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class ProgressTrendPointDto extends FeedbackScoresDto {
  /** yyyy-MM */
  month: string;
}

export class LevelHistoryItemDto {
  level: string;
  reason: string | null;
  date: Date;
}

export class ProgressDto {
  averages: FeedbackScoresDto;
  trend: ProgressTrendPointDto[];
  feedback: FeedbackDto[];
  levelHistory: LevelHistoryItemDto[];
}
