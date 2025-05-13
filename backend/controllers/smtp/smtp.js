require('dotenv').config()

const router = require('express').Router()
const path = require('path')
const nodemailer = require('nodemailer')


const transport = {
    host: process.env.SMTP_HOST,
    port: 587,
    secure: false, 
    auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD
    }
 };
 
const transporter = nodemailer.createTransport(transport)
transporter.verify((error, success) => {
if (error) {

console.error(error)
} else {

console.log('Ready to send mail!')
}
})