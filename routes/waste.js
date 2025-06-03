const express = require('express');
const { protect, authorizeRoles } = require('../middleware/auth');
const WasteEntry = require('../models/WasteEntry');
const User = require('../models/User');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');

const router = express.Router();

// ตั้งค่า Cloudinary (จาก .env)
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// ตั้งค่า Multer สำหรับเก็บไฟล์ใน memory (ไม่เก็บลง disk โดยตรง)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// @route   POST /api/waste/add
// @desc    Add a new waste entry (by school)
// @access  Private (School only)
router.post('/add', protect, authorizeRoles('school'), upload.single('wasteImage'), async (req, res) => {
    const { menu, weight, date } = req.body;
    let imageUrl = null;

    try {
        // ถ้ามีไฟล์รูปภาพที่อัปโหลดมา
        if (req.file) {
            const b64 = Buffer.from(req.file.buffer).toString("base64");
            let dataURI = "data:" + req.file.mimetype + ";base64," + b64;
            const result = await cloudinary.uploader.upload(dataURI, {
                folder: 'phuket_food_hero_waste_images' // โฟลเดอร์ใน Cloudinary
            });
            imageUrl = result.secure_url; // ได้ URL ของรูปภาพ
        }

        const newWasteEntry = new WasteEntry({
            school: req.user.id, // ID ของโรงเรียนจาก req.user ที่ได้จาก protect middleware
            menu,
            weight,
            date,
            imageUrl
        });

        await newWasteEntry.save();
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
    console.log('*** DELETE Request Received ***'); // เพิ่ม log
    console.log('Requested ID for deletion:', req.params.id); // เพิ่ม log

    try {
        const wasteEntry = await WasteEntry.findById(req.params.id);

        if (!wasteEntry) {
            console.log('WasteEntry not found for ID:', req.params.id); // เพิ่ม log
            return res.status(404).json({ msg: 'ไม่พบข้อมูลเศษอาหารที่จะลบ' }); // ทำให้ข้อความชัดเจนขึ้น
        }

        console.log('WasteEntry found:', wasteEntry._id); // เพิ่ม log
        console.log('WasteEntry owner:', wasteEntry.school.toString(), 'Current user:', req.user.id); // เพิ่ม log เพื่อ debug สิทธิ์

        // ตรวจสอบว่าเป็นข้อมูลของโรงเรียนที่ Login อยู่หรือไม่
        if (wasteEntry.school.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'ไม่ได้รับอนุญาตให้ลบข้อมูลนี้' });
        }

        // ลบรูปภาพจาก Cloudinary ถ้ามี
        if (wasteEntry.imageUrl) {
            try {
                const publicId = wasteEntry.imageUrl.split('/').pop().split('.')[0]; // Extract public ID
                // Cloudinary Public ID มักจะรวมถึง folder path ด้วยถ้าตั้งไว้
                const folderPath = 'phuket_food_hero_waste_images/'; // ต้องระบุ folder path ที่ใช้ตอน upload ด้วย
                await cloudinary.uploader.destroy(`${folderPath}${publicId}`);
                console.log(`Cloudinary image ${publicId} deleted.`);
            } catch (cloudinaryErr) {
                console.error('Error deleting image from Cloudinary:', cloudinaryErr.message);
                // ไม่จำเป็นต้องให้ request ล้มเหลวทั้งหมด ถ้าลบรูปภาพไม่ได้
            }
        }

        await wasteEntry.deleteOne(); // ใช้ deleteOne()

        res.json({ msg: 'ลบข้อมูลเศษอาหารสำเร็จ' });

    } catch (err) {
        console.error('Error in DELETE route processing:', err.message);
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'ไม่พบข้อมูลเศษอาหาร (รูปแบบ ID ไม่ถูกต้อง)' }); // ทำให้ข้อความชัดเจนขึ้น
        }
        // ตรวจสอบว่า Error มาจาก Mongoose หรือไม่
        if (err.name === 'CastError' && err.path === '_id') {
             return res.status(404).json({ msg: 'ไม่พบข้อมูลเศษอาหาร (รูปแบบ ID ไม่ถูกต้อง)' });
        }
        res.status(500).json({ msg: 'Server Error ภายใน' }); // ทำให้เป็น JSON เสมอเมื่อเกิด Error 500
    }
});


// @route   GET /api/waste/posts
// @desc    Get all waste entries for display (for farmers/schools dashboard)
// @access  Private (Authenticated users)
router.get('/posts', protect, async (req, res) => {
    try {
        // ดึงข้อมูลเศษอาหารทั้งหมด และ populate ข้อมูลโรงเรียน
        const wasteEntries = await WasteEntry.find()
            .populate('school', 'instituteName contactNumber email address') // ดึงข้อมูลโรงเรียนเฉพาะ field ที่ต้องการ
            .sort({ postedAt: -1 }); // เรียงจากล่าสุดไปเก่าสุด

        res.json(wasteEntries);

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
            .populate('school', 'instituteName contactNumber email address'); // ดึงข้อมูลโรงเรียน

        if (!wasteEntry) {
            return res.status(404).json({ msg: 'ไม่พบข้อมูลเศษอาหาร' });
        }

        res.json(wasteEntry);

    } catch (err) {
        console.error(err.message);
        // ถ้า ID ที่ส่งมาไม่ถูกต้อง (format ไม่ตรง)
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
        const schoolId = req.user.id; // ID โรงเรียนจาก JWT

        const wasteEntries = await WasteEntry.find({ school: schoolId })
            .sort({ date: 1 }) // เรียงตามวันที่
            .limit(7); // ดึงข้อมูล 7 วันล่าสุด (หรือตามที่คุณต้องการ)

        // Logic การวิเคราะห์ (ตัวอย่างง่ายๆ: หาเมนูที่เหลือเยอะสุด)
        const analysis = {};
        wasteEntries.forEach(entry => {
            if (analysis[entry.menu]) {
                analysis[entry.menu] += entry.weight;
            } else {
                analysis[entry.menu] = entry.weight;
            }
        });

        // แปลงเป็น Array เพื่อให้ง่ายต่อการใช้ในกราฟ
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
    const { weightMin, weightMax, menu, date, schoolName } = req.query; // รับ query parameters

    const query = {};

    // กรองตามน้ำหนัก
    if (weightMin || weightMax) {
        query.weight = {};
        if (weightMin) query.weight.$gte = parseFloat(weightMin);
        if (weightMax) query.weight.$lte = parseFloat(weightMax);
    }

    // กรองตามเมนู
    if (menu) {
        query.menu = new RegExp(menu, 'i'); // 'i' for case-insensitive
    }

    // กรองตามวันที่ (ถ้าต้องการช่วงวันที่ ต้องส่ง start/end date มา)
    if (date) {
        const selectedDate = new Date(date);
        const nextDay = new Date(selectedDate);
        nextDay.setDate(selectedDate.getDate() + 1); // ครอบคลุมทั้งวัน
        query.date = { $gte: selectedDate, $lt: nextDay };
    }

    try {
        let wasteEntries = await WasteEntry.find(query)
            .populate('school', 'instituteName contactNumber email address')
            .sort({ postedAt: -1 });

        // กรองตามชื่อโรงเรียน (ต้องกรองหลังจาก populate)
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
