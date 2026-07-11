export const RADAR_BEIRUT_PUBLISHING_HASHTAGS = [
  '#لبنان',
  '#Lebanon',
  '#بيروت',
  '#Beirut',
  '#RadarBeirut',
  '#رادار_بيروت',
  '#حزب_الله',
  '#Hezbollah',
  '#إسرائيل',
  '#Israel',
  '#الجنوب',
  '#SouthLebanon',
  '#السيادة',
  '#LebanesePolitics',
  '#صحافة_لبنانية'
];

export function missingPublishingHashtags(tags) {
  const tagSet = new Set((Array.isArray(tags) ? tags : []).map((tag) => String(tag).trim()));
  return RADAR_BEIRUT_PUBLISHING_HASHTAGS.filter((tag) => !tagSet.has(tag));
}
