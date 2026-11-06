import { prisma } from "./db";

/** Default weekly capacity until the user sets real numbers:
 *  0h weekends, 4h weekdays. Idempotent upsert by weekday. */
export async function seedCapacity() {
  const defaults = new Map<number, number>([
    [0, 0], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 0],
  ]);
  for (const [weekday, hours] of defaults) {
    await prisma.weeklyCapacity.upsert({
      where: { weekday },
      create: { weekday, hours },
      update: {},
    });
  }
}
