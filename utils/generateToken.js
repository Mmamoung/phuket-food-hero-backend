const jwt = require('jsonwebtoken');

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '1h', // Token จะหมดอายุใน 1 ชั่วโมง
    });
};

module.exports = generateToken;