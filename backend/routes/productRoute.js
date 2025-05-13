const express = require('express');
const productRoute = express.Router();
const { addProduct, updateProduct, findProduct, allFindProduct, deleteProduct, uploadImage, updateProductStatus } = require("../controllers/AddProduct");

productRoute.post("/addProduct", addProduct);
productRoute.put("/updateProduct/:id", updateProduct);
productRoute.get("/findProduct/:id", findProduct);
productRoute.get("/allProducts", allFindProduct)
productRoute.put("/deleteProduct/:id", deleteProduct);
productRoute.post('/upload-image', uploadImage)
productRoute.put('/updateProductStatus/:id', updateProductStatus);
module.exports = productRoute;
