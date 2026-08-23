import { PrismaClient, UserType } from '@prisma/client';
import exercises from './data/exercises.json';

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
