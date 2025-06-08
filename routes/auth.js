const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const { protect } = require('../middleware/auth'); // Import protect middleware

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
            instituteName: role === 'school' ? instituteName : undefined,
            address: role === 'school' ? address : undefined,
            contactNumber: (role === 'school' || role === 'farmer') ? contactNumber : undefined,
            name: role === 'farmer' ? name : undefined,
            purpose: role === 'farmer' ? purpose : undefined,
            otherPurpose: role === 'farmer' ? otherPurpose : undefined,
            wastePostsCount: 0, // Initialize
            wasteReceivedCount: 0, // Initialize
            stars: 0 // Initialize
        });

        await user.save();

        res.status(201).json({
            _id: user._id,
            email: user.email,
            role: user.role,
            stars: user.stars, // Include stars in response
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

        const isMatch = await user.matchPassword(password);

        if (!isMatch) {
            return res.status(400).json({ msg: 'ข้อมูลผู้ใช้ไม่ถูกต้อง' });
        }

        res.json({
            _id: user._id,
            email: user.email,
            role: user.role,
            stars: user.stars, // Include stars in response
            token: generateToken(user._id)
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/auth/profile/:id
// @desc    Get user profile by ID
// @access  Private
router.get('/profile/:id', protect, async (req, res) => {
    try {
        // Ensure the logged-in user is requesting their own profile
        if (req.user.id !== req.params.id) {
            return res.status(403).json({ msg: 'ไม่ได้รับอนุญาตให้เข้าถึงโปรไฟล์ผู้ใช้อื่น' });
        }

        const user = await User.findById(req.params.id).select('-password'); // Don't return password
        if (!user) {
            return res.status(404).json({ msg: 'ไม่พบผู้ใช้' });
        }
        res.json(user);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'ไม่พบผู้ใช้ (ID ไม่ถูกต้อง)' });
        }
        res.status(500).send('Server Error');
    }
});

module.exports = router;
