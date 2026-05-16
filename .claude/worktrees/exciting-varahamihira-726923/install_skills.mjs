import fs from 'fs';
import path from 'path';
import https from 'https';

const skillsUrl = 'https://api.github.com/repos/mounra/ai-marketing/contents/skills';
const targetDir = path.join(process.cwd(), '.agent', 'skills');

console.log('🔄 Fetching skills list from GitHub...');

https.get(skillsUrl, { headers: { 'User-Agent': 'Node.js' } }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const skills = JSON.parse(data);
        if (!Array.isArray(skills)) {
            console.error('❌ Failed to fetch skills list.');
            return;
        }

        console.log(`✅ Found ${skills.length} skills. Installing into .agent/skills/...`);

        skills.forEach(skill => {
            if (skill.type === 'dir') {
                const skillDir = path.join(targetDir, skill.name);
                fs.mkdirSync(skillDir, { recursive: true });
                
                const skillFileUrl = `https://raw.githubusercontent.com/mounra/ai-marketing/main/skills/${skill.name}/SKILL.md`;
                
                https.get(skillFileUrl, { headers: { 'User-Agent': 'Node.js' } }, (res2) => {
                    let fileData = '';
                    res2.on('data', chunk => fileData += chunk);
                    res2.on('end', () => {
                        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), fileData);
                        console.log(`✅ Installed: ${skill.name}`);
                    });
                }).on('error', err => console.error(`❌ Error downloading ${skill.name}: ${err.message}`));
            }
        });
    });
}).on('error', err => console.error(`❌ Error fetching skills list: ${err.message}`));
