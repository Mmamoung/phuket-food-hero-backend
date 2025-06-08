const express = require('express');
const { protect, authorizeRoles } = require('../middleware/auth');
const WasteEntry = require('../models/WasteEntry');
const User = require('../models/User'); // Import User Model
const cloudinary = require('cloudinary').v2;
const multer = require('multer');

const router = express.Router();

// Configure Cloudinary (from .env)
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Multer for memory storage (no disk storage)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Helper function to calculate stars (1 star for every 10 actions)
const calculateStars = (count) => {
    return Math.floor(count / 10);
};

// @route   POST /api/waste/add
// @desc    Add a new waste entry (by school)
// @access  Private (School only)
router.post('/add', protect, authorizeRoles('school'), upload.single('wasteImage'), async (req, res) => {
    const { menu, weight, date } = req.body;
    let imageUrl = null;

    try {
        // If an image file is uploaded
        if (req.file) {
            const b64 = Buffer.from(req.file.buffer).toString("base64");
            let dataURI = "data:" + req.file.mimetype + ";base64," + b64;
            const result = await cloudinary.uploader.upload(dataURI, {
                folder: 'phuket_food_hero_waste_images' // Folder in Cloudinary
            });
            imageUrl = result.secure_url; // Get image URL
        }

        const newWasteEntry = new WasteEntry({
            school: req.user.id, // School ID from req.user (from protect middleware)
            menu,
            weight,
            date,
            imageUrl
        });

        await newWasteEntry.save();

        // NEW: Update school's wastePostsCount and stars
        const schoolUser = await User.findById(req.user.id);
        if (schoolUser) {
            schoolUser.wastePostsCount = (schoolUser.wastePostsCount || 0) + 1;
            schoolUser.stars = calculateStars(schoolUser.wastePostsCount);
            await schoolUser.save();
        }

        res.status(201).json({ msg: 'บันทึกข้อมูลเศษอาหารสำเร็จ', wasteEntry: newWasteEntry });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   DELETE /api/waste/:id
// @desc    Delete a waste entry (by school, only their own)
// @access  Private (School only)
router.delete('/:id', protect, authorizeRoles('school'), async (req, res) => {
    console.log('*** DELETE Request Received ***');
    console.log('Requested ID for deletion:', req.params.id);

    try {
        const wasteEntry = await WasteEntry.findById(req.params.id);

        if (!wasteEntry) {
            console.log('WasteEntry not found for ID:', req.params.id);
            return res.status(404).json({ msg: 'ไม่พบข้อมูลเศษอาหารที่จะลบ' });
        }

        console.log('WasteEntry found:', wasteEntry._id);
        console.log('WasteEntry owner:', wasteEntry.school.toString(), 'Current user:', req.user.id);

        // Check if the waste entry belongs to the logged-in school
        if (wasteEntry.school.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'ไม่ได้รับอนุญาตให้ลบข้อมูลนี้' });
        }

        // Delete image from Cloudinary if exists
        if (wasteEntry.imageUrl) {
            try {
                const publicId = wasteEntry.imageUrl.split('/').pop().split('.')[0];
                const folderPath = 'phuket_food_hero_waste_images/'; // Must specify the folder path used during upload
                await cloudinary.uploader.destroy(`${folderPath}${publicId}`);
                console.log(`Cloudinary image ${publicId} deleted.`);
            } catch (cloudinaryErr) {
                console.error('Error deleting image from Cloudinary:', cloudinaryErr.message);
                // Not strictly necessary to fail the entire request if image deletion fails
            }
        }

        await wasteEntry.deleteOne(); // Use deleteOne()

        // NEW: Decrement school's wastePostsCount and update stars
        const schoolUser = await User.findById(req.user.id);
        if (schoolUser) {
            schoolUser.wastePostsCount = Math.max(0, (schoolUser.wastePostsCount || 0) - 1); // Ensure not negative
            schoolUser.stars = calculateStars(schoolUser.wastePostsCount);
            await schoolUser.save();
        }

        res.json({ msg: 'ลบข้อมูลเศษอาหารสำเร็จ' });

    } catch (err) {
        console.error('Error in DELETE route processing:', err.message);
        if (err.kind === 'ObjectId' || (err.name === 'CastError' && err.path === '_id')) {
            return res.status(404).json({ msg: 'ไม่พบข้อมูลเศษอาหาร (รูปแบบ ID ไม่ถูกต้อง)' });
        }
        res.status(500).json({ msg: 'Server Error ภายใน' });
    }
});

// @route   POST /api/waste/receive/:id
// @desc    Farmer confirms receiving a waste entry
// @access  Private (Farmer only)
router.post('/receive/:id', protect, authorizeRoles('farmer'), async (req, res) => {
    try {
        const wasteEntry = await WasteEntry.findById(req.params.id);

        if (!wasteEntry) {
            return res.status(404).json({ msg: 'ไม่พบข้อมูลเศษอาหารที่จะรับ' });
        }
        if (wasteEntry.isReceived) {
            return res.status(400).json({ msg: 'เศษอาหารนี้ถูกรับไปแล้ว' });
        }

        // Mark the waste as 'received' by this farmer
        wasteEntry.isReceived = true;
        wasteEntry.receivedBy = req.user.id;
        wasteEntry.receivedAt = Date.now();
        await wasteEntry.save();

        // NEW: Update farmer's wasteReceivedCount and stars
        const farmerUser = await User.findById(req.user.id);
        if (farmerUser) {
            farmerUser.wasteReceivedCount = (farmerUser.wasteReceivedCount || 0) + 1;
            farmerUser.stars = calculateStars(farmerUser.wasteReceivedCount);
            await farmerUser.save();
        }

        res.json({ msg: 'ยืนยันการรับเศษอาหารสำเร็จ', wasteEntryId: wasteEntry._id, newStars: farmerUser.stars });

    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId' || (err.name === 'CastError' && err.path === '_id')) {
            return res.status(404).json({ msg: 'ไม่พบข้อมูลเศษอาหาร (รูปแบบ ID ไม่ถูกต้อง)' });
        }
        res.status(500).json({ msg: 'Server Error ภายใน' });
    }
});

