# Guía de ejecución y validación de CineFlex

## Inicio rápido

Necesitas **Node.js 24 o superior** y npm. La interfaz y la API se sirven juntas; no necesitas MongoDB, Cloudinary ni un servidor frontend adicional.

```bash
cd qa-cineflex-project
npm ci
npm start
```

Abre **http://127.0.0.1:3000**. Acceso de demostración:

- Correo: `demo@cineflex.test`
- Contraseña: `CineFlex123!`
- Tarjeta ficticia aprobada: `4111111111111111`
- Tarjeta ficticia rechazada por el banco: `4000000000000002`
- Banco simulado indisponible: `4000000000009995`
- Tarjeta falsa para la prueba negativa: `1234567890123456`

No ingreses tarjetas reales. La sala tiene 24 asientos; A1 de la película 1 inicia ocupado como dato de prueba. Cada película representa una única función. Las ventas locales se guardan en `backend/data/cineflex.sqlite` y sobreviven a reinicios.

`npm run dev` inicia Nodemon. Desde `backend/` también funcionan `npm start` y `npm run dev`.

## Configuración del entorno

La configuración por defecto permite iniciar sin copiar archivos. Para personalizarla, copia `backend/.env.example` a `backend/.env` y ajusta las variables. En Linux/macOS:

```bash
cp backend/.env.example backend/.env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Pega el valor generado en `JWT_SECRET`. En Windows puedes copiar el archivo con el explorador o `Copy-Item backend/.env.example backend/.env` desde PowerShell. No publiques tu `.env`.

| Variable | Valor por defecto | Uso |
| --- | --- | --- |
| `PORT` | `3000` | Puerto del servidor |
| `HOST` | `127.0.0.1` | Dirección local de escucha |
| `DB_PATH` | `./data/cineflex.sqlite` | Ruta relativa a backend, o absoluta |
| `JWT_SECRET` | Aleatorio por arranque | Firma; mínimo 32 caracteres si se configura |
| `JWT_EXPIRES_IN` | `1h` | Vencimiento del JWT |
| `LOCK_MS` | `60000` | Bloqueo tras 3 errores; mantener este valor para el taller |

Sin secreto fijo, reiniciar el servidor invalida tokens anteriores. Las suites usan una base en memoria y un puerto libre, sin tocar la base local ni necesitar `npm start` por separado. Para reiniciar solo tus datos de demostración, detén el servidor y renombra la carpeta `backend/data`; al arrancar se crea una base nueva. Conserva la carpeta anterior si quieres recuperar las reservas.

## Arquitectura

```text
Navegador HTML/CSS/JS
        │ solicitudes JSON + JWT
        ▼
Express + Helmet + Morgan
        ├── autenticación y revocación de sesión
        ├── catálogo y consulta de asientos
        └── reserva ── Stub bancario (síncrono)
                 └── transacción SQLite + UNIQUE(película, asiento)
```

Las contraseñas se guardan con sal y scrypt. El servidor bloquea una cuenta existente durante 60 segundos al tercer error consecutivo. El token se conserva en sessionStorage y corresponde a una sesión revocable en SQLite. Cerrar sesión revoca esa sesión; Atrás no recupera el acceso. Los números de tarjeta no se guardan ni se incluyen en los logs de Morgan.

La interfaz usa scripts locales, selectores por ID/CSS y encabezados de no almacenamiento en caché. HSTS se desactiva para HTTP local; un despliegue real requiere HTTPS, configuración de seguridad y diseño bancario adicional.

```text
qa-cineflex-project/
├── README.md
├── estrategia_pruebas.pdf
├── package.json / package-lock.json
├── backend/
│   ├── server.js / app.js / database.js / paymentStub.js
│   ├── package.json / .env.example
│   └── tests/
├── frontend/
│   ├── index.html / styles.css / app.js
├── api_tests/
│   ├── CineFlex_API_Collection.json
│   └── CineFlex_Environment.json
├── ui_tests/
│   ├── pages/LoginPage.js
│   ├── pages/CarteleraPage.js
│   ├── pages/ReservaPage.js
│   └── test_suite.js
├── performance/
│   ├── prueba_carga.jmx
│   ├── analyze.js / render_summary.groovy
├── .github/workflows/qa-pipeline.yml
├── scripts/
├── evidencias/
└── docs/
    ├── estrategia_pruebas.md
    ├── informe_feynman.md
    ├── guion_video_3_min.md
    └── casos_ui.md
