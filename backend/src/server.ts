import { app } from './app';
import {prisma} from './utils/prisma';
import { redis } from './utils/redis';

const PORT = Number(process.env.PORT || 4000);
const server = app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});

async function shutdown() {
  console.log('Graceful shutdown...');
  server.close(async () => {
    try { await prisma.$disconnect(); } catch (e) { console.error(e); }
    try { await redis.quit(); } catch (e) { console.error(e); }
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
