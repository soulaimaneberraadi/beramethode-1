const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf8');

// Replace standard GETs
content = content.replace(/fetch\('\/api\/planning'\)/g, "fetch('/api/planning', { credentials: 'include' })");
content = content.replace(/fetch\('\/api\/suivi'\)/g, "fetch('/api/suivi', { credentials: 'include' })");
content = content.replace(/fetch\('\/api\/demandes-appro'\)/g, "fetch('/api/demandes-appro', { credentials: 'include' })");
content = content.replace(/fetch\('\/api\/poste-suivi'\)/g, "fetch('/api/poste-suivi', { credentials: 'include' })");
content = content.replace(/fetch\('\/api\/models'\)/g, "fetch('/api/models', { credentials: 'include' })");

// Replace POSTs
content = content.replace(/fetch\('\/api\/planning', \{/g, "fetch('/api/planning', { credentials: 'include',");
content = content.replace(/fetch\('\/api\/suivi', \{/g, "fetch('/api/suivi', { credentials: 'include',");
content = content.replace(/fetch\('\/api\/demandes-appro', \{/g, "fetch('/api/demandes-appro', { credentials: 'include',");
content = content.replace(/fetch\('\/api\/poste-suivi', \{/g, "fetch('/api/poste-suivi', { credentials: 'include',");
content = content.replace(/fetch\('\/api\/models', \{/g, "fetch('/api/models', { credentials: 'include',");

// The DELETE
content = content.replace(/fetch\(`\/api\/models\/\${id}`, \{ method: 'DELETE' \}\)/g, "fetch(`/api/models/${id}`, { method: 'DELETE', credentials: 'include' })");

fs.writeFileSync('App.tsx', content);
console.log('App.tsx fetch queries patched.');
