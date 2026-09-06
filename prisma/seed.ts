import { PrismaClient, UserType } from '@prisma/client';
import exercises from './data/exercises.json';
import { programSeeds } from './data/programs';
import { blocksCreate, programMeta, refKey } from './data/programs/build';

const SYSTEM_USER_ID = -1;

/**
 * Curated programs are keyed by slug. A program is created when missing and
 * rebuilt when the seed carries a newer version (existing enrollments keep
 * their snapshot, so this never disturbs a running program).
 */
async function seedPrograms() {
  const systemExercises = await prisma.exercise.findMany({
    where: { userId: SYSTEM_USER_ID },
    select: { id: true, name: true, equipment: true },
  });
  const idByRef = new Map(
    systemExercises.map((exercise) => [
      refKey({ name: exercise.name, equipment: exercise.equipment }),
      exercise.id,
    ]),
  );
  const resolve = (ref: { name: string; equipment: string }) => {
    const id = idByRef.get(refKey(ref));
    if (id === undefined) {
      throw new Error(`Unknown system exercise: ${ref.name} (${ref.equipment})`);
    }
    return id;
  };

  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const seed of programSeeds) {
    const existing = await prisma.program.findUnique({
      where: { userId_slug: { userId: SYSTEM_USER_ID, slug: seed.slug } },
      select: { id: true, version: true },
    });
    if (existing && existing.version >= seed.version) {
      skipped++;
      continue;
    }
    const blocks = blocksCreate(seed, resolve);
    if (!existing) {
      await prisma.program.create({
        data: {
          userId: SYSTEM_USER_ID,
          slug: seed.slug,
          version: seed.version,
          visibility: 'SYSTEM',
          ...programMeta(seed),
          blocks: { create: blocks },
        },
      });
      created++;
    } else {
      await prisma.$transaction([
        prisma.programBlock.deleteMany({ where: { programId: existing.id } }),
        prisma.program.update({
          where: { id: existing.id },
          data: { ...programMeta(seed), version: seed.version, blocks: { create: blocks } },
        }),
      ]);
      updated++;
    }
  }
  console.log(
    `✅ Program seeding completed: ${created} created, ${updated} updated, ${skipped} up to date`,
  );
}

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  try {
    await prisma.user.upsert({
      where: { id: -1 },
      create: {
        id: -1,
        userType: UserType.SYSTEM,
        email: 'system@nextlift.invalid',
        password: 'invalidhashjustforseeding',
        isEmailConfirmed: true,
        isActive: false,
      },
      update: { email: 'system@nextlift.invalid' },
    });
    console.log('✅ System user created/verified');

    console.log('📝 Creating exercises...');
    const result = await prisma.exercise.createMany({
      data: exercises,
      skipDuplicates: true,
    });
    console.log(
      `✅ Exercise seeding completed: ${result.count} exercises processed`,
    );

    const totalExercises = await prisma.exercise.count({
      where: { userId: -1 },
    });
    console.log(`📊 Total system exercises in database: ${totalExercises}`);

    console.log('📅 Creating curated programs...');
    await seedPrograms();
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('💥 Fatal seeding error:', e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
