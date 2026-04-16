export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function calcStreak(data: Record<string, number>, today: Date = new Date()): number {
  let streak = 0;
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  while (true) {
    const key = formatDate(d);
    if ((data[key] ?? 0) > 0) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

export function calcInactiveDays(data: Record<string, number>, today: Date = new Date()): number {
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  for (let i = 0; i <= 3650; i++) {
    const key = formatDate(d);
    if ((data[key] ?? 0) > 0) return i;
    d.setDate(d.getDate() - 1);
  }
  return Infinity;
}

export function stageFromCommits(n: number): number {
  if (n <= 0) return 0;
  if (n <= 10) return 1;
  if (n <= 30) return 2;
  if (n <= 100) return 3;
  if (n <= 300) return 4;
  if (n <= 700) return 5;
  return 6;
}

export function thicknessFromMax(n: number): number {
  if (n <= 0) return 0;
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  if (n <= 9) return 3;
  if (n <= 19) return 4;
  return 5;
}

export function fireflyCountFromStreak(streak: number): number {
  if (streak < 3) return 0;
  if (streak < 7) return 1;
  if (streak < 14) return 2;
  if (streak < 30) return 3;
  return 4;
}

export function leafDesaturationFromInactive(days: number): number {
  if (days < 3) return 0;
  if (days < 7) return 0.2;
  return 0.4;
}
