// 3_loguear_usuario.js
// Simula un inicio de sesión biométrico: login con contraseña + step-up biométrico

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const LOGIN_URL = `${BACKEND_URL}/auth/login`;
const STEPUP_URL = `${BACKEND_URL}/auth/step-up`;

function generateSignaturePoints(points = 120) {
  const sig = [];
  let t = 0;
  for (let i = 0; i < points; i++) {
    t += Math.floor(Math.random() * 40) + 20; // delta time
    sig.push({
      x: 200 + Math.sin(i / 6) * 40 + Math.random() * 4,
      y: 120 + Math.cos(i / 6) * 20 + Math.random() * 4,
      t: t,
      p: Math.max(0.05, Math.random())
    });
  }
  return sig;
}

async function main(){
  try{
    const email = process.argv[2] || 'demo.biometric@acme.test';
    const password = process.argv[3] || 'Password123!';

    console.log('==> Realizando login con contraseña...');
    const loginRes = await axios.post(LOGIN_URL, { email, password });
    console.log('Login respuesta:', loginRes.data || loginRes.status);
    const token = loginRes.data?.token || loginRes.data?.accessToken || null;
    if(!token){
      console.warn('No se obtuvo token de login. Intentando continuar sin token.');
    }

    console.log('==> Generando firma orgánica para step-up...');
    const signature = generateSignaturePoints(150);

    console.log('==> Enviando step-up biométrico al backend...');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const stepRes = await axios.post(STEPUP_URL, { email, signature }, { headers });
    console.log('Step-up respuesta:', stepRes.data || stepRes.status);

  }catch(err){
    console.error('Error en logueo/step-up:', err?.response?.data || err.message);
  }
}

main();
