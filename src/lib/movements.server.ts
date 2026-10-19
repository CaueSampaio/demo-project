import { createServerFn } from "@tanstack/react-start";
import { getServerSidePrismaClient } from "@/lib/db.server";
import { authMiddleware } from "@/lib/auth.server";
import { z } from "zod";

export const createMovementServerFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ name: z.string().min(1), isBodyweight: z.boolean().default(false) }))
  .handler(async ({ data }: { data: { name: string; isBodyweight: boolean } }) => {
    const prisma = await getServerSidePrismaClient();
    const movement = await prisma.movement.create({
      data: { name: data.name, isBodyweight: data.isBodyweight },
    });
    return { success: true, movement };
  });

export const getMovementsServerFn = createServerFn()
  .middleware([authMiddleware])
  .handler(async () => {
  const prisma = await getServerSidePrismaClient();
  return prisma.movement.findMany({
    orderBy: { name: "asc" },
  });
});
