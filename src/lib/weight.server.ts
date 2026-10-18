import { createServerFn } from "@tanstack/react-start";
import { getServerSidePrismaClient } from "@/lib/db.server";
import { authMiddleware } from "@/lib/auth.server";
import { z } from "zod";

export const addBodyWeightServerFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ weightLbs: z.number().int().min(1).max(1500) }))
  .handler(async ({ context, data }: { context: { user: { id: string } }; data: { weightLbs: number } }) => {
    const prisma = await getServerSidePrismaClient();
    const record = await prisma.bodyWeightRecord.create({
      data: {
        userId: context.user.id,
        weightLbs: data.weightLbs,
      },
    });
    return { success: true, record };
  });

export const getWeightsServerFn = createServerFn()
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const prisma = await getServerSidePrismaClient();
    const records = await prisma.bodyWeightRecord.findMany({
      where: { userId: context.user.id },
      orderBy: { recordedAt: "asc" },
    });
    return records;
  });

export const getLatestBodyWeightServerFn = createServerFn()
  .middleware([authMiddleware])
  .handler(async ({ context }: { context: { user: { id: string } } }) => {
    const prisma = await getServerSidePrismaClient();
    return prisma.bodyWeightRecord.findFirst({
      where: { userId: context.user.id },
      orderBy: { recordedAt: "desc" },
    });
  });

export const deleteWeightServerFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ context, data }: { context: { user: { id: string } }; data: { id: string } }) => {
    const prisma = await getServerSidePrismaClient();
    // Verify the record belongs to the user before deleting
    const record = await prisma.bodyWeightRecord.findFirst({
      where: { id: data.id, userId: context.user.id },
    });
    if (!record) {
      return { success: false, error: "Record not found" };
    }
    await prisma.bodyWeightRecord.delete({ where: { id: data.id } });
    return { success: true };
  });
