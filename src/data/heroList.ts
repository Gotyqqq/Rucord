export type Attribute = 'str' | 'agi' | 'int';
export type AttackType = 'Melee' | 'Ranged';

export interface Ability {
  name: string;
  cooldown: number;
}

export interface HeroStats {
  damage: number;
  armor: number;
  speed: number;
  baseStr: number;
  baseAgi: number;
  baseInt: number;
}

export interface Hero {
  id: string;
  name: string;
  attribute: Attribute;
  attackType: AttackType;
  image: string;
  render: string;
  stats: HeroStats;
  abilities: Ability[];
  lore: string;
}

const BASE =
  'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes';
const RENDER =
  'https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders';

export const HERO_LIST: Hero[] = [
  {
    id: 'pudge',
    name: 'Pudge',
    attribute: 'str',
    attackType: 'Melee',
    image: `${BASE}/pudge.png`,
    render: `${RENDER}/pudge.webm`,
    lore: 'The Butcher, feared in the lanes for his deadly hook.',
    stats: { damage: 62, armor: 2, speed: 280, baseStr: 25, baseAgi: 14, baseInt: 16 },
    abilities: [
      { name: 'Meat Hook', cooldown: 14 },
      { name: 'Rot', cooldown: 0 },
      { name: 'Flesh Heap', cooldown: 0 },
      { name: 'Dismember', cooldown: 30 },
    ],
  },
  {
    id: 'juggernaut',
    name: 'Juggernaut',
    attribute: 'agi',
    attackType: 'Melee',
    image: `${BASE}/juggernaut.png`,
    render: `${RENDER}/juggernaut.webm`,
    lore: 'An exile who finds peace only in battle.',
    stats: { damage: 52, armor: 3, speed: 305, baseStr: 20, baseAgi: 26, baseInt: 14 },
    abilities: [
      { name: 'Blade Fury', cooldown: 18 },
      { name: 'Healing Ward', cooldown: 60 },
      { name: 'Blade Dance', cooldown: 0 },
      { name: 'Omnislash', cooldown: 120 },
    ],
  },
  {
    id: 'crystal_maiden',
    name: 'Crystal Maiden',
    attribute: 'int',
    attackType: 'Ranged',
    image: `${BASE}/crystal_maiden.png`,
    render: `${RENDER}/crystal_maiden.webm`,
    lore: 'Rylai channels the raw power of ice.',
    stats: { damage: 45, armor: 1, speed: 275, baseStr: 18, baseAgi: 16, baseInt: 25 },
    abilities: [
      { name: 'Crystal Nova', cooldown: 12 },
      { name: 'Frostbite', cooldown: 10 },
      { name: 'Arcane Aura', cooldown: 0 },
      { name: 'Freezing Field', cooldown: 110 },
    ],
  },
  {
    id: 'axe',
    name: 'Axe',
    attribute: 'str',
    attackType: 'Melee',
    image: `${BASE}/axe.png`,
    render: `${RENDER}/axe.webm`,
    lore: 'The Red Mist General lives for combat.',
    stats: { damage: 60, armor: 1, speed: 310, baseStr: 25, baseAgi: 20, baseInt: 18 },
    abilities: [
      { name: 'Berserker’s Call', cooldown: 16 },
      { name: 'Battle Hunger', cooldown: 20 },
      { name: 'Counter Helix', cooldown: 0 },
      { name: 'Culling Blade', cooldown: 75 },
    ],
  },
];
