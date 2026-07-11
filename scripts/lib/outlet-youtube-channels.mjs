const CHANNELS = [
  {
    outletKey: 'alakhbar',
    outletName: 'الأخبار',
    aliases: ['al-akhbar', 'alakhbar', 'الأخبار'],
    hashtags: ['#الأخبار', '#AlAkhbar'],
    url: 'https://www.youtube.com/channel/UCesINM73oox7GBSXTHz9Xiw'
  },
  {
    outletKey: 'asas-media',
    outletName: 'أساس ميديا',
    aliases: ['asas-media', 'asasmedia', 'أساس ميديا', 'اساس ميديا'],
    hashtags: ['#أساس_ميديا', '#AsasMedia'],
    url: 'https://www.youtube.com/@asasmedialb'
  },
  {
    outletKey: 'nidaa-al-watan',
    outletName: 'نداء الوطن',
    aliases: ['nidaa-al-watan', 'nidaalwatan', 'نداء الوطن'],
    hashtags: ['#نداء_الوطن', '#NidaaAlWatan'],
    url: 'https://www.youtube.com/channel/UCgDmbBPDnUWZdvMRrYG2C8Q'
  },
  {
    outletKey: 'almodon',
    outletName: 'المدن',
    aliases: ['almodon', 'modon', 'المدن'],
    hashtags: ['#المدن', '#AlModon'],
    url: 'https://www.youtube.com/user/Almodononline'
  },
  {
    outletKey: 'aawsat',
    outletName: 'الشرق الأوسط',
    aliases: ['aawsat', 'asharqalawsat', 'الشرق الأوسط', 'الشرق الاوسط'],
    hashtags: ['#الشرق_الأوسط', '#AsharqAlAwsat'],
    url: 'https://www.youtube.com/@aawsat'
  },
  {
    outletKey: 'aliwaa',
    outletName: 'اللواء',
    aliases: ['aliwaa', 'aliwaa2', 'اللواء'],
    hashtags: ['#اللواء', '#AlLiwaa'],
    url: 'https://www.youtube.com/@aliwaanewspaper7154'
  },
  {
    outletKey: 'aldiyar',
    outletName: 'الديار',
    aliases: ['aldiyar', 'addiyar', 'الديار'],
    hashtags: ['#الديار', '#Addiyar'],
    url: 'https://www.youtube.com/channel/UC6ObY8lCD2oHmyLjKqLAn1g/featured'
  }
];

const normalize = (value) => String(value || '')
  .toLowerCase()
  .replace(/[إأآ]/g, 'ا')
  .replace(/ة/g, 'ه')
  .replace(/ى/g, 'ي')
  .replace(/[^\p{L}\p{N}]+/gu, '')
  .trim();

const channelByAlias = new Map();
for (const channel of CHANNELS) {
  for (const alias of [channel.outletKey, channel.outletName, ...channel.aliases]) {
    channelByAlias.set(normalize(alias), channel);
  }
}

export const OUTLET_YOUTUBE_CHANNELS = CHANNELS;

export function findOutletYoutubeChannel(value) {
  return channelByAlias.get(normalize(value)) || null;
}

export function findOutletYoutubeChannelForOutlet(outlet) {
  return findOutletYoutubeChannel(outlet?.key) || findOutletYoutubeChannel(outlet?.name) || null;
}

export function uniqueYoutubeChannelsForOutletNames(outletNames) {
  const seen = new Set();
  const channels = [];
  for (const outletName of outletNames) {
    const channel = findOutletYoutubeChannel(outletName);
    if (!channel || seen.has(channel.outletKey)) continue;
    seen.add(channel.outletKey);
    channels.push(channel);
  }
  return channels;
}

export function formatYoutubeChannelList(channels = OUTLET_YOUTUBE_CHANNELS) {
  return channels
    .map((channel) => `- ${channel.outletName}: ${channel.url} | hashtags: ${(channel.hashtags || []).join(' ')}`)
    .join('\n');
}

export function missingYoutubeChannelUrls(text, channels) {
  const haystack = String(text || '');
  return channels.filter((channel) => !haystack.includes(channel.url));
}

export function missingOutletHashtags(tags, channels) {
  const tagSet = new Set((Array.isArray(tags) ? tags : []).map((tag) => String(tag).trim()));
  return channels
    .map((channel) => ({
      channel,
      missing: (channel.hashtags || []).filter((tag) => !tagSet.has(tag))
    }))
    .filter((entry) => entry.missing.length > 0);
}
