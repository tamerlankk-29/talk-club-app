import type { TemplateText } from './default-templates';

/**
 * Russian and Kazakh texts of the built-in templates. They are used while a template keeps
 * its built-in English text; placeholders are the same as in English.
 */
export const TEMPLATE_TRANSLATIONS: Record<string, { ru: TemplateText; kk: TemplateText }> = {
  'booking.confirmed': {
    ru: { title: 'Вы записаны! 🎉', body: 'Вы записаны на занятие с {{teacherName}}: {{dayWord}} в {{time}}. {{visitsNote}}', buttonLabel: 'Открыть запись' },
    kk: { title: 'Сіз жазылдыңыз! 🎉', body: '{{teacherName}} сабағына жазылдыңыз: {{dayWord}}, {{time}}. {{visitsNote}}', buttonLabel: 'Жазылуды ашу' },
  },
  'booking.created_by_club': {
    ru: { title: 'У вас новая запись', body: 'Talk Club записал вас на {{sessionTitle}} с {{teacherName}}: {{dateTime}}.', buttonLabel: 'Открыть запись' },
    kk: { title: 'Сізде жаңа жазылу бар', body: 'Talk Club сізді {{teacherName}} жүргізетін {{sessionTitle}} сабағына жазды: {{dateTime}}.', buttonLabel: 'Жазылуды ашу' },
  },
  'booking.moved': {
    ru: { title: 'Ваша запись перенесена', body: 'Теперь вы записаны на {{sessionTitle}} с {{teacherName}}: {{dateTime}}.', buttonLabel: 'Открыть запись' },
    kk: { title: 'Жазылуыңыз ауыстырылды', body: 'Енді сіз {{teacherName}} жүргізетін {{sessionTitle}} сабағына жазылдыңыз: {{dateTime}}.', buttonLabel: 'Жазылуды ашу' },
  },
  'booking.cancelled': {
    ru: { title: 'Запись отменена', body: '{{sessionTitle}}, {{dateTime}}. {{visitNote}}' },
    kk: { title: 'Жазылу болдырылмады', body: '{{sessionTitle}}, {{dateTime}}. {{visitNote}}' },
  },
  'booking.cancelled_by_club': {
    ru: { title: 'Ваша запись отменена', body: 'Talk Club отменил вашу запись на {{sessionTitle}}: {{dateTime}}. {{visitNote}}', buttonLabel: 'Найти другое занятие' },
    kk: { title: 'Жазылуыңыз болдырылмады', body: 'Talk Club сіздің {{sessionTitle}} сабағына жазылуыңызды болдырмады: {{dateTime}}. {{visitNote}}', buttonLabel: 'Басқа сабақ табу' },
  },
  'session.cancelled': {
    ru: { title: 'Занятие отменено', body: 'Занятие с {{teacherName}} ({{dateTime}}) отменено. Визит вернулся на абонемент.', buttonLabel: 'Записаться на другое' },
    kk: { title: 'Сабақ болдырылмады', body: '{{teacherName}} сабағы ({{dateTime}}) болдырылмады. Келу абонементіңізге қайтарылды.', buttonLabel: 'Басқа сабаққа жазылу' },
  },
  'session.changed': {
    ru: { title: 'Занятие изменилось', body: '{{sessionTitle}} теперь {{dateTime}}, ведёт {{teacherName}}{{roomNote}}.', buttonLabel: 'Открыть запись' },
    kk: { title: 'Сабақ өзгерді', body: '{{sessionTitle}} енді {{dateTime}}, мұғалім: {{teacherName}}{{roomNote}}.', buttonLabel: 'Жазылуды ашу' },
  },
  'session.reminder_day': {
    ru: { title: 'Напоминание о занятии', body: 'Ваше занятие в Talk Club: {{dayWord}} в {{time}}.', buttonLabel: 'Открыть занятие' },
    kk: { title: 'Сабақ туралы еске салу', body: 'Talk Club-тағы сабағыңыз: {{dayWord}}, {{time}}.', buttonLabel: 'Сабақты ашу' },
  },
  'session.reminder_soon': {
    ru: { title: 'Скоро начало', body: 'Ваше занятие начнётся через {{hours}} ч ({{time}}).', buttonLabel: 'Как добраться' },
    kk: { title: 'Жақында басталады', body: 'Сабағыңыз {{hours}} сағаттан кейін басталады ({{time}}).', buttonLabel: 'Қалай жетуге болады' },
  },
  'session.online_link': {
    ru: { title: 'Онлайн-занятие скоро начнётся', body: 'Ваше онлайн-занятие начнётся в {{time}}. Ссылка для входа: {{onlineUrl}}', buttonLabel: 'Открыть занятие' },
    kk: { title: 'Онлайн сабақ жақында басталады', body: 'Онлайн сабағыңыз {{time}} басталады. Кіру сілтемесі: {{onlineUrl}}', buttonLabel: 'Сабақты ашу' },
  },
  'waitlist.offer': {
    ru: {
      title: 'Освободилось место!',
      body: 'Освободилось место на занятии с {{teacherName}}: {{dayWord}} в {{time}}. Оно закреплено за вами до {{expiresTime}}.',
      buttonLabel: 'Забрать место',
    },
    kk: {
      title: 'Орын босады!',
      body: '{{teacherName}} сабағында орын босады: {{dayWord}}, {{time}}. Ол сізге {{expiresTime}} дейін сақталады.',
      buttonLabel: 'Орынды алу',
    },
  },
  'waitlist.open': {
    ru: { title: 'Появилось место', body: 'Освободилось место на занятии с {{teacherName}}: {{dayWord}} в {{time}}. Кто первый запишется, тот и получит!', buttonLabel: 'Записаться' },
    kk: { title: 'Орын пайда болды', body: '{{teacherName}} сабағында орын босады: {{dayWord}}, {{time}}. Кім бірінші жазылса, сол алады!', buttonLabel: 'Жазылу' },
  },
  'payment.requested': {
    ru: { title: 'Счёт на оплату: {{amount}} ₸', body: 'Оплатите {{amount}} ₸ за {{description}}. {{instructions}}', buttonLabel: 'Открыть платёж' },
    kk: { title: 'Төлем шоты: {{amount}} ₸', body: '{{description}} үшін {{amount}} ₸ төлеңіз. {{instructions}}', buttonLabel: 'Төлемді ашу' },
  },
  'payment.confirmed': {
    ru: { title: 'Оплата получена', body: 'Мы получили {{amount}} ₸ за {{description}}. Спасибо!', buttonLabel: 'Открыть платёж' },
    kk: { title: 'Төлем қабылданды', body: '{{description}} үшін {{amount}} ₸ алдық. Рақмет!', buttonLabel: 'Төлемді ашу' },
  },
  'membership.activated': {
    ru: { title: 'Абонемент {{planName}} активен', body: 'Визитов: {{visits}}, действует до {{expiryDate}}. Пора записаться на следующее занятие!', buttonLabel: 'Записаться' },
    kk: { title: '{{planName}} абонементі белсенді', body: 'Келу саны: {{visits}}, {{expiryDate}} дейін жарамды. Келесі сабаққа жазылатын уақыт!', buttonLabel: 'Сабаққа жазылу' },
  },
  'membership.expiring': {
    ru: { title: 'Абонемент заканчивается {{daysText}}', body: 'Ваш абонемент Talk Club заканчивается {{daysText}} ({{expiryDate}}). Осталось визитов: {{visitsRemaining}}.', buttonLabel: 'Продлить абонемент' },
    kk: { title: 'Абонемент мерзімі бітеді: {{daysText}}', body: 'Talk Club абонементіңіздің мерзімі бітеді: {{daysText}} ({{expiryDate}}). Қалған келу саны: {{visitsRemaining}}.', buttonLabel: 'Абонементті ұзарту' },
  },
  'membership.expired': {
    ru: { title: 'Абонемент закончился', body: 'Продлите абонемент, чтобы и дальше практиковать английский с нами.', buttonLabel: 'Продлить абонемент' },
    kk: { title: 'Абонемент мерзімі бітті', body: 'Бізбен ағылшын тілін әрі қарай жаттықтыру үшін абонементті ұзартыңыз.', buttonLabel: 'Абонементті ұзарту' },
  },
  'membership.low_visits': {
    ru: { title: 'Осталось визитов: {{visitsRemaining}}', body: 'На абонементе {{planName}} осталось визитов: {{visitsRemaining}}.', buttonLabel: 'Открыть абонемент' },
    kk: { title: 'Қалған келу саны: {{visitsRemaining}}', body: '{{planName}} абонементінде қалған келу саны: {{visitsRemaining}}.', buttonLabel: 'Абонементті ашу' },
  },
  'membership.no_visits': {
    ru: { title: 'Визиты закончились', body: 'На вашем абонементе не осталось визитов.', buttonLabel: 'Купить новый абонемент' },
    kk: { title: 'Келу қалмады', body: 'Абонементіңізде келу қалмады.', buttonLabel: 'Жаңа абонемент алу' },
  },
  'trial.scheduled': {
    ru: {
      title: 'Вы записаны на пробное занятие',
      body: '{{sessionTitle}} с {{teacherName}}: {{dateTime}}. Стоимость пробного: {{amount}} ₸, оплата в клубе или через Kaspi.',
      buttonLabel: 'Открыть запись',
    },
    kk: {
      title: 'Сынақ сабаққа жазылдыңыз',
      body: '{{sessionTitle}}, мұғалім {{teacherName}}: {{dateTime}}. Сынақ сабақ бағасы: {{amount}} ₸, клубта немесе Kaspi арқылы төлеуге болады.',
      buttonLabel: 'Жазылуды ашу',
    },
  },
  'trial.follow_up': {
    ru: {
      title: 'Спасибо, что пришли в Talk Club! 😊',
      body: 'Привет! Спасибо, что были сегодня в Talk Club. Надеемся, вам понравилось 😊\n\nТеперь можно выбрать абонемент и продолжить практиковать английский с нами.',
      buttonLabel: 'Посмотреть абонементы',
      secondaryButtonLabel: 'Записаться на занятие',
    },
    kk: {
      title: 'Talk Club-қа келгеніңізге рақмет! 😊',
      body: 'Сәлем! Бүгін Talk Club-та болғаныңызға рақмет. Сабақ ұнады деп үміттенеміз 😊\n\nЕнді абонемент таңдап, бізбен ағылшын тілін жаттықтыруды жалғастыра аласыз.',
      buttonLabel: 'Абонементтерді қарау',
      secondaryButtonLabel: 'Сабаққа жазылу',
    },
  },
  'client.welcome': {
    ru: { title: 'Добро пожаловать в Talk Club, {{firstName}}! 👋', body: 'Запишитесь на пробное занятие или выберите абонемент, чтобы начать говорить по-английски с носителями языка.', buttonLabel: 'Посмотреть расписание' },
    kk: { title: 'Talk Club-қа қош келдіңіз, {{firstName}}! 👋', body: 'Ана тілі ағылшын мұғалімдермен сөйлесуді бастау үшін сынақ сабаққа жазылыңыз немесе абонемент таңдаңыз.', buttonLabel: 'Кестені қарау' },
  },
  'feedback.received': {
    ru: { title: 'Новый отзыв от {{teacherName}}', body: '{{comment}}', buttonLabel: 'Мой прогресс' },
    kk: { title: '{{teacherName}} жаңа пікір қалдырды', body: '{{comment}}', buttonLabel: 'Менің прогресім' },
  },
  'admin.new_registration': {
    ru: { title: 'Новая регистрация', body: '{{clientName}} ({{phone}}) зарегистрировался в приложении.', buttonLabel: 'Открыть клиента' },
    kk: { title: 'Жаңа тіркелу', body: '{{clientName}} ({{phone}}) қолданбада тіркелді.', buttonLabel: 'Клиентті ашу' },
  },
  'admin.new_trial': {
    ru: { title: 'Новое пробное', body: '{{name}} ({{phone}}): {{details}}', buttonLabel: 'Открыть пробные' },
    kk: { title: 'Жаңа сынақ сабақ', body: '{{name}} ({{phone}}): {{details}}', buttonLabel: 'Сынақ сабақтарды ашу' },
  },
  'admin.payment_pending': {
    ru: { title: 'Платёж ждёт подтверждения', body: '{{clientName}}: {{amount}} ₸, {{description}} ({{method}}).', buttonLabel: 'Открыть платежи' },
    kk: { title: 'Растауды күтетін төлем', body: '{{clientName}}: {{amount}} ₸, {{description}} ({{method}}).', buttonLabel: 'Төлемдерді ашу' },
  },
  'admin.payment_received': {
    ru: { title: 'Платёж получен', body: '{{clientName}} оплатил {{amount}} ₸: {{description}}.', buttonLabel: 'Открыть платёж' },
    kk: { title: 'Төлем түсті', body: '{{clientName}} {{amount}} ₸ төледі: {{description}}.', buttonLabel: 'Төлемді ашу' },
  },
  'admin.session_full': {
    ru: { title: 'Занятие заполнено', body: '{{sessionTitle}} с {{teacherName}}, {{dateTime}}: мест нет.', buttonLabel: 'Открыть занятие' },
    kk: { title: 'Сабақ толды', body: '{{sessionTitle}}, мұғалім {{teacherName}}, {{dateTime}}: орын жоқ.', buttonLabel: 'Сабақты ашу' },
  },
  'admin.cancellation': {
    ru: { title: '{{cancellationType}}', body: '{{clientName}} отменил запись: {{sessionTitle}}, {{dateTime}}.', buttonLabel: 'Открыть занятие' },
    kk: { title: '{{cancellationType}}', body: '{{clientName}} жазылуды болдырмады: {{sessionTitle}}, {{dateTime}}.', buttonLabel: 'Сабақты ашу' },
  },
  'admin.no_show': {
    ru: { title: 'Неявка', body: '{{clientName}} не пришёл на {{sessionTitle}}, {{dateTime}}.', buttonLabel: 'Открыть клиента' },
    kk: { title: 'Келмеді', body: '{{clientName}} сабаққа келмеді: {{sessionTitle}}, {{dateTime}}.', buttonLabel: 'Клиентті ашу' },
  },
  'admin.waitlist': {
    ru: { title: 'Место для листа ожидания', body: 'Освободилось место: {{sessionTitle}}, {{dateTime}}. Ждут: {{waiting}}.', buttonLabel: 'Открыть занятие' },
    kk: { title: 'Күту тізіміне орын', body: 'Орын босады: {{sessionTitle}}, {{dateTime}}. Күтіп тұрғандар: {{waiting}}.', buttonLabel: 'Сабақты ашу' },
  },
  'admin.data_request': {
    ru: { title: 'Запрос на удаление аккаунта', body: '{{clientName}} ({{phone}}) просит удалить аккаунт и личные данные.', buttonLabel: 'Открыть клиента' },
    kk: { title: 'Аккаунтты жою сұрауы', body: '{{clientName}} ({{phone}}) аккаунты мен жеке деректерін жоюды сұрайды.', buttonLabel: 'Клиентті ашу' },
  },
  'admin.membership_expiring': {
    ru: { title: 'Абонемент заканчивается', body: 'Абонемент {{planName}} у {{clientName}} заканчивается {{daysText}}.', buttonLabel: 'Открыть клиента' },
    kk: { title: 'Абонемент мерзімі бітеді', body: '{{clientName}}: {{planName}} абонементінің мерзімі бітеді: {{daysText}}.', buttonLabel: 'Клиентті ашу' },
  },
};
