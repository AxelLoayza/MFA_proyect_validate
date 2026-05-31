// 2_registrar_usuario.js
// Simula registro orgánico + enrolamiento biométrico (envía 5 firmas de entrenamiento)

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const REGISTER_URL = `${BACKEND_URL}/users/register`;
const ENROLL_URL = `${BACKEND_URL}/auth/enroll`;

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
    console.log('==> Registrando usuario de prueba...');
    const email = `demo.biometric+${uuidv4().slice(0,6)}@acme.test`;
    const password = 'Password123!';

    const regRes = await axios.post(REGISTER_URL, { email, password });
    console.log('Registro OK:', regRes.data);

    console.log('==> Haciendo login temporal para enrolamiento (simulado)...');
    const loginRes = await axios.post(`${BACKEND_URL}/auth/login`, { email, password });
    const token = loginRes.data?.token || loginRes.data?.accessToken || null;
    if(!token){
      console.warn('No se obtuvo token de login. Continuando sin token (API puede requerirlo).');
    }

    console.log('==> Enviando 5 firmas para enrolamiento...');
    for(let i=0;i<5;i++){
      const payload = {
        email,
        signature: generateSignaturePoints(150)
      };
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const r = await axios.post(ENROLL_URL, payload, { headers });
      console.log(`Enrolamiento ${i+1}:`, r.data?.status || r.status);
      await new Promise(r=>setTimeout(r, 500));
    }

    console.log('Enrolamiento completado para', email);
  }catch(err){
    console.error('Error en registro/enrolamiento:', err?.response?.data || err.message);
  }
}

main();