// @route   POST /api/waste/confirm-delivery/:id
// @desc    School confirms delivery of a waste entry via QR scan
// @access  Private (School only)
router.post('/confirm-delivery/:id', protect, authorizeRoles('school'), async (req, res) => {
    try {
        const wasteEntry = await WasteEntry.findById(req.params.id);

        if (!wasteEntry) {
            return res.status(404).json({ msg: 'ไม่พบข้อมูลเศษอาหารที่จะยืนยัน' });
        }

        // Check if the school is the owner of this waste entry
        if (wasteEntry.school.toString() !== req.user.id) {
            return res.status(403).json({ msg: 'คุณไม่ได้รับอนุญาตให้ยืนยันการส่งมอบข้อมูลนี้' });
        }

        // Check if it's already delivered
        if (wasteEntry.isDelivered) {
            return res.status(400).json({ msg: 'เศษอาหารนี้ถูกส่งมอบไปแล้ว' });
        }
        // Check if it's even received by a farmer
        if (!wasteEntry.isReceived) {
            return res.status(400).json({ msg: 'เศษอาหารนี้ยังไม่ถูกเกษตรกรรับไป' });
        }

        // Mark as delivered
        wasteEntry.isDelivered = true;
        wasteEntry.deliveredAt = Date.now();
        await wasteEntry.save();

        res.json({ msg: 'ยืนยันการส่งมอบเศษอาหารสำเร็จ', wasteEntryId: wasteEntry._id });

    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId' || (err.name === 'CastError' && err.path === '_id')) {
            return res.status(404).json({ msg: 'ไม่พบข้อมูลเศษอาหาร (รูปแบบ ID ไม่ถูกต้อง)' });
        }
        res.status(500).json({ msg: 'Server Error ภายใน' });
    }
});


