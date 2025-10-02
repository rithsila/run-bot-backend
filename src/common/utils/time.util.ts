// src/common/utils/time.util.ts
export function formatRemainingLockTime(until: Date): string {
  const diff = until.getTime() - Date.now();
  if (diff <= 0) return 'a few seconds';

  const totalSec = Math.ceil(diff / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;

  if (minutes > 0 && seconds > 0) return `${minutes} minute(s) and ${seconds} second(s)`;
  if (minutes > 0) return `${minutes} minute(s)`;
  return `${seconds} second(s)`;
}


type RoundMode = 'round' | 'floor' | 'ceil';
type UnitStyle = 'short' | 'long'; // short: "hr/min", long: "hour/minute"

export function formatHoursMinutes(
  seconds: number | null | undefined,
  {
    round: mode = 'round',
    style = 'short',
    hideZeroMinutes = true, // e.g. 3600s -> "1 hr" instead of "1 hr 0 min"
  }: { round?: RoundMode; style?: UnitStyle; hideZeroMinutes?: boolean } = {}
): string {
  if (seconds == null || !isFinite(seconds)) return style === 'long' ? '0 minutes' : '0 min';

  const totalMinutes =
    mode === 'floor' ? Math.floor(seconds / 60)
      : mode === 'ceil' ? Math.ceil(seconds / 60)
        : Math.round(seconds / 60);

  let hours = Math.floor(totalMinutes / 60);
  let minutes = totalMinutes % 60;

  // If rounding pushed minutes to 60, roll over to hours
  if (minutes === 60) { hours += 1; minutes = 0; }

  const hrUnit = style === 'long' ? (hours === 1 ? 'hour' : 'hours') : 'hr';
  const minUnit = style === 'long' ? (minutes === 1 ? 'minute' : 'minutes') : 'min';

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${hrUnit}`);
  if (!(hideZeroMinutes && hours > 0 && minutes === 0)) parts.push(`${minutes} ${minUnit}`);

  // If both are zero
  if (parts.length === 0) return style === 'long' ? '0 minutes' : '0 min';
  return parts.join(' ');
}
