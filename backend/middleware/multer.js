const multer = require("multer");

const storage = multer.diskStorage({
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage }).fields([{ name: "Image", maxCount: 4 }]); // Change 'image' to 'Image'
module.exports = upload;