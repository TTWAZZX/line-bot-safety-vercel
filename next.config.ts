/** @type {import('next').NextConfig} */
const nextConfig = {
  // เพิ่มบรรทัดนี้เพื่อเปิดใช้งาน API Route Signature Validation
  // ดูเพิ่มเติม: https://nextjs.org/docs/api-routes/api-middlewares
  // async headers() {
  //   return [
  //     {
  //       source: '/api/webhook',
  //       headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }],
  //     },
  //   ];
  // },

  // *** ส่วนที่เพิ่มใหม่เพื่อแก้ปัญหา Env Vars ใน Build Time ***
  env: {
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
  },
  // *** สิ้นสุดส่วนที่เพิ่มใหม่ ***
};

module.exports = nextConfig;