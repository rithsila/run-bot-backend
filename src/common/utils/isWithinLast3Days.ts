export function isWithinLast3Days(date: Date | string): boolean {
    const now = new Date();
    const d = typeof date === 'string' ? new Date(date) : date;
    const msIn3Days = 3 * 24 * 60 * 60 * 1000;
    return now.getTime() - d.getTime() < msIn3Days;
}