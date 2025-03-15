require('dotenv').config()

// routes.js
const router = require('express').Router()
const path = require('path')
const nodemailer = require('nodemailer')


const transport = {
    host: process.env.SMTP_HOST,
    port: 587,
    secure: false, // use false for STARTTLS; true for SSL on port 465
    auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD
    }
 };

 
const transporter = nodemailer.createTransport(transport)
transporter.verify((error, success) => {
if (error) {
//if error happened code ends here
console.error(error)
} else {
//this means success
console.log('Ready to send mail!')
}
})