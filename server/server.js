const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const apiRoutes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rutas API
app.use('/api', apiRoutes);

// Servir frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// Fallback SPA
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint API no encontrado' });
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('====================================================');
    console.log(`🧊 NeveraHub Servidor Familiar ACTIVO en puerto ${PORT}`);
    console.log(`📱 En la tablet / local: http://localhost:${PORT}`);
    const ips = getLocalIpAddresses();
    if (ips.length > 0) {
      console.log('🌐 Acceso desde el móvil de los padres en la misma WiFi:');
      ips.forEach(ip => console.log(`   👉 http://${ip}:${PORT}`));
    }
    console.log('====================================================');
  });
}

module.exports = app;