```

Los archivos adicionales amplían la arquitectura requerida; los nombres y carpetas del taller se conservan.

## Ejecutar las pruebas

### Backend: reglas e integración

```bash
npm test
```

Son 15 casos: dos del Stub y trece de integración HTTP/SQLite. Incluyen bloqueo, expiración y revocación de sesión, pagos fallidos sin reservar, precio impuesto por servidor y doce compras simultáneas del mismo asiento. No necesitan Jest: usan `node:test` y aserciones de Node.

### API: Postman y Newman

```bash
npm run test:api
```

El comando abre un servidor aislado, ejecuta la colección en orden y devuelve error si cualquier petición o aserción falla. Guarda el reporte completo en `artifacts/newman.json`. Para Postman gráfico:

1. Inicia la aplicación con `npm start`.
2. Importa ambos JSON de `api_tests/`.
3. Selecciona el entorno **CineFlex local** y comprueba `baseUrl=http://127.0.0.1:3000`.
4. Ejecuta la colección completa con Collection Runner. No saltes directamente al pago: el login guarda `token` y la consulta de asientos guarda `seat`.

Las nueve solicitudes tienen al menos tres aserciones cada una. El token se extrae con `pm.environment.set('token', payload.token)` y se usa como Bearer. La consulta de cartelera exige JSON válido y menos de 300 ms. La reserva negativa verifica estado, código y mensaje exactos.

### Interfaz: Selenium y POM

Instala Chrome si no lo tienes. Selenium Manager resuelve el controlador y puede descargar Chrome si es necesario; la primera ejecución requiere internet y permisos de escritura en su caché.

```bash
npm run test:ui
```

Por defecto Chrome se ejecuta sin ventana. Para verlo en Linux/macOS:

```bash
HEADLESS=false npm run test:ui
```

En PowerShell:

```powershell
$env:HEADLESS='false'
npm run test:ui
```

En entornos sin internet puedes indicar `CHROME_BIN` y `CHROMEDRIVER_BIN` con rutas absolutas a binarios compatibles. `CHROME_NO_SANDBOX=true` solo se utiliza cuando un entorno de pruebas aislado lo exige; no es necesario normalmente.

Los 20 casos son secuenciales y reinician el almacenamiento de sesión entre escenarios. Las Pages tienen acciones, selectores y lecturas; todas las aserciones pertenecen a `test_suite.js`. El servidor y la base son efímeros, por lo que la cuenta de bloqueo y el asiento inicial tienen un estado conocido al empezar cada suite. El bloqueo usa otra cuenta para no afectar las compras. Consulta la [matriz de casos](casos_ui.md).

Resultados: `artifacts/selenium.json`, captura de ticket y capturas por caso si falla. Para ejecutar backend, API y UI en orden:

```bash
npm run test:all
```

### Rendimiento: JMeter

