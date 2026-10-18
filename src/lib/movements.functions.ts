import { createServerFn } from "@tanstack/react-start";
import { getServerSidePrismaClient } from "@/lib/db.server";
import { authMiddleware } from "@/lib/auth.functions";
import { z } from "zod";

export const createMovementServerFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ name: z.string().min(1), isBodyweight: z.boolean().default(false) }))
  .handler(async ({ data }: { data: { name: string; isBodyweight: boolean } }) => {
    const { getServerSidePrismaClient } = await import("@/lib/db.server");
    const prisma = await getServerSidePrismaClient();
    const movement = await prisma.movement.create({
      data: { name: data.name, isBodyweight: data.isBodyweight },
    });
    return { success: true, movement };
  });

export const getMovementsServerFn = createServerFn()
  .middleware([authMiddleware])
  .handler(async () => {
    const { getServerSidePrismaClient } = await import("@/lib/db.server");
    const prisma = await getServerSidePrismaClient();
    return prisma.movement.findMany({
      orderBy: { name: "asc" },
    });
  });

export const getMovementProgressServerFn = createServerFn()
  .middleware([authMiddleware])
  .inputValidator(z.object({ movementId: z.string() }))
  .handler(
    async ({
      context,
      data,
    }: {
      context: { user: { id: string } };
      data: { movementId: string };
    }) => {
      const prisma = await getServerSidePrismaClient();
      const movement = await prisma.movement.findUnique({ where: { id: data.movementId } });
      if (!movement) {
        throw new Error("Movement not found");
      }
      const workouts = await prisma.workout.findMany({
        where: {
          userId: context.user.id,
          completedAt: { not: null },
          sets: { some: { movementId: data.movementId } },
        },
        orderBy: { completedAt: "asc" },
        include: { sets: { where: { movementId: data.movementId } } },
      });
      return { movement, workouts };
    },
  );
