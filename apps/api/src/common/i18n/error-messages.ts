import type { Locale } from '../utils/locale';

type Translations = { ru: string; kk: string };

/**
 * Russian and Kazakh versions of user-facing error messages, keyed by the English text
 * (the catalog default or a message passed to DomainError). A message without a
 * translation stays in English.
 */
const ERROR_TRANSLATIONS: Record<string, Translations> = {
  // Generic
  'Please check the highlighted fields and try again.': {
    ru: 'Проверьте выделенные поля и попробуйте ещё раз.',
    kk: 'Белгіленген өрістерді тексеріп, қайталап көріңіз.',
  },
  'Please sign in to continue.': { ru: 'Войдите, чтобы продолжить.', kk: 'Жалғастыру үшін кіріңіз.' },
  "You don't have access to this action.": { ru: 'У вас нет доступа к этому действию.', kk: 'Бұл әрекетке рұқсатыңыз жоқ.' },
  'We could not find what you were looking for.': { ru: 'Не удалось найти то, что вы искали.', kk: 'Іздегеніңіз табылмады.' },
  'This change conflicts with existing data. Please refresh and try again.': {
    ru: 'Изменение конфликтует с текущими данными. Обновите страницу и попробуйте ещё раз.',
    kk: 'Бұл өзгеріс бар деректермен қайшы келеді. Бетті жаңартып, қайталап көріңіз.',
  },
  'Too many attempts. Please wait a moment and try again.': {
    ru: 'Слишком много попыток. Подождите немного и попробуйте снова.',
    kk: 'Әрекет тым көп. Біраз күтіп, қайталап көріңіз.',
  },
  'Something went wrong. Please try again.': { ru: 'Что-то пошло не так. Попробуйте ещё раз.', kk: 'Бірдеңе дұрыс болмады. Қайталап көріңіз.' },

  // Authentication
  'Incorrect login or password.': { ru: 'Неверный логин или пароль.', kk: 'Логин немесе құпиясөз қате.' },
  'This account is blocked. Please contact Talk Club.': {
    ru: 'Аккаунт заблокирован. Свяжитесь с Talk Club.',
    kk: 'Аккаунт бұғатталған. Talk Club-пен байланысыңыз.',
  },
  'Your session has expired. Please sign in again.': { ru: 'Сессия истекла. Войдите снова.', kk: 'Сессия мерзімі өтті. Қайта кіріңіз.' },
  'The code is incorrect. Please check and try again.': {
    ru: 'Неверный код. Проверьте и попробуйте ещё раз.',
    kk: 'Код қате. Тексеріп, қайталап көріңіз.',
  },
  'The code has expired. Please request a new one.': { ru: 'Срок действия кода истёк. Запросите новый.', kk: 'Кодтың мерзімі өтті. Жаңасын сұраңыз.' },
  'Too many incorrect attempts. Please request a new code.': {
    ru: 'Слишком много неверных попыток. Запросите новый код.',
    kk: 'Қате әрекет тым көп. Жаңа код сұраңыз.',
  },
  'Please wait before requesting another code.': {
    ru: 'Подождите немного, прежде чем запросить новый код.',
    kk: 'Жаңа код сұрамас бұрын біраз күтіңіз.',
  },
  'Codes by SMS are not available yet. Please get your code in Telegram.': {
    ru: 'Коды по SMS пока недоступны. Получите код в Telegram.',
    kk: 'SMS арқылы код әзірге қолжетімсіз. Кодты Telegram-нан алыңыз.',
  },
  'Codes in Telegram are not available right now. Please use SMS.': {
    ru: 'Коды в Telegram сейчас недоступны. Используйте SMS.',
    kk: 'Telegram-дағы кодтар қазір қолжетімсіз. SMS пайдаланыңыз.',
  },
  'Open the Talk Club bot in Telegram and share your phone number first.': {
    ru: 'Сначала откройте бота Talk Club в Telegram и поделитесь номером телефона.',
    kk: 'Алдымен Telegram-да Talk Club ботын ашып, телефон нөміріңізбен бөлісіңіз.',
  },
  'Codes by SMS go only to Kazakhstan numbers (+7). Please get your code in Telegram.': {
    ru: 'Коды по SMS отправляются только на номера Казахстана (+7). Получите код в Telegram.',
    kk: 'SMS кодтары тек Қазақстан нөмірлеріне (+7) жіберіледі. Кодты Telegram-нан алыңыз.',
  },
  'We could not send the SMS right now. Please try again in a minute or get your code in Telegram.': {
    ru: 'Сейчас не удалось отправить SMS. Попробуйте через минуту или получите код в Telegram.',
    kk: 'Қазір SMS жіберу мүмкін болмады. Бір минуттан кейін қайталаңыз немесе кодты Telegram-нан алыңыз.',
  },
  'Codes by SMS are paused for a while. Please get your code in Telegram.': {
    ru: 'Отправка кодов по SMS временно приостановлена. Получите код в Telegram.',
    kk: 'SMS арқылы код жіберу уақытша тоқтатылды. Кодты Telegram-нан алыңыз.',
  },
  'Please confirm that you are not a robot.': { ru: 'Подтвердите, что вы не робот.', kk: 'Робот емес екеніңізді растаңыз.' },
  'The check did not pass. Please try again.': { ru: 'Проверка не пройдена. Попробуйте ещё раз.', kk: 'Тексеруден өтпеді. Қайталап көріңіз.' },
  'Enter the code from your authenticator app.': {
    ru: 'Введите код из приложения-аутентификатора.',
    kk: 'Аутентификатор қолданбасындағы кодты енгізіңіз.',
  },
  'Your role requires two-factor sign-in. Set up an authenticator app to continue.': {
    ru: 'Для вашей роли нужна двухфакторная защита. Подключите приложение-аутентификатор, чтобы продолжить.',
    kk: 'Сіздің рөліңізге екі факторлы кіру қажет. Жалғастыру үшін аутентификатор қолданбасын қосыңыз.',
  },
  'The code is incorrect. Check the time on your phone and try again.': {
    ru: 'Неверный код. Проверьте время на телефоне и попробуйте ещё раз.',
    kk: 'Код қате. Телефондағы уақытты тексеріп, қайталап көріңіз.',
  },
  'Too many incorrect codes. Try again in 15 minutes.': {
    ru: 'Слишком много неверных кодов. Попробуйте через 15 минут.',
    kk: 'Қате код тым көп. 15 минуттан кейін қайталап көріңіз.',
  },
  'Your sign-in has expired. Please sign in again.': { ru: 'Время входа истекло. Войдите снова.', kk: 'Кіру уақыты өтті. Қайта кіріңіз.' },
  'Please enter a valid phone number, e.g. +7 701 123 45 67.': {
    ru: 'Введите корректный номер, например +7 701 123 45 67.',
    kk: 'Дұрыс нөмір енгізіңіз, мысалы +7 701 123 45 67.',
  },
  'An account with this phone number already exists.': {
    ru: 'Аккаунт с этим номером уже существует.',
    kk: 'Бұл нөмірмен аккаунт бұрыннан бар.',
  },
  'An account with this email already exists.': { ru: 'Аккаунт с этой почтой уже существует.', kk: 'Бұл поштамен аккаунт бұрыннан бар.' },
  'Your verification has expired. Please verify your phone again.': {
    ru: 'Подтверждение устарело. Подтвердите номер ещё раз.',
    kk: 'Растау мерзімі өтті. Нөміріңізді қайта растаңыз.',
  },
  'Please accept the Talk Club terms to continue.': {
    ru: 'Примите условия Talk Club, чтобы продолжить.',
    kk: 'Жалғастыру үшін Talk Club шарттарын қабылдаңыз.',
  },
  'Password must be at least 8 characters and include a letter and a number.': {
    ru: 'Пароль должен быть не короче 8 символов и содержать букву и цифру.',
    kk: 'Құпиясөз кемінде 8 таңбадан тұрып, әріп пен цифрды қамтуы керек.',
  },
  'This account has no password yet. Sign in with a phone code instead.': {
    ru: 'У аккаунта ещё нет пароля. Войдите по коду из SMS или Telegram.',
    kk: 'Аккаунттың әлі құпиясөзі жоқ. SMS немесе Telegram кодымен кіріңіз.',
  },
  'This action is available for Talk Club members only.': {
    ru: 'Это действие доступно только участникам Talk Club.',
    kk: 'Бұл әрекет тек Talk Club мүшелеріне қолжетімді.',
  },
  'Your current password is incorrect.': { ru: 'Текущий пароль неверный.', kk: 'Ағымдағы құпиясөз қате.' },
  'You cannot act for this profile.': { ru: 'Вы не можете действовать от имени этого профиля.', kk: 'Бұл профиль атынан әрекет ете алмайсыз.' },

  // Booking
  "You don't have an active membership for this session.": {
    ru: 'У вас нет активного абонемента для этого занятия.',
    kk: 'Бұл сабаққа белсенді абонементіңіз жоқ.',
  },
  'Your membership has no remaining visits.': { ru: 'На абонементе не осталось визитов.', kk: 'Абонементте келу қалмады.' },
  'Your membership expires before this session.': {
    ru: 'Ваш абонемент закончится раньше этого занятия.',
    kk: 'Абонементіңіздің мерзімі бұл сабаққа дейін бітеді.',
  },
  'Your membership cannot be used for this type of session.': {
    ru: 'Ваш абонемент не подходит для этого типа занятий.',
    kk: 'Абонементіңізді сабақтың бұл түріне пайдалануға болмайды.',
  },
  'This session is full. You can join the waitlist.': {
    ru: 'Мест нет. Можно встать в лист ожидания.',
    kk: 'Орын жоқ. Күту тізіміне жазыла аласыз.',
  },
  'This session has been cancelled.': { ru: 'Это занятие отменено.', kk: 'Бұл сабақ болдырылмады.' },
  'This session has already started.': { ru: 'Занятие уже началось.', kk: 'Сабақ басталып кетті.' },
  'Booking for this session is closed.': { ru: 'Запись на это занятие закрыта.', kk: 'Бұл сабаққа жазылу жабық.' },
  'Booking for this session is not open yet.': { ru: 'Запись на это занятие ещё не открыта.', kk: 'Бұл сабаққа жазылу әлі ашылмады.' },
  'You are already booked for this session.': { ru: 'Вы уже записаны на это занятие.', kk: 'Сіз бұл сабаққа жазылып қойғансыз.' },
  'You already have a session booked at this time.': { ru: 'У вас уже есть запись на это время.', kk: 'Бұл уақытқа басқа сабаққа жазылғансыз.' },
  "This session doesn't match your English level.": {
    ru: 'Это занятие не подходит под ваш уровень английского.',
    kk: 'Бұл сабақ ағылшын тілі деңгейіңізге сәйкес келмейді.',
  },
  'This group is not available for your profile.': { ru: 'Эта группа недоступна для вашего профиля.', kk: 'Бұл топ сіздің профиліңізге қолжетімсіз.' },
  'Trial sessions are not available right now.': { ru: 'Пробные занятия сейчас недоступны.', kk: 'Сынақ сабақтар қазір қолжетімсіз.' },
  'Trial participants cannot join this session.': {
    ru: 'На это занятие нельзя записаться как на пробное.',
    kk: 'Бұл сабаққа сынақ ретінде жазылуға болмайды.',
  },
  'You have already used your trial session.': { ru: 'Вы уже использовали пробное занятие.', kk: 'Сынақ сабағыңызды пайдаланып қойдыңыз.' },
  'This booking can no longer be cancelled.': { ru: 'Эту запись уже нельзя отменить.', kk: 'Бұл жазылуды енді болдырмауға болмайды.' },
  'The cancellation deadline has passed. Please confirm that the visit will not be returned.': {
    ru: 'Срок бесплатной отмены прошёл. Подтвердите, что визит не вернётся.',
    kk: 'Тегін болдырмау мерзімі өтті. Келу қайтарылмайтынын растаңыз.',
  },
  'The last seat is reserved for someone on the waitlist.': {
    ru: 'Последнее место забронировано для человека из листа ожидания.',
    kk: 'Соңғы орын күту тізіміндегі адамға сақталған.',
  },

  // Waitlist
  'The waitlist is not available.': { ru: 'Лист ожидания недоступен.', kk: 'Күту тізімі қолжетімсіз.' },
  'This session still has free seats — you can book it directly.': {
    ru: 'На занятии ещё есть места, можно записаться сразу.',
    kk: 'Сабақта әлі бос орын бар, тікелей жазыла аласыз.',
  },
  'You are already on the waitlist for this session.': {
    ru: 'Вы уже в листе ожидания на это занятие.',
    kk: 'Сіз бұл сабақтың күту тізіміндесіз.',
  },
  'This offer has expired.': { ru: 'Предложение истекло.', kk: 'Ұсыныстың мерзімі өтті.' },
  'There is no reserved place for you in this session.': {
    ru: 'Для вас нет забронированного места на этом занятии.',
    kk: 'Бұл сабақта сізге сақталған орын жоқ.',
  },

  // Sessions
  'The session end time must be after the start time.': {
    ru: 'Время окончания должно быть позже времени начала.',
    kk: 'Аяқталу уақыты басталу уақытынан кейін болуы керек.',
  },
  'The room is already booked for another session at this time.': {
    ru: 'Кабинет на это время уже занят другим занятием.',
    kk: 'Бұл уақытта кабинет басқа сабаққа бос емес.',
  },
  'The teacher already has another session at this time.': {
    ru: 'У преподавателя уже есть занятие на это время.',
    kk: 'Мұғалімнің бұл уақытта басқа сабағы бар.',
  },
  'Capacity cannot be lower than the number of booked clients.': {
    ru: 'Вместимость не может быть меньше числа записанных клиентов.',
    kk: 'Сыйымдылық жазылған клиенттер санынан аз бола алмайды.',
  },
  'This session is already cancelled.': { ru: 'Это занятие уже отменено.', kk: 'Бұл сабақ болдырылмаған.' },
  'This session has already finished.': { ru: 'Это занятие уже закончилось.', kk: 'Бұл сабақ аяқталды.' },

  // Memberships
  'This membership is not active.': { ru: 'Этот абонемент не активен.', kk: 'Бұл абонемент белсенді емес.' },
  'The visit balance cannot go below zero.': { ru: 'Баланс визитов не может быть меньше нуля.', kk: 'Келу саны нөлден аз бола алмайды.' },
  'This membership is not available for purchase.': { ru: 'Этот абонемент недоступен для покупки.', kk: 'Бұл абонементті сатып алу мүмкін емес.' },

  // Payments
  'This payment cannot be changed in its current state.': {
    ru: 'Этот платёж нельзя изменить в текущем статусе.',
    kk: 'Бұл төлемді қазіргі күйінде өзгертуге болмайды.',
  },
  'This payment method is not available.': { ru: 'Этот способ оплаты недоступен.', kk: 'Бұл төлем әдісі қолжетімсіз.' },
  'The refund amount exceeds the paid amount.': { ru: 'Сумма возврата больше оплаченной.', kk: 'Қайтару сомасы төленген сомадан көп.' },
  'The payment provider is not responding. Please try again later.': {
    ru: 'Платёжный сервис не отвечает. Попробуйте позже.',
    kk: 'Төлем қызметі жауап бермей тұр. Кейінірек қайталап көріңіз.',
  },
  'You already have a pending payment for this membership.': {
    ru: 'У вас уже есть неоплаченный счёт за этот абонемент.',
    kk: 'Бұл абонементке төленбеген шотыңыз бар.',
  },
  'This gift certificate code is not valid. Please check it and try again.': {
    ru: 'Код сертификата не подходит. Проверьте его и попробуйте ещё раз.',
    kk: 'Сертификат коды жарамсыз. Тексеріп, қайталап көріңіз.',
  },
  'This gift certificate has already been used.': { ru: 'Этот сертификат уже использован.', kk: 'Бұл сертификат қолданылып қойған.' },
  'This gift certificate has expired.': { ru: 'Срок действия сертификата истёк.', kk: 'Сертификаттың мерзімі өтіп кеткен.' },
  'This gift certificate was cancelled.': { ru: 'Этот сертификат аннулирован.', kk: 'Бұл сертификат жойылған.' },
  'Invalid payment notification.': { ru: 'Неверное уведомление о платеже.', kk: 'Төлем туралы хабарлама жарамсыз.' },
  'Choose a membership plan.': { ru: 'Выберите абонемент.', kk: 'Абонемент таңдаңыз.' },
  'Enter an amount.': { ru: 'Введите сумму.', kk: 'Соманы енгізіңіз.' },

  // Attendance / check-in
  'You can only manage attendance for your own sessions.': {
    ru: 'Отмечать посещаемость можно только на своих занятиях.',
    kk: 'Қатысуды тек өз сабақтарыңызда белгілей аласыз.',
  },
  'Attendance for this session can no longer be changed here.': {
    ru: 'Посещаемость этого занятия здесь больше изменить нельзя.',
    kk: 'Бұл сабақтың қатысуын енді мұнда өзгертуге болмайды.',
  },
  'This booking was cancelled.': { ru: 'Эта запись отменена.', kk: 'Бұл жазылу болдырылмады.' },
  'QR check-in is turned off.': { ru: 'Отметка по QR-коду отключена.', kk: 'QR-код арқылы белгілеу өшірулі.' },
  'This QR code is invalid or has expired. Ask the client to refresh it.': {
    ru: 'QR-код недействителен или устарел. Попросите клиента обновить его.',
    kk: 'QR-код жарамсыз немесе ескірген. Клиенттен оны жаңартуды сұраңыз.',
  },
  'This client has no booking for a current session.': {
    ru: 'У клиента нет записи на текущее занятие.',
    kk: 'Клиенттің ағымдағы сабаққа жазылуы жоқ.',
  },

  // Feedback, trials, content
  'Teacher feedback is turned off.': { ru: 'Отзывы преподавателей отключены.', kk: 'Мұғалім пікірлері өшірулі.' },
  'Feedback can be given only for attended sessions.': {
    ru: 'Отзыв можно оставить только о посещённом занятии.',
    kk: 'Пікірді тек қатысқан сабаққа қалдыруға болады.',
  },
  'This trial cannot be changed in its current state.': {
    ru: 'Пробное занятие нельзя изменить в текущем статусе.',
    kk: 'Сынақ сабақты қазіргі күйінде өзгертуге болмайды.',
  },
  'Some settings values are invalid.': { ru: 'Некоторые значения настроек неверны.', kk: 'Кейбір баптау мәндері қате.' },
  'The file could not be read. Please upload a valid CSV file.': {
    ru: 'Не удалось прочитать файл. Загрузите корректный CSV-файл.',
    kk: 'Файлды оқу мүмкін болмады. Дұрыс CSV файлын жүктеңіз.',
  },
  'The file is too large.': { ru: 'Файл слишком большой.', kk: 'Файл тым үлкен.' },
  'This file type is not allowed.': { ru: 'Этот тип файла не поддерживается.', kk: 'Бұл файл түріне рұқсат жоқ.' },
  'Attach a file.': { ru: 'Прикрепите файл.', kk: 'Файл тіркеңіз.' },
  'Invalid push endpoint.': { ru: 'Неверный адрес для push-уведомлений.', kk: 'Push хабарландыру мекенжайы қате.' },
  'Child profiles are for children and teenagers.': {
    ru: 'Детские профили создаются только для детей и подростков.',
    kk: 'Балалар профилі тек балалар мен жасөспірімдерге арналған.',
  },
  'No Talk Club account with this phone number.': {
    ru: 'Аккаунта Talk Club с этим номером нет.',
    kk: 'Бұл нөмірмен Talk Club аккаунты жоқ.',
  },
  'This request was already processed.': { ru: 'Эта заявка уже обработана.', kk: 'Бұл өтінім өңделіп қойған.' },
  'Referral not found.': { ru: 'Приглашение не найдено.', kk: 'Шақыру табылмады.' },
};

