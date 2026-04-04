// src/common/utils/time.util.ts
export function formatRemainingLockTime(until: Date): string {
    const diff = until.getTime() - Date.now();
    if (diff <= 0) return 'a few seconds';

    const totalSec = Math.ceil(diff / 1000);
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;

    if (minutes > 0 && seconds > 0)
        return `${minutes} minute(s) and ${seconds} second(s)`;
    if (minutes > 0) return `${minutes} minute(s)`;
    return `${seconds} second(s)`;
}

type RoundMode = 'round' | 'floor' | 'ceil';
type UnitStyle = 'short' | 'long'; // short: "hr/min", long: "hour/minute"
