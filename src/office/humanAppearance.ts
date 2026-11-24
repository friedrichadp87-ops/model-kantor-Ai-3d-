import type { AgentId } from './types';

export type HumanHairStyle =
  | 'sleek-bob'
  | 'long-wavy'
  | 'bun-updo'
  | 'ponytail'
  | 'side-sweep'
  | 'short-part'
  | 'cropped-fade'
  | 'curly-short';

export type HumanTopStyle = 'blazer' | 'shirt' | 'cardigan' | 'vest' | 'jacket' | 'hoodie' | 'sweater';

export type HumanBottomStyle = 'trousers' | 'skirt';

export type HumanAccessory = 'none' | 'glasses' | 'headset' | 'headset-mic' | 'tie' | 'tie-glasses' | 'scarf';

export interface HumanAppearanceProfile {
  id: AgentId;
  skinHex: string;
  hairHex: string;
  hairStyle: HumanHairStyle;
  topStyle: HumanTopStyle;
  topHex: string;
  innerShirtHex: string;
  bottomStyle: HumanBottomStyle;
  bottomHex: string;
  shoeHex: string;
  accessory: HumanAccessory;
  /** Slight height scale variation (0.95–1.04) so the 13 people feel organically diverse */
  heightScale: number;
}

export const HUMAN_APPEARANCE_BY_ID: Record<AgentId, HumanAppearanceProfile> = {
  ceo: {
    id: 'ceo',
    skinHex: '#efc4a3',
    hairHex: '#251a15',
    hairStyle: 'sleek-bob',
    topStyle: 'blazer',
    topHex: '#256fa8',
    innerShirtHex: '#f8fafc',
    bottomStyle: 'trousers',
    bottomHex: '#1e293b',
    shoeHex: '#1f242d',
    accessory: 'none',
    heightScale: 1.0,
  },
  'trend-researcher': {
    id: 'trend-researcher',
    skinHex: '#ddab84',
    hairHex: '#18181c',
    hairStyle: 'short-part',
    topStyle: 'shirt',
    topHex: '#3b7dd8',
    innerShirtHex: '#f1f5f9',
    bottomStyle: 'trousers',
    bottomHex: '#334155',
    shoeHex: '#3b2e26',
    accessory: 'none',
    heightScale: 1.03,
  },
  'bible-researcher': {
    id: 'bible-researcher',
    skinHex: '#f0c9aa',
    hairHex: '#352319',
    hairStyle: 'bun-updo',
    topStyle: 'cardigan',
    topHex: '#c9821e',
    innerShirtHex: '#fffbeb',
    bottomStyle: 'skirt',
    bottomHex: '#3f352e',
    shoeHex: '#3a2b22',
    accessory: 'glasses',
    heightScale: 0.97,
  },
  scriptwriter: {
    id: 'scriptwriter',
    skinHex: '#e4b28a',
    hairHex: '#43281d',
    hairStyle: 'ponytail',
    topStyle: 'cardigan',
    topHex: '#d96c2c',
    innerShirtHex: '#fff7ed',
    bottomStyle: 'trousers',
    bottomHex: '#334155',
    shoeHex: '#2b2421',
    accessory: 'none',
    heightScale: 0.98,
  },
  'theological-guardian': {
    id: 'theological-guardian',
    skinHex: '#cc956c',
    hairHex: '#2c2f38',
    hairStyle: 'short-part',
    topStyle: 'vest',
    topHex: '#4752b5',
    innerShirtHex: '#f8fafc',
    bottomStyle: 'trousers',
    bottomHex: '#1e2433',
    shoeHex: '#241c17',
    accessory: 'tie-glasses',
    heightScale: 1.04,
  },
  'pastoral-checker': {
    id: 'pastoral-checker',
    skinHex: '#f2cbb0',
    hairHex: '#3c271d',
    hairStyle: 'long-wavy',
    topStyle: 'cardigan',
    topHex: '#c89618',
    innerShirtHex: '#fefce8',
    bottomStyle: 'skirt',
    bottomHex: '#4a423b',
    shoeHex: '#3e2f26',
    accessory: 'scarf',
    heightScale: 0.97,
  },
  'storyboard-artist': {
    id: 'storyboard-artist',
    skinHex: '#e2af88',
    hairHex: '#1d1c22',
    hairStyle: 'side-sweep',
    topStyle: 'jacket',
    topHex: '#0f8b7d',
    innerShirtHex: '#f0fdfa',
    bottomStyle: 'trousers',
    bottomHex: '#27303f',
    shoeHex: '#e2e8f0',
    accessory: 'none',
    heightScale: 0.98,
  },
  'visual-curator': {
    id: 'visual-curator',
    skinHex: '#d59f77',
    hairHex: '#191a1f',
    hairStyle: 'curly-short',
    topStyle: 'shirt',
    topHex: '#1d8f68',
    innerShirtHex: '#ecfdf5',
    bottomStyle: 'trousers',
    bottomHex: '#4b453b',
    shoeHex: '#3f3227',
    accessory: 'glasses',
    heightScale: 1.02,
  },
  'video-composer': {
    id: 'video-composer',
    skinHex: '#c88f67',
    hairHex: '#17181c',
    hairStyle: 'cropped-fade',
    topStyle: 'hoodie',
    topHex: '#2563c4',
    innerShirtHex: '#eff6ff',
    bottomStyle: 'trousers',
    bottomHex: '#1f2937',
    shoeHex: '#e2e8f0',
    accessory: 'headset',
    heightScale: 1.03,
  },
  'voice-artist': {
    id: 'voice-artist',
    skinHex: '#eec3a4',
    hairHex: '#2e1f27',
    hairStyle: 'long-wavy',
    topStyle: 'sweater',
    topHex: '#8b55c7',
    innerShirtHex: '#faf5ff',
    bottomStyle: 'skirt',
    bottomHex: '#24314a',
    shoeHex: '#28232d',
    accessory: 'headset-mic',
    heightScale: 0.96,
  },
  'video-editor': {
    id: 'video-editor',
    skinHex: '#d9a47c',
    hairHex: '#1e1b18',
    hairStyle: 'cropped-fade',
    topStyle: 'hoodie',
    topHex: '#c7324e',
    innerShirtHex: '#fff1f2',
    bottomStyle: 'trousers',
    bottomHex: '#1f2937',
    shoeHex: '#1e293b',
    accessory: 'headset',
    heightScale: 1.02,
  },
  'seo-publisher': {
    id: 'seo-publisher',
    skinHex: '#ebbf9d',
    hairHex: '#2c1e18',
    hairStyle: 'sleek-bob',
    topStyle: 'blazer',
    topHex: '#0e80b8',
    innerShirtHex: '#f8fafc',
    bottomStyle: 'trousers',
    bottomHex: '#1e293b',
    shoeHex: '#252a34',
    accessory: 'glasses',
    heightScale: 0.98,
  },
  'community-prayer': {
    id: 'community-prayer',
    skinHex: '#e5b38c',
    hairHex: '#332219',
    hairStyle: 'bun-updo',
    topStyle: 'sweater',
    topHex: '#d4951c',
    innerShirtHex: '#fffbeb',
    bottomStyle: 'skirt',
    bottomHex: '#473a32',
    shoeHex: '#3c2d23',
    accessory: 'scarf',
    heightScale: 0.96,
  },
};

export function getHumanAppearance(id: AgentId): HumanAppearanceProfile {
  return HUMAN_APPEARANCE_BY_ID[id];
}