Instala Java 17 o 21 y [Apache JMeter 5.6.3](https://jmeter.apache.org/download_jmeter.cgi). Comprueba que `java` y `jmeter` estén disponibles en tu PATH. La aplicación de carga es un servidor temporal propio:

```bash
npm run test:performance
```

En Linux/macOS también puedes indicar las rutas:

```bash
JAVA_HOME=/ruta/al/java JMETER_BIN=/ruta/apache-jmeter-5.6.3/bin/jmeter npm run test:performance
```

En Windows usa el ejecutable de JMeter directamente con el servidor local activo:

```powershell
jmeter.bat -n -t performance/prueba_carga.jmx -Jport=3000 -l performance/results-local.jtl -e -o performance/dashboard-local
node performance/analyze.js performance/results-local.jtl
```

Usa nombres nuevos para el JTL y el dashboard en cada ejecución. No reutilices una carpeta de dashboard no vacía. Asegúrate de que la cuenta demo no esté bloqueada por pruebas manuales anteriores.

El plan tiene 500 usuarios, ramp-up de 15 s, duración total de 45 s y pausa de 1 s. El máximo de usuarios se mantiene aproximadamente 30 s. Un setUp Thread Group obtiene un JWT; se comparte para medir la lectura de asientos sin incluir cientos de cálculos de contraseña. La aserción exige HTTP 200 y 24 asientos. Se guarda JTL y dashboard HTML en `performance/results/<fecha>/`.

Después de JMeter, el analizador devuelve error si error ≥ 1 %, p95 ≥ 300 ms o no se observan 500 hilos. Estos umbrales son criterios propuestos; el perfil de usuarios y el reporte de error/throughput provienen del taller. JMeter por sí solo puede salir con código 0 aunque haya respuestas fallidas, por eso añadimos el análisis.

Para abrir el plan en la aplicación JMeter: File → Open → `performance/prueba_carga.jmx`. Con `npm start` activo, usa puerto 3000 y ejecuta el plan; para medir carga es preferible CLI. Para visualizar los resultados existentes, selecciona Summary Report y carga el JTL con Browse.

## Evidencias de ejecución

Entorno: Linux x86_64, Node 26.11.1, Chrome 156.0.8078.47, Selenium WebDriver 4.51.0, Newman 6.2.3, Java 21 y JMeter 5.6.3. Instalación reproducible mediante el lockfile; el workflow usa Node 24. Las pruebas locales se hicieron con Node 26 y no se presenta como ejecutado en GitHub.

| Comprobación | Resultado registrado |
| --- | --- |
| Backend | 15/15 casos aprobados |
| Newman | 9 solicitudes; 35/35 aserciones aprobadas |
| Cartelera Postman | 5 ms en la ejecución guardada; límite < 300 ms |
| Selenium | 20/20 casos aprobados |
| JMeter: usuarios activos observados | 500 |
| JMeter: consultas de asientos | 18.512 |
| JMeter: error | 0,00 % |
| JMeter: throughput de asientos | 419,89 consultas/s |
| JMeter: media / p95 / máximo | 1,37 / 2 / 107 ms |

![Summary Report de JMeter](../evidencias/jmeter-summary-report.png)

La imagen muestra el **componente real Summary Report de JMeter**, renderizado sin escritorio a partir del JTL guardado mediante `performance/render_summary.groovy`. No es una captura de una sesión de escritorio. Puedes cargar el mismo JTL en tu JMeter y capturar su ventana si tu docente exige una captura de pantalla tomada desde la aplicación. El TOTAL incluye un login adicional y usa una ventana temporal distinta; para la capacidad de consulta usa la fila **Consultar asientos**. Las cifras de la tabla anterior se calculan desde el JTL únicamente para ese endpoint.

![Ticket virtual producido por Selenium](../evidencias/ticket.png)

Fuentes verificables:

- [Resumen Newman sin tokens](../evidencias/newman-resumen.json).
- [Los 20 resultados Selenium](../evidencias/selenium-resultados.json).
- [Métricas de carga](../evidencias/jmeter-resumen.json).
- [JTL original comprimido](../evidencias/jmeter-results.jtl.gz) y [SHA-256 del JTL descomprimido](../evidencias/jmeter-results.sha256).

Para descomprimir y volver a analizar sin instalar herramientas adicionales:

```bash
node -e "const f=require('node:fs'),z=require('node:zlib');f.writeFileSync('artifacts/replay.jtl',z.gunzipSync(f.readFileSync('evidencias/jmeter-results.jtl.gz')))"
node performance/analyze.js artifacts/replay.jtl
```

No se versiona el reporte completo de Newman porque contiene tokens de la ejecución; se conserva un resumen revisable. Los resultados son de un mock local y un ensayo corto; no equivalen a una certificación de producción ni incluyen un banco real o pagos bajo carga.

## Continuous Testing y publicación

El workflow `.github/workflows/qa-pipeline.yml` se activa por **push** y **pull_request**. Instala dependencias con `npm ci`, ejecuta backend y Newman en un job, y Selenium en otro. Conserva artefactos incluso si hay fallos; no ignora códigos de salida.

1. Crea un repositorio **público y vacío** en GitHub. No añadas otro README inicial.
2. Desde esta carpeta, enlaza su URL real y sube `main`:

```bash
git remote add origin <URL_REAL_DE_TU_REPOSITORIO>
git push -u origin main
```

3. Revisa **Actions** y confirma que los jobs estén verdes. El workflow está preparado, pero su ejecución remota queda pendiente de ese primer push.
4. En Settings → Rules → Rulesets (o Branch protection, según la interfaz), protege `main`, exige pull request y configura como obligatorios los checks **API y regresión** y **Selenium POM** que aparezcan tras ejecutar el workflow. Evita permitir bypass si quieres que también se aplique a administradores. La regla es lo que bloquea una fusión; un YAML fallido por sí solo no impide que alguien con permisos la haga.
5. Añade el enlace público del video al comienzo de este README y comprueba el acceso al repositorio y video sin iniciar sesión.

El repositorio Git local ya incluye commits por implementación, automatización, rendimiento/CI y documentación. La publicación requiere configurar el remoto de GitHub.

## Estudio y documentación

- [Estrategia de pruebas en PDF](../estrategia_pruebas.pdf): integración Top-Down, Stub, requisitos, regresión, comparativa y criterios de salida.
- [Informe de repaso Feynman](informe_feynman.md): explicaciones, analogías, límites y preguntas para comprobar comprensión.
- [Guion del video](guion_video_3_min.md): discurso de unas 300 palabras y secuencia de pantalla.
- [Fuente editable de la estrategia](estrategia_pruebas.md). Para regenerar el PDF, instala `reportlab` y ejecuta `python3 scripts/generar_pdf.py`; usa `PDF_FONT_DIR` si tus fuentes Liberation Sans están en otra carpeta.

Se revisaron los materiales de clase y las dos imágenes. Se reutilizan las ideas de separación por capas, JWT, variables, pruebas funcionales/no funcionales y patrón preparar-actuar-verificar. El taller pide una base relacional; por eso se eligió SQLite en lugar del MongoDB usado en el ejemplo de cervecería. No se copian claves de las imágenes ni se necesitan cuentas externas para ejecutar el mock.

Referencias técnicas: [Selenium JavaScript](https://www.selenium.dev/selenium/docs/api/javascript/index.html), [Selenium Manager](https://www.selenium.dev/documentation/selenium_manager/), [JMeter](https://jmeter.apache.org/usermanual/test_plan.html), [SQLite en Node](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html) y [tipos de pruebas en Cypress](https://docs.cypress.io/app/core-concepts/testing-types).

## Problemas comunes

| Síntoma | Acción |
| --- | --- |
| No se encuentra node:sqlite | Instala Node 24 o superior y comprueba `node --version` |
| Puerto 3000 ocupado | Cambia `PORT` en backend/.env; las suites eligen otro puerto automáticamente |
| Cuenta bloqueada | Espera 60 segundos; no recargues para intentar eludir el control |
| Token inválido al reiniciar | Inicia sesión otra vez; configura JWT_SECRET si quieres conservar la firma |
| Selenium no descarga Chrome/driver | Revisa internet o proporciona CHROME_BIN y CHROMEDRIVER_BIN compatibles |
| JMeter no inicia | Comprueba Java, JAVA_HOME y la ruta JMETER_BIN; Windows puede usar jmeter.bat directamente |
| El mismo asiento ya no está disponible | Elige otro o reinicia los datos de demostración conservando una copia |
| Una prueba falla | Consulta artifacts y la salida; las suites deben devolver error, no ocultarlo |
