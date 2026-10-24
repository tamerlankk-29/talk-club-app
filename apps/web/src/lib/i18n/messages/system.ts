import { defineMessages } from '../define';

/** Not-found and offline screens. */
export const systemMessages = defineMessages({
  en: {
    notFoundTitle: "This page doesn't exist",
    notFoundText: 'The link may be old or mistyped.',
    goHome: 'Go home',
    offlineTitle: "You're offline",
    offlineText: 'Check your internet connection. Your recent bookings and membership are still available once you reconnect.',
    retry: 'Try again',
  },
  ru: {
    notFoundTitle: 'Такой страницы нет',
    notFoundText: 'Возможно, ссылка устарела или в ней опечатка.',
    goHome: 'На главную',
    offlineTitle: 'Нет подключения к интернету',
    offlineText: 'Проверьте подключение. Ваши записи и абонемент снова будут доступны, когда связь вернётся.',
    retry: 'Попробовать снова',
  },
  kk: {
    notFoundTitle: 'Мұндай бет жоқ',
    notFoundText: 'Сілтеме ескірген немесе қате жазылған болуы мүмкін.',
    goHome: 'Басты бетке',
    offlineTitle: 'Интернет байланысы жоқ',
    offlineText: 'Байланысты тексеріңіз. Байланыс қалпына келгенде жазылуларыңыз бен абонементіңіз қайта қолжетімді болады.',
    retry: 'Қайталап көру',
  },
});

/** Page titles and the site description shown by browsers and link previews. */
export const metaMessages = defineMessages({
  en: {
    siteTitle: 'Talk Club — English Speaking Club in Almaty',
    siteDescription:
      'Speak English with native speakers in small groups of up to 7. Book sessions, manage your membership and track your progress — Talk Club, Zheltoksan 118, Almaty.',
    signIn: 'Sign in',
    join: 'Join Talk Club',
    offline: 'Offline',
    teacher: 'Teacher',
    admin: 'Admin',
  },
  ru: {
    siteTitle: 'Talk Club — разговорный клуб английского в Алматы',
    siteDescription:
      'Говорите по-английски с носителями языка в группах до 7 человек. Записывайтесь на занятия, управляйте абонементом и следите за прогрессом. Talk Club, Желтоксан 118, Алматы.',
    signIn: 'Вход',
    join: 'Присоединиться к Talk Club',
    offline: 'Нет связи',
    teacher: 'Преподаватель',
    admin: 'Админка',
  },
  kk: {
    siteTitle: 'Talk Club — Алматыдағы ағылшын тілі сөйлесу клубы',
    siteDescription:
      'Ағылшынша ана тілі ағылшын мұғалімдермен 7 адамға дейінгі шағын топтарда сөйлесіңіз. Сабаққа жазылыңыз, абонементті басқарыңыз және прогресіңізді бақылаңыз. Talk Club, Желтоқсан 118, Алматы.',
    signIn: 'Кіру',
    join: 'Talk Club-қа қосылу',
    offline: 'Байланыс жоқ',
    teacher: 'Мұғалім',
    admin: 'Әкімші',
  },
});
