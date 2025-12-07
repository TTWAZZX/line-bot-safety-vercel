// File: pages/api/webhook.ts

import { Client, WebhookRequestBody, Message } from '@line/bot-sdk';
import * as admin from 'firebase-admin';

// *** 1. การเชื่อมต่อ Firebase Admin SDK (ใช้ Environment Variables บน Vercel) ***
if (!admin.apps.length) {
    // โหลด Credential จาก Vercel Environment Variables
    admin.initializeApp({
        // ค่าเหล่านี้จะถูกดึงมาจาก Vercel Env Vars ในขั้นตอนที่ 5.4
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        })
    });
}
const db = admin.firestore();

// *** 2. การกำหนดค่า Line Client (ใช้ Environment Variables บน Vercel) ***
const lineConfig = {
    channelAccessToken: process.env.LINE_ACCESS_TOKEN!,
    channelSecret: process.env.LINE_CHANNEL_SECRET!,
};
const lineClient = new Client(lineConfig);


// *** 3. Webhook Handler หลัก: แทนที่ Logic ของ doPost(e) ใน GAS ***
export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).end(); 
    }

    // Next.js config เพื่อให้ Line Signature validation ทำงานได้
    const signature = req.headers['x-line-signature'] as string;
    // ... (ใน Production ควร implement การตรวจสอบ signature ตรงนี้) ...

    const events = req.body.events as WebhookRequestBody['events'];
    
    try {
        await Promise.all(events.map(async (event) => {
            if (event.type === 'message' && event.message.type === 'text') {
                const userId = event.source.userId;
                const messageText = event.message.text.trim();
                let replyMessage: Message;

                // A. ดึงข้อมูล UserMap: ตรวจสอบการผูกบัญชี
                const userMapDoc = await db.collection('userMap').doc(userId).get();
                const userMapData = userMapDoc.data();
                const empId = userMapData ? userMapData.lastEmpId : null; 

                if (empId) {
                    // B. ดึงข้อมูลพนักงาน (Master Data)
                    const employeeDoc = await db.collection('employees').doc(empId).get();
                    const employeeData = employeeDoc.data();
                    
                    if (employeeData) {
                        // C. Logic การทำงานหลัก (จำลองจาก GAS Logic)
                        const lowerCaseMsg = messageText.toLowerCase();

                        if (lowerCaseMsg.includes("ข้อมูล") || lowerCaseMsg.includes("โปรไฟล์")) {
                            // จำลองการดึงข้อมูลจาก 'ชีต1'
                            const profileText = `[Employee Profile]\nชื่อ: ${employeeData.name}\nรหัส: ${employeeData.empId}\nฝ่าย: ${employeeData.department}\nStatus: ${employeeData.status}\n\nSafety Record: ${employeeData.safetyPatrolRecord}`;
                            replyMessage = { type: 'text', text: profileText };
                        
                        } else if (lowerCaseMsg.includes("รูปภาพ") || lowerCaseMsg.includes("ดูรูป")) {
                            // จำลองการตอบกลับด้วยรูปภาพ (ต้องใช้ Image Message)
                            const imageUrl = employeeData.photoUrl || 'https://placehold.co/1200x780'; // IMG_FALLBACK จาก GAS
                            replyMessage = {
                                type: 'image',
                                originalContentUrl: imageUrl,
                                previewImageUrl: imageUrl,
                            };
                        } 
                        // ** [สำคัญ]: ตรงนี้คือ Logic การลงทะเบียน/การแก้ไขข้อมูล ที่ต้องแปลงจาก GAS มาใช้ Firebase **
                        // โค้ด GAS เดิม: if (empId.length >= 4 && empId.length <= 8) { // Logic การผูกบัญชี }
                        else if (!isNaN(parseInt(messageText)) && messageText.length > 3 && messageText.length < 9) {
                            // ผู้ใช้ส่งตัวเลขรหัสพนักงานใหม่มา
                            await db.collection('userMap').doc(userId).set({
                                lastEmpId: messageText,
                                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                                // ... update fields อื่นๆ ...
                            }, { merge: true });
                            replyMessage = { type: 'text', text: `ผูกบัญชีสำเร็จ! รหัสพนักงาน ${messageText} ถูกบันทึกแล้ว` };
                        }
                        else {
                            // D. บันทึกข้อความ (จาก EditRequests)
                            await db.collection('messages').add({
                                ts: admin.firestore.FieldValue.serverTimestamp(),
                                userId: userId,
                                empId: empId,
                                message: messageText,
                                source: 'LINE_VERCEL'
                            });
                            replyMessage = { type: 'text', text: `ได้รับคำขอแก้ไขข้อมูลของคุณแล้ว (บันทึกใน Firebase)` };
                        }
                    } else {
                        replyMessage = { type: 'text', text: "ไม่พบข้อมูลพนักงานที่ผูกกับรหัสของคุณในระบบหลัก" };
                    }
                } else {
                    // E. Logic การผูกบัญชี (เมื่อยังไม่มี userId ใน userMap)
                    if (!isNaN(parseInt(messageText)) && messageText.length > 3 && messageText.length < 9) {
                        // ผู้ใช้ส่งรหัสพนักงานมาเพื่อผูกบัญชี
                         await db.collection('userMap').doc(userId).set({
                            lastEmpId: messageText,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                            // ... fields อื่นๆ ...
                        }, { merge: true });
                        replyMessage = { type: 'text', text: `ผูกบัญชีสำเร็จ! รหัสพนักงาน ${messageText} ถูกบันทึกแล้ว` };
                    } else {
                        replyMessage = { type: 'text', text: "บัญชียังไม่ได้ผูกกับรหัสพนักงาน กรุณาส่งรหัสพนักงาน (ตัวเลข 4-8 หลัก) เพื่อเริ่มต้น" };
                    }
                }

                // 5. ตอบกลับ LINE
                await lineClient.replyMessage(event.replyToken, replyMessage);
            }
        }));

        res.status(200).json({ status: 'ok' });
    } catch (err) {
        console.error("Webhook Error:", err);
        res.status(500).end();
    }
}


// *** 4. Next.js Config: ป้องกันการ Parse Body อัตโนมัติ (จำเป็นสำหรับการตรวจสอบ Line Signature) ***
export const config = {
    api: {
        bodyParser: false, // ปิดการ Parse
    },
};