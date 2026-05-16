const express = require('express');
const app = express();
const port = process.env.PORT || 8000;

// Serve static frontend
app.use(express.static('public'));

// Simple dashboard data API
app.get('/api/dashboard', (req, res) => {
  res.json({
    title: 'Tableau de Bord',
    enCours: 0,
    active: 100,
    stock: '666.4k',
    advances: '4.5k',
    models: 0,
    present: 0
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
