import type { Exercise } from '../../types/exercise.types';

/**
 * Volný fotbal / Volná hra — cvičení, která patří do každého tréninku.
 *
 * Trenéři mládežnického fotbalu typicky zařazují na konec tréninku
 * 15–30 min volné hry, kde si děti zahrají "normální" fotbal bez
 * přerušování a instrukcí. Je to motivační odměna i herní praxe.
 */
export const freePlayExercises: Exercise[] = [
  {
    id: 'free-001',
    name: 'Volný fotbal',
    description: 'Klasický fotbalový zápas bez přerušování. Trenér pouze sleduje a případně upraví počet hráčů na stranách.',
    instructions: [
      'Rozdělte hráče do dvou vyrovnaných týmů.',
      'Hrajte na malé branky nebo kužely (přizpůsobte velikost hřiště počtu hráčů).',
      'Trenér nezasahuje do hry — nechte děti řešit situace samy.',
      'Po pár minutách případně prohoďte slabší hráče, aby si zahráli všichni.',
    ],
    duration: { min: 10, max: 30, recommended: 20 },
    players: { min: 4, max: 'unlimited' },
    equipment: ['branky nebo kužely', 'míče', 'rozlišováky'],
    phaseType: 'main',
    skillFocus: ['hra'],
    suitableFor: ['pripravka', 'mladsi-zaci', 'starsi-zaci', 'dorost'],
    difficulty: 'beginner',
    coachTip: 'Volný fotbal je klíčový pro rozvoj herní kreativity. Odolajte pokušení neustále korigovat — děti se učí řešit situace samy.',
    variations: [
      'Podmínka: max. 3 doteky (pro starší)',
      'Bez brankáře (pro menší počet hráčů)',
      'Zmenšit hřiště pro intenzivnější hru',
    ],
    isStation: false,
  },
  {
    id: 'free-002',
    name: 'Volná hra',
    description: 'Nestrukturovaná hra — děti si samy zvolí pravidla, formát a týmy. Rozvíjí samostatnost a organizační schopnosti.',
    instructions: [
      'Dejte dětem míče a prostor.',
      'Nechte je, ať si samy rozdělí týmy a dohodnou pravidla.',
      'Trenér je k dispozici, ale nezasahuje pokud není třeba.',
      'Vhodné na závěr tréninku jako odměna.',
    ],
    duration: { min: 10, max: 20, recommended: 15 },
    players: { min: 4, max: 'unlimited' },
    equipment: ['branky nebo kužely', 'míče'],
    phaseType: 'main',
    skillFocus: ['hra'],
    suitableFor: ['pripravka', 'mladsi-zaci', 'starsi-zaci', 'dorost'],
    difficulty: 'beginner',
    coachTip: 'Pozorujte, jak děti řeší konflikty a organizují hru — ukazuje to jejich sociální a vůdčí schopnosti.',
    isStation: false,
  },
  {
    id: 'free-003',
    name: 'Zápas na malé branky',
    description: 'Herní cvičení na zmenšeném hřišti s malými brankami. Vhodné jako hlavní herní blok tréninku.',
    instructions: [
      'Připravte hřiště odpovídající počtu hráčů (např. 20×30 m pro 4v4).',
      'Postavte malé branky (kužely, tyče) nebo hrací branky.',
      'Hrajte na čas (2×8 min, 2×10 min) s krátkou přestávkou.',
      'Střídejte sestavy aby si zahráli všichni.',
    ],
    duration: { min: 15, max: 30, recommended: 20 },
    players: { min: 6, max: 'unlimited' },
    equipment: ['malé branky nebo kužely', 'míče', 'rozlišováky'],
    phaseType: 'main',
    skillFocus: ['hra', 'pozicování', 'prihrávky'],
    suitableFor: ['pripravka', 'mladsi-zaci', 'starsi-zaci', 'dorost'],
    difficulty: 'beginner',
    coachTip: 'Malé hřiště = více kontaktů s míčem = rychlejší rozvoj. Pro přípravku ideální formát.',
    variations: [
      'Hrát na 4 branky (rozvíjí přehled)',
      'Přidat neutrálního hráče (přesilovka útočícího týmu)',
      'Hrát bez brankáře',
    ],
    isStation: false,
  },
];
