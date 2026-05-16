import fs from 'fs';
import http from 'http';

http.get('http://localhost:7000/components/LaCoupe.tsx', (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        const lines = data.split('\n');
        console.log("LINE 20:", lines[19]);
        console.log("AROUND:");
        for (let i = 15; i < 25; i++) {
            if (lines[i]) console.log(`${i + 1}: ${lines[i]}`);
        }
    });
}).on("error", (err) => {
    console.log("Error: " + err.message);
});
