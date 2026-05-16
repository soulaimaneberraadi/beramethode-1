const puppeteer = require('puppeteer');

(async () => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        
        // Listen to console logs
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
        
        console.log("Navigating to http://127.0.0.1:9000...");
        await page.goto('http://127.0.0.1:9000', { waitUntil: 'networkidle0', timeout: 30000 });
        
        await page.screenshot({ path: 'screenshot.png' });
        console.log("Screenshot saved.");
        
        // Extract text from the page in case there is an error boundary showing
        const text = await page.evaluate(() => document.body.innerText);
        console.log("PAGE TEXT:", text);
        
        await browser.close();
    } catch (e) {
        console.error("Puppeteer script failed:", e);
        process.exit(1);
    }
})();
