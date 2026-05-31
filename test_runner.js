const { spawn } = require('child_process');
const path = require('path');

// Configuraciones de puertos y rutas
const SERVICES = [
    {
        name: 'Backend Node',
        port: 4000,
        url: 'http://localhost:4000/api/health', // Asumiendo que existe un health check, si no, se asume que inicia
        cwd: path.join(__dirname, 'client', 'backend'),
        command: 'npm',
        args: ['run', 'dev'] // O 'start', dependiendo del package.json
    },
    {
        name: 'Cloud Service ML (FastAPI)',
        port: 4003,
        url: 'http://localhost:4003/health',
        cwd: path.join(__dirname, 'cloud_service', 'private', 'src'),
        command: 'uvicorn',
        args: ['app.main:app', '--host', '0.0.0.0', '--port', '4003', '--reload']
    }
];

const children = [];

function startService(service) {
    console.log(`[🚀 Iniciando] ${service.name} en el puerto ${service.port}...`);
    
    // Iniciar child process
    const child = spawn(service.command, service.args, { 
        cwd: service.cwd,
        shell: true 
    });

    child.stdout.on('data', (data) => {
        // Reducimos el ruido, solo mostramos si es un error o lo dejamos silenciado.
        // Comentar si queremos ver los logs de los servidores
        // console.log(`[${service.name}] ${data.toString().trim()}`); 
    });

    child.stderr.on('data', (data) => {
        // console.error(`[${service.name} ERROR] ${data.toString().trim()}`);
    });

    children.push(child);
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForServices() {
    console.log('\n[⏳] Esperando que los servicios levanten (max 15 segundos)...');
    
    // Simplemente le damos tiempo a FastAPI y Node para que arranquen (8 segundos suele ser suficiente)
    await sleep(8000); 
    console.log('[✅] Tiempo de espera concluido, asumiendo servicios activos.\n');
}

// Para limpiar procesos al salir
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

function cleanup() {
    console.log('\n[🛑] Deteniendo servicios y cerrando...');
    children.forEach(child => child.kill());
    process.exit(0);
}

// Ejecución
async function main() {
    console.log("==========================================");
    console.log("🔥 INICIANDO ENTORNO MÚLTIPLE MFA");
    console.log("==========================================");

    // Arrancar cada servicio
    for (const service of SERVICES) {
        startService(service);
    }

    // Esperar que estén vivos
    await waitForServices();

    console.log("==========================================");
    console.log("🎬 EJECUTANDO SIMULACIÓN DE LOGUEO");
    console.log("==========================================");

    // Ahora ejecutamos nuestro simulador que creamos antes
    const tester = spawn('node', ['simulador_login_exitoso.js'], { 
        cwd: __dirname,
        stdio: 'inherit', // Esto permite que los console.log del simulador salgan directo aquí
        shell: true 
    });

    tester.on('close', (code) => {
        console.log(`\n[🏁] Simulación terminada con código: ${code}`);
        cleanup(); // Al terminar la prueba bajamos los servidores también
    });
}

main();