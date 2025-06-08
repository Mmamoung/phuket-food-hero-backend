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
    },
    // NEW: Fields for tracking delivery status
    isReceived: { // True if a farmer has clicked 'Receive Waste'
        type: Boolean,
        default: false
    },
    receivedBy: { // Farmer User ID who clicked 'Receive Waste'
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: function() { return this.isReceived === true; }
    },
    receivedAt: { // Timestamp when farmer clicked 'Receive Waste'
        type: Date,
        required: function() { return this.isReceived === true; }
    },
    isDelivered: { // True if school has confirmed delivery via QR scan
        type: Boolean,
        default: false
    },
    deliveredAt: { // Timestamp when delivery was confirmed
        type: Date,
        required: function() { return this.isDelivered === true; }
    }
});

module.exports = mongoose.model('WasteEntry', WasteEntrySchema);
