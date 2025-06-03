require('dotenv').config(); // โหลดตัวแปร environment ก่อนใครเพื่อน
const express = require('express');
const connectDB = require('./config/db'); // Import ฟังก์ชันเชื่อมต่อ DB
const cors = require('cors'); // Import CORS

const app = express();

// เชื่อมต่อ Database
connectDB();

// Middleware
app.use(express.json({ limit: '10mb' })); // สำหรับ Parse JSON body, ตั้ง limit เผื่อรับข้อมูลใหญ่ๆ (เช่น base64 image data)
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // เพิ่มสำหรับ parse URL-encoded bodies และ FormData (บางส่วน)
app.use(cors()); // อนุญาต CORS สำหรับทุกโดเมน (ใน Production ควรจำกัด)

// Log ทุก Request ที่เข้ามา (เพื่อ Debug)
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Define Routes
app.use('/api/auth', require('./routes/auth')); // สำหรับ Login/Register
app.use('/api/waste', require('./routes/waste')); // สำหรับจัดการข้อมูลเศษอาหาร

// Basic Route เพื่อทดสอบ Server
app.get('/', (req, res) => res.send('API is running...'));

// เพิ่ม Error Handling Middleware สำหรับ 404 (ถ้าไม่มี Route ไหนตรง)
app.use((req, res, next) => {
    console.log(`404 Not Found: ${req.method} ${req.url}`); // Log 404
    res.status(404).json({ msg: `ไม่พบ Endpoint: ${req.method} ${req.url}` }); // ตอบกลับเป็น JSON
});

// เพิ่ม General Error Handling Middleware
app.use((err, req, res, next) => {
    console.error(err.stack); // Log stack trace ของ error
    res.status(500).json({ msg: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์', error: err.message }); // ตอบกลับเป็น JSON
});


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
