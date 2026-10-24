/** Bot replies in the user's Telegram language: Russian, Kazakh, or English by default. */
export type BotLanguage = 'en' | 'ru' | 'kk';

export function botLanguage(code: string | null | undefined): BotLanguage {
  const base = (code ?? '').toLowerCase().split('-')[0];
  return base === 'ru' || base === 'kk' ? base : 'en';
}

export const BOT_TEXTS: Record<
  BotLanguage,
  { welcome: string; shareButton: string; linked: string; notOwnContact: string; invalidPhone: string; help: string; code: (code: string) => string }
> = {
  en: {
    welcome: 'Welcome to Talk Club! To get sign-in codes and class reminders here, tap “Share my phone number” below.',
    shareButton: 'Share my phone number',
    linked: 'Done! Your number is linked: sign-in codes and reminders will come to this chat. If you are signing in, go back to the Talk Club app and tap “Send code”.',
    notOwnContact: 'Please share your own number with the button below.',
    invalidPhone: 'We could not read this phone number. Please try again or contact Talk Club.',
    help: 'This bot sends Talk Club sign-in codes and notifications. Tap “Share my phone number” to link your account.',
    code: (code) => `Talk Club code: ${code}. It is valid for 5 minutes. Do not share it with anyone.`,
  },
  ru: {
    welcome: 'Добро пожаловать в Talk Club! Чтобы получать здесь коды для входа и напоминания о занятиях, нажмите «Поделиться номером» ниже.',
    shareButton: 'Поделиться номером',
    linked: 'Готово! Номер привязан: коды для входа и напоминания будут приходить в этот чат. Если вы входите в приложение, вернитесь в Talk Club и нажмите «Отправить код».',
    notOwnContact: 'Пожалуйста, поделитесь своим номером с помощью кнопки ниже.',
    invalidPhone: 'Не удалось распознать номер. Попробуйте ещё раз или напишите в Talk Club.',
    help: 'Этот бот присылает коды для входа и уведомления Talk Club. Нажмите «Поделиться номером», чтобы привязать аккаунт.',
    code: (code) => `Код Talk Club: ${code}. Действует 5 минут. Никому его не сообщайте.`,
  },
  kk: {
    welcome: 'Talk Club-қа қош келдіңіз! Кіру кодтары мен сабақ туралы еске салғыштарды осында алу үшін төмендегі «Нөмірмен бөлісу» батырмасын басыңыз.',
    shareButton: 'Нөмірмен бөлісу',
    linked: 'Дайын! Нөміріңіз байланыстырылды: кіру кодтары мен еске салғыштар осы чатқа келеді. Егер қосымшаға кіріп жатсаңыз, Talk Club-қа оралып, «Код жіберу» батырмасын басыңыз.',
    notOwnContact: 'Төмендегі батырма арқылы өз нөміріңізбен бөлісіңіз.',
    invalidPhone: 'Нөмірді тану мүмкін болмады. Қайталап көріңіз немесе Talk Club-қа жазыңыз.',
    help: 'Бұл бот Talk Club кіру кодтары мен хабарландыруларын жібереді. Аккаунтты байланыстыру үшін «Нөмірмен бөлісу» батырмасын басыңыз.',
    code: (code) => `Talk Club коды: ${code}. 5 минут жарамды. Оны ешкімге айтпаңыз.`,
  },
};