const NOT_FOUND = 'We could not find what you were looking for.';

/** The error message in the given language; falls back to English when there is no translation. */
export function localizeError(message: string, locale: Locale): string {
  if (locale === 'en') return message;
  const entry = ERROR_TRANSLATIONS[message] ?? (/ not found\.$/.test(message) ? ERROR_TRANSLATIONS[NOT_FOUND] : undefined);
  return entry ? entry[locale] : message;
}

/** Field messages from class-validator, by constraint name. */
const FIELD_TRANSLATIONS: Record<string, Translations> = {
  isNotEmpty: { ru: 'Заполните это поле.', kk: 'Бұл өрісті толтырыңыз.' },
  maxLength: { ru: 'Слишком длинное значение.', kk: 'Мән тым ұзын.' },
  minLength: { ru: 'Слишком короткое значение.', kk: 'Мән тым қысқа.' },
  isLength: { ru: 'Недопустимая длина.', kk: 'Ұзындығы жарамсыз.' },
  isEmail: { ru: 'Введите корректный email.', kk: 'Дұрыс email енгізіңіз.' },
  min: { ru: 'Слишком маленькое значение.', kk: 'Мән тым аз.' },
  max: { ru: 'Слишком большое значение.', kk: 'Мән тым көп.' },
  isUrl: { ru: 'Введите корректную ссылку.', kk: 'Дұрыс сілтеме енгізіңіз.' },
  isDateString: { ru: 'Введите корректную дату.', kk: 'Дұрыс күн енгізіңіз.' },
  isInt: { ru: 'Введите целое число.', kk: 'Бүтін сан енгізіңіз.' },
};
const FIELD_FALLBACK: Translations = { ru: 'Проверьте значение.', kk: 'Мәнді тексеріңіз.' };
const FIELD_MESSAGE_TRANSLATIONS: Record<string, Translations> = {
  'You must accept the terms': { ru: 'Нужно принять условия.', kk: 'Шарттарды қабылдау қажет.' },
  'Please accept the public offer': { ru: 'Примите публичную оферту.', kk: 'Жария офертаны қабылдаңыз.' },
  'code must be 6 digits': { ru: 'Код должен состоять из 6 цифр.', kk: 'Код 6 цифрдан тұруы керек.' },
};

/** A field validation message in the given language. */
export function localizeFieldError(message: string, constraint: string | undefined, locale: Locale): string {
  if (locale === 'en') return message;
  const entry = FIELD_MESSAGE_TRANSLATIONS[message] ?? (constraint ? FIELD_TRANSLATIONS[constraint] : undefined) ?? FIELD_FALLBACK;
  return entry[locale];
}

/** For tests: every English message that has translations. */
export const TRANSLATED_ERROR_MESSAGES = Object.keys(ERROR_TRANSLATIONS);
