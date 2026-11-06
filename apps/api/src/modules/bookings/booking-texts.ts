import type { Locale } from '../../common/utils/locale';

/** Texts the booking screens show as they come from the API, in the member's language. */
export const BOOKING_TEXTS: Record<
  Locale,
  {
    levelMismatch: (sessionLevel: string, yourLevel: string | null) => string;
    levelAfterBooking: (sessionLevel: string, tooLow: boolean) => string;
    cannotCancel: string;
    lateTitle: string;
    lateVisitLost: string;
    lateNoVisit: string;
    cancelTitle: string;
    visitReturned: string;
    bookingCancelled: string;
    calendar: { with: (teacher: string) => string; level: string; room: string; join: string; online: string };
  }
> = {
  en: {
    levelMismatch: (level, yours) => `This session is for ${level}; your level is ${yours ?? 'not set'}.`,
    levelAfterBooking: (level, tooLow) => `This session is for ${level}. It may feel ${tooLow ? 'challenging' : 'easy'} for your level.`,
    cannotCancel: 'Cannot cancel',
    lateTitle: 'Late cancellation',
    lateVisitLost: 'The cancellation deadline has passed. This visit will not be returned.',
    lateNoVisit: 'The cancellation deadline has passed.',
    cancelTitle: 'Cancel this session?',
    visitReturned: 'Your visit will be returned to your membership.',
    bookingCancelled: 'Your booking will be cancelled.',
    calendar: { with: (t) => ` with ${t}`, level: 'Level', room: 'Room', join: 'Join', online: 'Online' },
  },
  ru: {
    levelMismatch: (level, yours) => `Это занятие для уровня ${level}; ваш уровень: ${yours ?? 'не указан'}.`,
    levelAfterBooking: (level, tooLow) => `Это занятие для уровня ${level}. Для вас оно может оказаться ${tooLow ? 'сложным' : 'лёгким'}.`,
    cannotCancel: 'Отменить нельзя',
    lateTitle: 'Поздняя отмена',
    lateVisitLost: 'Срок бесплатной отмены прошёл. Визит не вернётся.',
    lateNoVisit: 'Срок бесплатной отмены прошёл.',
    cancelTitle: 'Отменить запись?',
    visitReturned: 'Визит вернётся на абонемент.',
    bookingCancelled: 'Запись будет отменена.',
    calendar: { with: (t) => `, ${t}`, level: 'Уровень', room: 'Кабинет', join: 'Ссылка', online: 'Онлайн' },
  },
  kk: {
    levelMismatch: (level, yours) => `Бұл сабақ ${level} деңгейіне арналған; сіздің деңгейіңіз: ${yours ?? 'көрсетілмеген'}.`,
    levelAfterBooking: (level, tooLow) => `Бұл сабақ ${level} деңгейіне арналған. Сізге ${tooLow ? 'қиын' : 'жеңіл'} болуы мүмкін.`,
    cannotCancel: 'Болдырмау мүмкін емес',
    lateTitle: 'Кеш болдырмау',
    lateVisitLost: 'Тегін болдырмау мерзімі өтті. Келу қайтарылмайды.',
    lateNoVisit: 'Тегін болдырмау мерзімі өтті.',
    cancelTitle: 'Жазылуды болдырмау керек пе?',
    visitReturned: 'Келу абонементіңізге қайтарылады.',
    bookingCancelled: 'Жазылу болдырылмайды.',
    calendar: { with: (t) => `, ${t}`, level: 'Деңгей', room: 'Кабинет', join: 'Сілтеме', online: 'Онлайн' },
  },
};
