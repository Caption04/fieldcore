const { app } = require('./src/app');
const { prisma } = require('./src/db');

const PORT = Number(process.env.PORT || 3000);

const server = app.listen(PORT, () => {
  console.log(`FieldCore server running at http://localhost:${PORT}`);
});

async function shutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
