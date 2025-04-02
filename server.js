const express = require('express');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');
const aunthenticateToken = require('./middleware/tokens.js');
const AuthUserRoute = require('./Routes/AuthUserRoute.js');
const Otp = require('./middleware/Otp.js');
require('dotenv').config({ path: './access.env' });

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'my-react-app', 'build')));

app.use('/', AuthUserRoute);

app.use('/smtp', Otp);

/*app.use('/protected',aunthenticateToken, (req, res) => {
    res.send("Protected Route");
    }
);*/

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});

app.get('/', (req, res) => {
    res.send("API Working");
});