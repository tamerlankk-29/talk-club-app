const MAP: Record<string, string> = {
  а: 'a', ә: 'a', б: 'b', в: 'v', г: 'g', ғ: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i',
  к: 'k', қ: 'q', л: 'l', м: 'm', н: 'n', ң: 'n', о: 'o', ө: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ұ: 'u', ү: 'u', ф: 'f', х: 'kh', һ: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', і: 'i',
  ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Russian/Kazakh Cyrillic → Latin (used for readable referral codes such as TAMERLAN10). */
export function transliterate(input: string): string {
  return [...input]
    .map((ch) => {
      const lower = ch.toLowerCase();
      const mapped = MAP[lower];
      if (mapped === undefined) return ch;
      return ch === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
    })
    .join('');
}
