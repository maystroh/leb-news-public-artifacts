const ACCOUNTS = [
  {
    outletKey: '180post',
    outletName: '180 بوست',
    aliases: ['180post', '180_post', '180 بوست'],
    url: 'https://x.com/180_post',
    handle: '@180_post'
  },
  {
    outletKey: 'asas-media',
    outletName: 'أساس ميديا',
    aliases: ['asas-media', 'asasmedia', 'أساس ميديا', 'اساس ميديا'],
    url: 'https://x.com/asasmedialb',
    handle: '@asasmedialb'
  },
  {
    outletKey: 'alakhbar',
    outletName: 'الأخبار',
    aliases: ['al-akhbar', 'alakhbar', 'الأخبار'],
    url: 'https://x.com/AlakhbarNews',
    handle: '@AlakhbarNews'
  },
  {
    outletKey: 'aliwaa',
    outletName: 'اللواء',
    aliases: ['aliwaa', 'aliwaa2', 'اللواء'],
    url: 'https://x.com/AliwaaNewspaper',
    handle: '@AliwaaNewspaper'
  },
  {
    outletKey: 'nidaa-al-watan',
    outletName: 'نداء الوطن',
    aliases: ['nidaa-al-watan', 'nidaalwatan', 'نداء الوطن'],
    url: 'https://x.com/NidaaWatan',
    handle: '@NidaaWatan'
  },
  {
    outletKey: 'aawsat',
    outletName: 'الشرق الأوسط',
    aliases: ['aawsat', 'asharqalawsat', 'الشرق الأوسط', 'الشرق الاوسط'],
    url: 'https://x.com/aawsat_News',
    handle: '@aawsat_News'
  },
  {
    outletKey: 'aljoumhouria',
    outletName: 'الجمهورية',
    aliases: ['aljoumhouria', 'الجمهورية'],
    url: 'https://x.com/aljoumhouria',
    handle: '@aljoumhouria'
  },
  {
    outletKey: 'almodon',
    outletName: 'المدن',
    aliases: ['almodon', 'modon', 'المدن'],
    url: 'https://x.com/almodononline',
    handle: '@almodononline'
  },
  {
    outletKey: 'aldiyar',
    outletName: 'الديار',
    aliases: ['aldiyar', 'addiyar', 'الديار'],
    url: 'https://x.com/AddiyarNews',
    handle: '@AddiyarNews'
  },
  {
    outletKey: 'albinaa',
    outletName: 'البناء',
    aliases: ['albinaa', 'albina2', 'البناء'],
    url: 'https://x.com/albinaaNews',
    handle: '@albinaaNews'
  }
];

const normalize = (value) => String(value || '')
  .toLowerCase()
  .replace(/[إأآ]/g, 'ا')
  .replace(/ة/g, 'ه')
  .replace(/ى/g, 'ي')
  .replace(/[^\p{L}\p{N}]+/gu, '')
  .trim();

const accountByAlias = new Map();
for (const account of ACCOUNTS) {
  for (const alias of [account.outletKey, account.outletName, ...account.aliases]) {
    accountByAlias.set(normalize(alias), account);
  }
}

export const OUTLET_X_ACCOUNTS = ACCOUNTS;
export const RADAR_BEIRUT_X_ACCOUNT = {
  name: 'Radar Beirut',
  url: 'https://x.com/RadarBeirut',
  handle: '@RadarBeirut'
};

export function findOutletXAccount(value) {
  return accountByAlias.get(normalize(value)) || null;
}

export function findOutletXAccountForOutlet(outlet) {
  return findOutletXAccount(outlet?.key) || findOutletXAccount(outlet?.name) || null;
}

export function formatXAccountList(accounts = OUTLET_X_ACCOUNTS) {
  return accounts
    .map((account) => `- ${account.outletName}: ${account.handle} ${account.url}`)
    .join('\n');
}

export function missingXHandles(text, accounts) {
  const haystack = String(text || '');
  return accounts.filter((account) => !haystack.includes(account.handle));
}
