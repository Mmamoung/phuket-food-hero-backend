const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    role: { // กำหนดบทบาท: 'school' หรือ 'farmer'
        type: String,
        required: true,
        enum: ['school', 'farmer']
    },
    // School specific fields (required if role is 'school')
    instituteName: {
        type: String,
        required: function() { return this.role === 'school'; }
    },
    address: {
        type: String,
        required: function() { return this.role === 'school'; }
    },
    contactNumber: {
        type: String,
        required: function() { return this.role === 'school' || this.role === 'farmer'; } // Contact number for both
    },
    // Farmer specific fields (required if role is 'farmer')
    name: {
        type: String,
        required: function() { return this.role === 'farmer'; }
    },
    purpose: { // ความต้องการหลัก (เลี้ยงสัตว์, หมักปุ๋ย, อื่นๆ)
        type: String,
        required: function() { return this.role === 'farmer'; }
    },
    otherPurpose: { // รายละเอียดอื่นๆ (ถ้าเลือก "อื่นๆ")
        type: String,
        required: false // Not always required
    },
    date: {
        type: Date,
        default: Date.now
    }
});

// เข้ารหัสรหัสผ่านก่อนบันทึกลง database
UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) {
        next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Method สำหรับเปรียบเทียบรหัสผ่าน
UserSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
