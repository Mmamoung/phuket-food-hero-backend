const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');

const router = express.Router();

// @route   POST /api/auth/register
// @desc    Register a new user (school or farmer)
// @access  Public
router.post('/register', async (req, res) => {
    const { email, password, role, instituteName, address, contactNumber, name, purpose, otherPurpose } = req.body;

    try {
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ msg: 'User นี้ลงทะเบียนแล้ว' });
        }

        user = new User({
            email,
            password,
            role,
            // ข้อมูลเฉพาะบทบาท
            instituteName: role === 'school' ? instituteName : undefined,
            address: role === 'school' ? address : undefined,
            contactNumber: (role === 'school' || role === 'farmer') ? contactNumber : undefined,
            name: role === 'farmer' ? name : undefined,
            purpose: role === 'farmer' ? purpose : undefined,
            otherPurpose: role === 'farmer' ? otherPurpose : undefined
        });

        await user.save();

        // ส่ง token กลับไปทันทีที่ลงทะเบียนสำเร็จ (สามารถแยกเป็น Login หลังจาก Register ได้)
        res.status(201).json({
            _id: user._id,
            email: user.email,
            role: user.role,
            token: generateToken(user._id)
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(400).json({ msg: 'ข้อมูลผู้ใช้ไม่ถูกต้อง' });
        }

        // ตรวจสอบรหัสผ่าน
        const isMatch = await user.matchPassword(password);

        if (!isMatch) {
            return res.status(400).json({ msg: 'ข้อมูลผู้ใช้ไม่ถูกต้อง' });
        }

        // Login สำเร็จ ออก JWT
        res.json({
            _id: user._id,
            email: user.email,
            role: user.role,
            token: generateToken(user._id)
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;