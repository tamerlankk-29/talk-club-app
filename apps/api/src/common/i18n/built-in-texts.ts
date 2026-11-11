import type { Locale } from '../utils/locale';

/**
 * Russian and Kazakh versions of the texts the club starts with (About, FAQ, rules,
 * address, plan descriptions, "How did you hear about us?" options).
 *
 * They are stored in English and translated on the way out, keyed by the English text.
 * A text an administrator has edited no longer matches a key and is shown as written,
 * so an edit is never overwritten by a translation.
 */
const BUILT_IN: Record<string, { ru: string; kk: string }> = {
  // ─── About ───
  [`**Talk Club** is an English Speaking Club in Almaty with native English-speaking teachers.

We are not a traditional language school. People come to Talk Club to **speak** — in small, friendly groups of up to seven, with a native speaker guiding the conversation.

- Speak English regularly and build real confidence
- Practise with native speakers from around the world
- Meet other English learners in a relaxed, social atmosphere
- Choose sessions that fit your level and your schedule — no rigid timetable`]: {
    ru: `**Talk Club** — разговорный клуб английского в Алматы с преподавателями-носителями языка.

Мы не обычная языковая школа. В Talk Club приходят, чтобы **говорить**: в небольших дружелюбных группах до семи человек, где беседу ведёт носитель языка.

- Говорите по-английски регулярно и обретайте настоящую уверенность
- Практикуйтесь с носителями языка из разных стран
- Знакомьтесь с теми, кто тоже учит английский, в спокойной и дружеской атмосфере
- Выбирайте занятия под свой уровень и своё расписание, без жёсткой сетки`,
    kk: `**Talk Club** — Алматыдағы ағылшын тілінің сөйлеу клубы, сабақты тіл иелері жүргізеді.

Біз дәстүрлі тіл мектебі емеспіз. Talk Club-қа адамдар **сөйлеу** үшін келеді: жеті адамға дейінгі шағын, достық топтарда әңгімені тіл иесі жүргізеді.

- Ағылшынша тұрақты сөйлеп, шынайы сенімділікке ие болыңыз
- Әр елден келген тіл иелерімен жаттығыңыз
- Ағылшын үйреніп жүрген басқа адамдармен еркін, достық ортада танысыңыз
- Деңгейіңіз бен кестеңізге сай сабақтарды таңдаңыз, қатаң кесте жоқ`,
  },

  // ─── Rules ───
  [`### Sessions
- Sessions last **90 minutes**.
- Groups have **up to 7 participants**.
- Please arrive a few minutes early so the session can start on time.

### Memberships
- Memberships are valid for **35 days** from the purchase date.
- Visits can be used at your own pace — there is no weekly minimum.
- Unused visits expire together with the membership.

### Booking & cancellation
- Book sessions in the app; one visit is reserved from your membership when you book.
- You can cancel **free of charge until 20:00 on the day before** the session — the visit returns to your membership.
- A late cancellation (after 20:00 the day before) cancels the booking, but the visit is **not returned**.
- If you don't come and don't cancel, the booking is marked as a **no-show** and the visit is used.

### Attendance
- Administrators may correct attendance manually in exceptional situations (illness, emergencies).
- Please be respectful: Talk Club is a friendly space for everyone to practise speaking.`]: {
    ru: `### Занятия
- Занятие длится **90 минут**.
- В группе **до 7 участников**.
- Приходите на несколько минут раньше, чтобы занятие началось вовремя.

### Абонементы
- Абонемент действует **35 дней** со дня покупки.
- Посещения можно использовать в своём темпе, минимума в неделю нет.
- Неиспользованные посещения сгорают вместе с абонементом.

### Запись и отмена
- Записывайтесь на занятия в приложении: при записи одно посещение резервируется с абонемента.
- Отменить запись можно **бесплатно до 20:00 накануне** занятия, посещение вернётся на абонемент.
- При поздней отмене (после 20:00 накануне) запись отменяется, но посещение **не возвращается**.
- Если вы не пришли и не отменили запись, она отмечается как **неявка**, и посещение списывается.

### Посещаемость
- В исключительных случаях (болезнь, чрезвычайная ситуация) администратор может исправить отметку вручную.
- Будьте уважительны: Talk Club — дружелюбное место, где каждый может практиковать речь.`,
    kk: `### Сабақтар
- Сабақ **90 минутқа** созылады.
- Топта **7 қатысушыға дейін** болады.
- Сабақ уақытында басталуы үшін бірнеше минут ерте келіңіз.

### Абонементтер
- Абонемент сатып алған күннен бастап **35 күн** жарамды.
- Келулерді өз қарқыныңызбен пайдалана аласыз, апталық минимум жоқ.
- Пайдаланылмаған келулер абонементпен бірге күйіп кетеді.

### Жазылу және бас тарту
- Сабаққа қолданбада жазылыңыз: жазылған кезде абонементтен бір келу резервтеледі.
- Сабақтың **алдындағы күні 20:00-ге дейін тегін** бас тартуға болады, келу абонементке қайтарылады.
- Кеш бас тартқанда (алдындағы күні 20:00-ден кейін) жазылу жойылады, бірақ келу **қайтарылмайды**.
- Келмесеңіз және бас тартпасаңыз, жазылу **келмеу** деп белгіленіп, келу есептен шығарылады.

### Қатысу
- Ерекше жағдайларда (ауру, төтенше жағдай) әкімші белгіні қолмен түзете алады.
- Бір-біріңізге құрметпен қараңыз: Talk Club — әркім сөйлеуді жаттықтыра алатын достық орта.`,
  },

  // ─── How it works ───
  'Choose your level': { ru: 'Выберите уровень', kk: 'Деңгейіңізді таңдаңыз' },
  'Tell us your English level — we will suggest sessions that fit you.': {
    ru: 'Укажите свой уровень английского, и мы предложим подходящие занятия.',
    kk: 'Ағылшын тілі деңгейіңізді көрсетіңіз, біз сізге сай сабақтарды ұсынамыз.',
  },
  'Book a session': { ru: 'Запишитесь на занятие', kk: 'Сабаққа жазылыңыз' },
  'Pick a time that suits you. Groups have up to 7 people.': {
    ru: 'Выберите удобное время. В группе до 7 человек.',
    kk: 'Өзіңізге ыңғайлы уақытты таңдаңыз. Топта 7 адамға дейін болады.',
  },
  'Come to Talk Club': { ru: 'Приходите в Talk Club', kk: 'Talk Club-қа келіңіз' },
  'Zheltoksan 118, offices 314–316. Sessions last 90 minutes.': {
    ru: 'Желтоксан, 118, кабинеты 314–316. Занятие длится 90 минут.',
    kk: 'Желтоқсан, 118, 314–316 кабинеттер. Сабақ 90 минутқа созылады.',
  },
  'Speak English': { ru: 'Говорите по-английски', kk: 'Ағылшынша сөйлеңіз' },
  'A native speaker leads a real conversation. No textbooks, no pressure.': {
    ru: 'Носитель языка ведёт живую беседу. Без учебников и без давления.',
    kk: 'Тіл иесі шынайы әңгіме жүргізеді. Оқулықсыз, қысымсыз.',
  },
  'Repeat regularly': { ru: 'Занимайтесь регулярно', kk: 'Тұрақты қайталаңыз' },
  'Regular practice builds fluency and confidence. Book again in one tap.': {
    ru: 'Регулярная практика даёт беглость и уверенность. Записаться снова можно в одно касание.',
    kk: 'Тұрақты жаттығу еркін сөйлеуге және сенімділікке жеткізеді. Бір түртумен қайта жазылыңыз.',
  },

  // ─── FAQ ───
  'Do I need a certain level to join?': { ru: 'Нужен ли определённый уровень, чтобы начать?', kk: 'Қатысу үшін белгілі бір деңгей керек пе?' },
  'Sessions run for levels from Elementary to Advanced. Choose your level when you register and we will show sessions that match it.': {
    ru: 'Занятия проходят для уровней от Elementary до Advanced. Выберите свой уровень при регистрации, и мы покажем подходящие занятия.',
    kk: 'Сабақтар Elementary деңгейінен Advanced деңгейіне дейін өтеді. Тіркелген кезде деңгейіңізді таңдаңыз, біз соған сай сабақтарды көрсетеміз.',
  },
  'How long is a membership valid?': { ru: 'Сколько действует абонемент?', kk: 'Абонемент қанша уақыт жарамды?' },
  'Every membership is valid for 35 days from the purchase date. You can attend at any rhythm — one session one week and three the next — as long as you have visits left.': {
    ru: 'Любой абонемент действует 35 дней со дня покупки. Ходить можно в любом ритме: одно занятие на этой неделе и три на следующей, пока остаются посещения.',
    kk: 'Кез келген абонемент сатып алған күннен бастап 35 күн жарамды. Келулер қалғанша кез келген ырғақпен қатыса аласыз: бір аптада бір сабақ, келесісінде үшеу.',
  },
  'What happens if I cancel?': { ru: 'Что будет, если я отменю запись?', kk: 'Жазылудан бас тартсам не болады?' },
  'Cancel before 20:00 on the day before the session and the visit returns to your membership. Later cancellations and no-shows use the visit.': {
    ru: 'Отмените запись до 20:00 накануне занятия, и посещение вернётся на абонемент. При более поздней отмене или неявке посещение списывается.',
    kk: 'Сабақтың алдындағы күні 20:00-ге дейін бас тартсаңыз, келу абонементке қайтарылады. Кеш бас тартқанда немесе келмегенде келу есептен шығарылады.',
  },
  'Can I try a session first?': { ru: 'Можно ли сначала попробовать?', kk: 'Алдымен байқап көруге бола ма?' },
  'Yes! A trial session costs 1,500 KZT. Book it in the app or leave a request and we will contact you.': {
    ru: 'Да! Пробное занятие стоит 1 500 ₸. Запишитесь в приложении или оставьте заявку, и мы свяжемся с вами.',
    kk: 'Иә! Сынақ сабағы 1 500 ₸ тұрады. Қолданбада жазылыңыз немесе өтінім қалдырыңыз, біз сізбен хабарласамыз.',
  },
  'How do I pay?': { ru: 'Как оплатить?', kk: 'Қалай төлеймін?' },
  'Choose a membership in the app. You pay by cash or card at the club reception. Your membership is activated as soon as the payment is confirmed.': {
    ru: 'Выберите абонемент в приложении. Оплата наличными или картой на ресепшене клуба. Абонемент активируется, как только оплата подтверждена.',
    kk: 'Қолданбада абонемент таңдаңыз. Төлем клуб ресепшенінде қолма-қол ақшамен немесе картамен жасалады. Төлем расталған бойда абонемент іске қосылады.',
  },
  'Who are the teachers?': { ru: 'Кто преподаватели?', kk: 'Оқытушылар кімдер?' },
  'All our speaking-club teachers are native English speakers. You can see their profiles in the app.': {
    ru: 'Все преподаватели разговорного клуба — носители английского языка. Их профили можно посмотреть в приложении.',
    kk: 'Сөйлеу клубының барлық оқытушылары — ағылшын тілінің иелері. Олардың профильдерін қолданбадан көре аласыз.',
  },

  // ─── Contact ───
  'Write to us on WhatsApp or Instagram — we usually reply within an hour during working hours.': {
    ru: 'Напишите нам в WhatsApp или Instagram. В рабочее время обычно отвечаем в течение часа.',
    kk: 'Бізге WhatsApp немесе Instagram арқылы жазыңыз. Жұмыс уақытында әдетте бір сағат ішінде жауап береміз.',
  },

  // ─── Location ───
  'Talk Club — Zheltoksan': { ru: 'Talk Club — Желтоксан', kk: 'Talk Club — Желтоқсан' },
  'Zheltoksan Street 118': { ru: 'ул. Желтоксан, 118', kk: 'Желтоқсан көшесі, 118' },
  'Offices 314–316': { ru: 'Кабинеты 314–316', kk: '314–316 кабинеттер' },
  Almaty: { ru: 'Алматы', kk: 'Алматы' },
  'Enter the business centre at Zheltoksan 118 and take the stairs or lift to the 3rd floor. Talk Club is in offices 314–316 — follow the purple signs.': {
    ru: 'Войдите в бизнес-центр на Желтоксан, 118 и поднимитесь по лестнице или на лифте на 3-й этаж. Talk Club находится в кабинетах 314–316, ориентируйтесь по фиолетовым указателям.',
    kk: 'Желтоқсан, 118 мекенжайындағы бизнес-орталыққа кіріп, баспалдақпен немесе лифтпен 3-қабатқа көтеріліңіз. Talk Club 314–316 кабинеттерде орналасқан, күлгін сілтегіштерге қараңыз.',
  },

  // ─── Membership plans ───
  'Once a week — a relaxed pace to keep your English alive.': {
    ru: 'Раз в неделю: спокойный темп, чтобы английский оставался в форме.',
    kk: 'Аптасына бір рет: ағылшын тілін ұмытпауға арналған жайлы қарқын.',
  },
  'Twice a week — our most popular rhythm for steady progress.': {
    ru: 'Два раза в неделю: самый популярный ритм для стабильного прогресса.',
    kk: 'Аптасына екі рет: тұрақты ілгерілеуге арналған ең танымал ырғақ.',
  },
  'Three times a week — fast progress in fluency and confidence.': {
    ru: 'Три раза в неделю: быстрый прогресс в беглости и уверенности.',
    kk: 'Аптасына үш рет: еркін сөйлеу мен сенімділікте жылдам ілгерілеу.',
  },
  'Up to 20 sessions — for those who want to speak English every day.': {
    ru: 'До 20 занятий: для тех, кто хочет говорить по-английски каждый день.',
    kk: '20 сабаққа дейін: күн сайын ағылшынша сөйлегісі келетіндерге.',
  },

  // ─── "How did you hear about us?" ───
  'Website / app': { ru: 'Сайт или приложение', kk: 'Сайт немесе қолданба' },
  'Referral from a friend': { ru: 'Рекомендация друга', kk: 'Досымның ұсынысы' },
  'Walk-in': { ru: 'Проходил(а) мимо', kk: 'Жанынан өтіп бара жатып' },
  'Existing client': { ru: 'Уже занимаюсь в клубе', kk: 'Клубта бұрыннан оқимын' },
  Advertisement: { ru: 'Реклама', kk: 'Жарнама' },
  Other: { ru: 'Другое', kk: 'Басқа' },
};

/** The built-in translation of a starting text, or the text itself when it was edited or is not one of them. */
export function builtInText<T extends string | null | undefined>(text: T, locale: Locale): T {
  if (!text || locale === 'en') return text;
  return (BUILT_IN[text]?.[locale] ?? text) as T;
}

export function hasBuiltInText(text: string): boolean {
  return text in BUILT_IN;
}
