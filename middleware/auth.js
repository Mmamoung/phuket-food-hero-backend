const jwt = require('jsonwebtoken');
const User = require('../models/User'); // ต้อง Import User Model

const protect = async (req, res, next) => {
    let token;

    // ตรวจสอบว่ามี token ใน header (Bearer token)
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // ดึง token ออกมา
            token = req.headers.authorization.split(' ')[1];

            // ตรวจสอบ token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // ค้นหา user จาก ID ที่ถอดรหัสได้
            req.user = await User.findById(decoded.id).select('-password'); // ไม่เอา password กลับมา
            if (!req.user) {
                return res.status(401).json({ msg: 'ไม่ได้รับอนุญาต, User ไม่พบ' });
            }

            next(); // ไปยัง middleware/route ถัดไป

        } catch (error) {
            console.error(error);
            res.status(401).json({ msg: 'ไม่ได้รับอนุญาต, Token ไม่ถูกต้อง' });
        }
    }

    if (!token) {
        res.status(401).json({ msg: 'ไม่ได้รับอนุญาต, ไม่มี Token' });
    }
};

// Middleware สำหรับตรวจสอบบทบาท
const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ msg: `User role ${req.user.role} ไม่ได้รับอนุญาตให้เข้าถึง` });
        }
        next();
    };
};

module.exports = { protect, authorizeRoles };