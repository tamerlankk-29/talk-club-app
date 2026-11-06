import { defineMessages } from '../define';

/** Names used across the app for days, times of day, client categories and formats. */
export const labelMessages = defineMessages({
  en: {
    weekdays: ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    weekdaysShort: ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    timeOfDay: { MORNING: 'Morning', AFTERNOON: 'Afternoon', EVENING: 'Evening' } as Record<string, string>,
    category: { ADULT: 'Adult', TEEN: 'Teen', CHILD: 'Child', BUSINESS: 'Business Club', INDIVIDUAL: 'Individual' } as Record<string, string>,
    format: { OFFLINE: 'At the club', ONLINE: 'Online', ANY: 'Both' } as Record<string, string>,
  },
  ru: {
    weekdays: ['', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'],
    weekdaysShort: ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
    timeOfDay: { MORNING: 'Утро', AFTERNOON: 'День', EVENING: 'Вечер' },
    category: { ADULT: 'Взрослые', TEEN: 'Подростки', CHILD: 'Дети', BUSINESS: 'Бизнес-клуб', INDIVIDUAL: 'Индивидуально' },
    format: { OFFLINE: 'В клубе', ONLINE: 'Онлайн', ANY: 'Оба варианта' },
  },
  kk: {
    weekdays: ['', 'Дүйсенбі', 'Сейсенбі', 'Сәрсенбі', 'Бейсенбі', 'Жұма', 'Сенбі', 'Жексенбі'],
    weekdaysShort: ['', 'Дс', 'Сс', 'Ср', 'Бс', 'Жм', 'Сб', 'Жс'],
    timeOfDay: { MORNING: 'Таңертең', AFTERNOON: 'Күндіз', EVENING: 'Кешке' },
    category: { ADULT: 'Ересектер', TEEN: 'Жасөспірімдер', CHILD: 'Балалар', BUSINESS: 'Бизнес-клуб', INDIVIDUAL: 'Жеке' },
    format: { OFFLINE: 'Клубта', ONLINE: 'Онлайн', ANY: 'Екеуі де' },
  },
});
