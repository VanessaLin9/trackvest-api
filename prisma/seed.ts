// import bcrypt from 'bcrypt';

// const prisma = new PrismaClientExtension();

// async function main() {
//   console.log('🌱 Seeding database...');

//   // 清空既有資料（開發環境安全使用）
//   await prisma.txTag.deleteMany();
//   await prisma.tag.deleteMany();
//   await prisma.transaction.deleteMany();
//   await prisma.position.deleteMany();
//   await prisma.price.deleteMany();
//   await prisma.asset.deleteMany();
//   await prisma.account.deleteMany();
//   await prisma.user.deleteMany();
//   await prisma.fxRate.deleteMany();

//   // 建立測試用使用者
//   const adminPw = await bcrypt.hash('admin123', 10);
//   const userPw = await bcrypt.hash('user123', 10);

//   const [admin, user] = await Promise.all([
//     prisma.user.create({
//       data: {
//         email: 'admin@example.com',
//         passwordHash: adminPw,
//         role: 'admin',
//       },
//     }),
//     prisma.user.create({
//       data: {
//         email: 'user@example.com',
//         passwordHash: userPw,
//         role: 'user',
//       },
//     }),
//   ]);

//   // 建立帳戶
//   const [adminAccount, userAccount] = await Promise.all([
//     prisma.account.create({
//       data: {
//         userId: admin.id,
//         name: 'Admin Broker Account',
//         type: 'broker',
//         currency: 'USD',
//       },
//     }),
//     prisma.account.create({
//       data: {
//         userId: user.id,
//         name: 'User Broker Account',
//         type: 'broker',
//         currency: 'TWD',
//       },
//     }),
//   ]);

//   // 建立資產
//   const [aapl, tw0050] = await Promise.all([
//     prisma.asset.create({
//       data: {
//         symbol: 'AAPL',
//         name: 'Apple Inc.',
//         type: 'equity',
//         baseCurrency: 'USD',
//       },
//     }),
//     prisma.asset.create({
//       data: {
//         symbol: '0050.TW',
//         name: 'Taiwan 50 ETF',
//         type: 'etf',
//         baseCurrency: 'TWD',
//       },
//     }),
//   ]);

//   // 建立交易
//   const now = new Date();
//   const txs = await prisma.transaction.createMany({
//     data: [
//       {
//         accountId: adminAccount.id,
//         assetId: aapl.id,
//         type: 'buy',
//         amount: -1500,
//         quantity: 10,
//         price: 150,
//         fee: 1,
//         tradeTime: new Date(now.getTime() - 86400000 * 10),
//         note: 'Admin bought AAPL',
//       },
//       {
//         accountId: adminAccount.id,
//         assetId: aapl.id,
//         type: 'sell',
//         amount: 1600,
//         quantity: 10,
//         price: 160,
//         fee: 1,
//         tradeTime: new Date(now.getTime() - 86400000 * 5),
//         note: 'Admin sold AAPL',
//       },
//       {
//         accountId: userAccount.id,
//         assetId: tw0050.id,
//         type: 'buy',
//         amount: -50000,
//         quantity: 100,
//         price: 500,
//         fee: 10,
//         tradeTime: new Date(now.getTime() - 86400000 * 7),
//         note: 'User bought 0050',
//       },
//       {
//         accountId: userAccount.id,
//         type: 'deposit',
//         amount: 20000,
//         tradeTime: new Date(now.getTime() - 86400000 * 3),
//         note: 'User deposited cash',
//       },
//       {
//         accountId: userAccount.id,
//         assetId: tw0050.id,
//         type: 'sell',
//         amount: 55000,
//         quantity: 100,
//         price: 550,
//         fee: 10,
//         tradeTime: new Date(now.getTime() - 86400000),
//         note: 'User sold 0050',
//         isDeleted: true, // ⬅ 模擬軟刪除一筆
//         deletedAt: new Date(now.getTime() - 86400000),
//       },
//     ],
//   });
//   console.log(`✅ Created ${txs.count} transactions`);

//   // 建立標籤與關聯
//   const tag = await prisma.tag.create({
//     data: { userId: user.id, name: 'Long-term' },
//   });
//   const userTx = await prisma.transaction.findFirst({
//     where: { accountId: userAccount.id, isDeleted: false },
//   });
//   if (userTx) {
//     await prisma.txTag.create({
//       data: {
//         transactionId: userTx.id,
//         tagId: tag.id,
//       },
//     });
//   }

//   // 匯率與價格
//   await Promise.all([
//     prisma.fxRate.create({
//       data: { base: 'USD', quote: 'TWD', rate: 32.5, asOf: now },
//     }),
//     prisma.price.create({
//       data: { assetId: aapl.id, price: 165, asOf: now, source: 'SeedData' },
//     }),
//     prisma.price.create({
//       data: { assetId: tw0050.id, price: 560, asOf: now, source: 'SeedData' },
//     }),
//   ]);

//   console.log('🌱 Seed completed successfully.');
// }

// main()
//   .catch((e) => {
//     console.error(e);
//     process.exit(1);
//   })
//   .finally(async () => {
//     await prisma.$disconnect();
//   });
