const crypto = require('crypto');

function generateValidKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const getRandomSegment = () => {
        let seg = '';
        for (let i = 0; i < 4; i++) {
            seg += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return seg;
    };

    const p1 = getRandomSegment();
    const p2 = getRandomSegment();
    const p3 = getRandomSegment();

    // The signature algorithm matching LicenseScreen
    const hash = crypto.createHash('sha256')
        .update(p1 + p2 + p3 + "BERAMETHODE_SECRET_V1")
        .digest('hex');

    const p4 = hash.substring(0, 4).toUpperCase();

    return `${p1}-${p2}-${p3}-${p4}`;
}

const key = generateValidKey();
console.log("\n========================================");
console.log(" 🔑 BERAMETHODE V1 - OFFLINE KEYGEN");
console.log("========================================");
console.log(" -> NEW LICENSE KEY: " + key);
console.log("========================================\n");
