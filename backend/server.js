const express = require('express');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');
const aunthenticateToken = require('./middleware/tokens.js');
const AuthUserRoute = require('./routes/AuthUserRoute.js');
const productRoute = require('./routes/productRoute.js');
const cartRouter = require('./routes/cartRoute.js');
const checkoutRoute = require('./routes/checkoutRoute.js');
const webhookRoute = require('./routes/WebHook.js');
const order = require('./routes/orderRoutes');
const cake = require('./routes/cakeRoute.js');
const Otp = require('./middleware/Otp.js');
//const modelsRoutes = require('./routes/ModelsRoutes.js');
require('dotenv').config({ path: './access.env' });
const mongoose = require('mongoose');
const { updateBestSellerRankings } = require('./utils/updateBestSellers');
const cron = require('node-cron');

const app = express();
const port = process.env.PORT || 8080;


// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => console.error('MongoDB connection error:', err));

app.use(cors());
app.use(express.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'my-react-app', 'build')));
app.use('/models', express.static(path.join(__dirname, 'public/models')));
app.use('/textures', express.static(path.join(__dirname, 'public/textures')));

app.use('/api/users', AuthUserRoute);
app.use('/api', productRoute);
app.use('/api', cartRouter);
app.use('/api/checkout', checkoutRoute);
app.use('/api/orders', order);
app.use('/api/webhooks', webhookRoute);
app.use('/api', cake);
//app.use('/api/3d-models', modelsRoutes);

/*app.use('/protected',aunthenticateToken, (req, res) => {
    res.send("Protected Route");
    }
);*/

// Schedule best seller update - run daily at midnight
cron.schedule('0 0 * * *', async () => {
  await updateBestSellerRankings();
});

// Reset weekly sales counter every Monday at 00:01
cron.schedule('1 0 * * 1', async () => {
  try {
    await Product.updateMany({}, { 'salesData.lastWeekSold': 0 });
    console.log('Weekly sales counters reset');
  } catch (err) {
    console.error('Error resetting weekly sales:', err);
  }
});

// Reset monthly sales counter on the 1st of each month at 00:01
cron.schedule('1 0 1 * *', async () => {
  try {
    await Product.updateMany({}, { 'salesData.lastMonthSold': 0 });
    console.log('Monthly sales counters reset');
  } catch (err) {
    console.error('Error resetting monthly sales:', err);
  }
});

// Also run once at server startup
updateBestSellerRankings().catch(err => {
  console.error('Error in initial best seller update:', err);
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});

app.get('/', (req, res) => {
    res.send("API Working");
});