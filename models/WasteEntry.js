const mongoose = require('mongoose');

const WasteEntrySchema = new mongoose.Schema({
    school: { // อ้างอิงถึง User ID ของโรงเรียนที่โพสต์
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // อ้างอิงถึง User Model
        required: true
    },
    menu: {
        type: String,
        required: true
    },
    weight: { // น้ำหนัก
        type: Number,
        required: true
    },
    date: { // วันที่
        type: Date,
        required: true
    },
    imageUrl: { // URL ของรูปภาพที่อัปโหลดไป Cloudinary
        type: String,
        required: false // อาจจะไม่บังคับให้อัปโหลดรูปเสมอไป
    },
    postedAt: { // วันที่/เวลาที่โพสต์
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('WasteEntry', WasteEntrySchema);