const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://noroinoogmg_db_user:R32dljwv3Zn5Y2gO@eternalglory.bpzxicx.mongodb.net/?appName=eternalglory').then(async () => {
  const c = mongoose.connection.collection('certificates');
  const docs = await c.find({ status: { $in: ['FAILED', 'PROCESSING'] } }).toArray();
  console.log(JSON.stringify(docs, null, 2));
  process.exit();
});
