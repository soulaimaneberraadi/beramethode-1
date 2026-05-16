fetch('/api/dashboard')
  .then(res => res.json())
  .then(data => {
    document.getElementById('c1').textContent = data.enCours ?? 0;
    document.getElementById('c2').textContent = data.active ?? 0;
    document.getElementById('c3').textContent = data.stock ?? '0';
    document.getElementById('c4').textContent = data.advances ?? 0;
    document.getElementById('c5').textContent = data.models ?? 0;
    document.getElementById('c6').textContent = data.present ?? 0;
  })
  .catch(err => console.error('Dashboard data error', err));
