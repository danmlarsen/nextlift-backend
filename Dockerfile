FROM node:22-alpine

WORKDIR /app

COPY package*.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN npm install -g pnpm@11.9.0 && pnpm install --frozen-lockfile

COPY . .

RUN npx prisma generate

EXPOSE 3000

# Run migrations then start the app
CMD ["sh", "-c", "npx prisma migrate dev && npx prisma db seed && npm run start:dev"]