// @route   GET /api/waste/posts
// @desc    Get all waste entries for display (for farmers/schools dashboard)
// @access  Private (Authenticated users)
router.get('/posts', protect, async (req, res) => {
    try {
        const wasteEntries = await WasteEntry.find({ isDelivered: false }) // Only show not yet delivered items
            .populate('school', 'instituteName contactNumber email address')
            .sort({ postedAt: -1 });

        res.json(wasteEntries);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/waste/pending-delivery
// @desc    Get waste entries pending delivery for a specific school
// @access  Private (School only)
router.get('/pending-delivery', protect, authorizeRoles('school'), async (req, res) => {
    try {
        const schoolId = req.user.id;
        const pendingEntries = await WasteEntry.find({
            school: schoolId,
            isReceived: true, // Has been 'received' by a farmer
            isDelivered: false // But not yet 'delivered' by school
        })
        .populate('receivedBy', 'name contactNumber email') // Populate farmer details
        .sort({ receivedAt: -1 });

        res.json(pendingEntries);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/waste/received-history
// @desc    Get farmer's received waste history
// @access  Private (Farmer only)
router.get('/received-history', protect, authorizeRoles('farmer'), async (req, res) => {
    try {
        const farmerId = req.user.id;
        const receivedEntries = await WasteEntry.find({
            receivedBy: farmerId,
            isReceived: true // Items this farmer received
        })
        .populate('school', 'instituteName contactNumber email address')
        .sort({ receivedAt: -1 });

        res.json(receivedEntries);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


// @route   GET /api/waste/posts/:id
// @desc    Get single waste entry by ID (for details page)
// @access  Private (Authenticated users)
router.get('/posts/:id', protect, async (req, res) => {
    try {
        const wasteEntry = await WasteEntry.findById(req.params.id)
            .populate('school', 'instituteName contactNumber email address')
            .populate('receivedBy', 'name contactNumber email'); // Also populate farmer info if exists

        if (!wasteEntry) {
            return res.status(404).json({ msg: 'ไม่พบข้อมูลเศษอาหาร' });
        }

        res.json(wasteEntry);

    } catch (err) {
        console.error(err.message);
        // If ID format is invalid
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'ไม่พบข้อมูลเศษอาหาร' });
        }
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/waste/analyze
// @desc    Analyze waste data for a specific school
// @access  Private (School only)
router.get('/analyze', protect, authorizeRoles('school'), async (req, res) => {
    try {
        const schoolId = req.user.id; // School ID from JWT

        const wasteEntries = await WasteEntry.find({ school: schoolId })
            .sort({ date: 1 }) // Sort by date
            .limit(7); // Get last 7 days of data (or as needed)

        // Analysis logic (simple example: find total weight per menu)
        const analysis = {};
        wasteEntries.forEach(entry => {
            if (analysis[entry.menu]) {
                analysis[entry.menu] += entry.weight;
            } else {
                analysis[entry.menu] = entry.weight;
            }
        });

        // Convert to array for Chart.js
        const chartData = Object.keys(analysis).map(menu => ({
            menu: menu,
            totalWeight: analysis[menu]
        }));

        res.json({ analysis: chartData, rawData: wasteEntries });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/waste/filter
// @desc    Filter waste entries (for farmer)
// @access  Private (Farmer only)
router.get('/filter', protect, authorizeRoles('farmer'), async (req, res) => {
    const { weightMin, weightMax, menu, date, schoolName } = req.query; // Get query parameters

    const query = {
        isDelivered: false // Farmers only see items not yet delivered
    };

    // Filter by weight
    if (weightMin || weightMax) {
        query.weight = {};
        if (weightMin) query.weight.$gte = parseFloat(weightMin);
        if (weightMax) query.weight.$lte = parseFloat(weightMax);
    }

    // Filter by menu
    if (menu) {
        query.menu = new RegExp(menu, 'i'); // 'i' for case-insensitive
    }

    // Filter by date (if date range is needed, send start/end date)
    if (date) {
        const selectedDate = new Date(date);
        const nextDay = new Date(selectedDate);
        nextDay.setDate(selectedDate.getDate() + 1); // Covers the entire day
        query.date = { $gte: selectedDate, $lt: nextDay };
    }

    try {
        let wasteEntries = await WasteEntry.find(query)
            .populate('school', 'instituteName contactNumber email address')
            .sort({ postedAt: -1 });

        // Filter by school name (must filter after populate)
        if (schoolName) {
            wasteEntries = wasteEntries.filter(entry =>
                entry.school && entry.school.instituteName && entry.school.instituteName.toLowerCase().includes(schoolName.toLowerCase())
            );
        }

        res.json(wasteEntries);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


module.exports = router;
