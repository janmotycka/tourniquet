import type { TrainingUnit } from '../types/training.types';
import { CATEGORY_CONFIGS } from '../data/categories.data';
import { SKILL_FOCUS_CONFIGS } from '../data/skill-focus.data';

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

const PHASE_EMOJI: Record<string, string> = {
  warmup: '🔥',
  main: '⚡',
  cooldown: '🧘',
};

export function formatTrainingForShare(training: TrainingUnit, t?: TranslateFn): string {
  const resolve = t ?? ((key: string) => key);
  const cfg = CATEGORY_CONFIGS[training.input.category];
  const uLabel = training.input.selectedULabel ? `${training.input.selectedULabel} – ` : '';
  const focusLabels = training.input.skillFocus
    .map(sf => resolve(SKILL_FOCUS_CONFIGS[sf]?.label ?? sf))
    .join(', ');

  const date = new Date(training.createdAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const lines: string[] = [
    `⚽ *${training.title}*`,
    `📅 ${date}`,
    `👥 ${uLabel}${resolve(cfg.label)} (${resolve(cfg.ageRange)})`,
    `⏱ ${resolve('share.total')}: ${training.totalDuration} min`,
    `🎯 ${resolve('share.focus')}: ${focusLabels}`,
    '',
  ];

  for (const phase of training.phases) {
    const emoji = PHASE_EMOJI[phase.type] ?? '📌';
    lines.push(`${emoji} *${resolve(phase.label).toUpperCase()}* (${phase.durationMinutes} min)`);

    if ((phase.stations?.length ?? 0) > 0) {
      for (const station of phase.stations!) {
        const coachPart = station.coachAssigned === null
          ? `(${resolve('share.freeStation')})`
          : station.coachName
            ? `– ${station.coachName}`
            : '';
        lines.push(`  📍 ${resolve('share.station')} ${station.stationNumber}: ${station.exercise.name} ${coachPart} (${station.durationMinutes} min)`);
      }
    } else {
      for (const ex of phase.exercises) {
        lines.push(`  • ${ex.name} (${ex.duration.recommended} min)`);
      }
    }
    lines.push('');
  }

  lines.push(`_${resolve('share.generatedBy')}_`);
  return lines.join('\n');
}

export function shareToWhatsApp(text: string): void {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener');
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  }
}
