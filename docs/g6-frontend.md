# G6 — Interfaz local de compra y comercio (v1.2)

Estado: demo web local implementada y probada con catálogo, interpretación y pagos ficticios. No usa claves pey/OpenAI ni llama a esos proveedores. No es un despliegue público ni autenticación de producción. Los dos pendientes de pey siguen abiertos en docs/pey-pendientes.md.

## Abrir

Desde la raíz: `pnpm web:up`. Inicia en segundo plano o reutiliza el servidor sano y devuelve http://127.0.0.1:3002. Alternativa de desarrollo: `pnpm web:dev` en primer plano, Ctrl+C para detenerlo. El helper outputs/Abrir-AgentPay.command muestra la URL desde Terminal. WEB_PORT permite elegir otro puerto local.

La demo utiliza una DB propia en work/web-runtime/commerce.db y aplica migraciones sin resetearla. Los tokens, firma mock y controles se generan solo en memoria y nunca aparecen en el navegador. La DB, estado, logs y locks se excluyen del repo/ZIP. No se modifica .env.pey.local, .env.openai.local ni la DB del receptor de webhooks. El launcher no elimina locks ni mata procesos previos ante un error: revisar un estado bloqueado antes de volver a arrancar. No publicar esta interfaz mediante el túnel de webhooks.

## Recorrido del comprador

1. Escribir el pedido o usar el ejemplo de 2 kg de café por máximo $1,000 mañana. El intérprete de la demo prepara fragmentos de forma local; la UI lo etiqueta como demo, no como inferencia OpenAI real. El servidor aplica el grounding y políticas de G5.
2. Revisar la propuesta: producto, cantidad, importe total, comercio/beneficiario y entrega. El precio permanece en la tarjeta principal incluso en móvil, donde el resumen lateral se oculta.
3. Marcar revisión y pulsar Aprobar pedido. Crea orden/consentimiento por la API existente; no solicita ni confirma pago.
4. Dar consentimiento separado para solicitar CoDi simulado. La UI conserva una clave idempotente y bloquea otro envío. Ante error de red conserva incertidumbre: consultar estado en vez de fabricar PAID o reenviar automáticamente.
5. GET /payments consulta el estado. El temporizador solo lee; no confirma pagos. Consultar estado puede reconciliar mediante la API existente, sin crear otro cobro.
6. En Simulador, el operador local genera una confirmación ficticia separada. El backend verifica el evento mock, concilia el pago, consume inventario y entrega la notificación local. Al volver a Comprar, la pantalla muestra el resultado del backend, incluyendo excepción de cumplimiento si corresponde.
7. Preparar otra compra limpia solo el estado de pantalla, conservando pedidos y auditoría de la DB.

La UI utiliza solo CoDi Push. No presenta QR/Payment Links ni un interruptor de pagos reales como funciones comerciales disponibles. El QR bancario anterior fue diagnóstico aislado.

## Comercio y preparación

La vista Comercio consulta órdenes y notificaciones autenticadas de merchant-demo mediante el BFF. Muestra producto, importe y estado; la bandeja refleja eventos conciliados, no el mero envío del cobro. El registro de compra presenta etiquetas sanitizadas de auditoría.

Se agregó POST /v1/orders/:id/preparation, con token del comercio dueño, cuerpo vacío e Idempotency-Key. Exige orden PAID, READY_FOR_PREPARATION y evidencia de intento CONFIRMED con transacción PAID. Actualiza solo a PREPARING y agrega auditoría atómicamente. No acepta comprador, otro comercio, orden no pagada ni excepción de cumplimiento. Replay de la misma clave no duplica el evento. No significa entrega física ni integración con sistemas externos del comercio.

## Sesión y frontera del navegador

apps/web/public contiene HTML/CSS/JS sin frameworks o dependencias adicionales. apps/api/src/web-app.ts sirve esos activos y un BFF de rutas permitidas. La API comercial se usa mediante inject dentro del servidor, sin abrir su puerto al navegador.

El BFF solo arranca con backend mock e intérprete fixture; rechaza perfil real/no ficticio y producción. Solo escucha 127.0.0.1 y exige Host y Origin esperados para impedir uso desde otra web. Sesión aleatoria HttpOnly/SameSite=Strict (2 h), nonce CSRF para mutaciones, respuestas no-store, CSP sin scripts/estilos inline o dominios de proveedor, frame-ancestors none y nosniff. Nunca entrega tokens Bearer o del operador a HTML/JS/sesión. Catálogo y nombres de eventos/beneficiario se renderizan con textContent; no se ejecuta HTML recibido.

Roles Comprar/Comercio/Simulador son vistas explícitas de un operador de demo local. El cambio de rol está protegido por sesión/CSRF, pero no representa verificación de identidad multicliente de producción. Cada ruta comprueba el rol y la API revalida propiedad de recursos. Los controles mock no son accesibles por el proxy de comprador ni se entregan sus credenciales al navegador.

El estado de compra y claves de operación se conservan en sessionStorage, sin secretos del proveedor ni tokens de autenticación. Puede incluir el texto introducido y resumen de propuesta; es almacenamiento local del navegador, no cifrado de datos en reposo. El estado financiero se recarga del backend y no se restaura como pago confirmado desde el almacenamiento del navegador.

## Evidencia

Suite completa: 346/346 pruebas en 16 archivos, typecheck aprobado y node --check del cliente. Las 14 pruebas nuevas cubren sesión/CSRF/Host/Origin, rutas permitidas, perfiles bloqueados, propuesta/aprobación/solicitud separadas, polling sin falso pago, autorización de preparación, replay y excepción tardía.

Prueba real de navegador, solo con simulaciones: pedido de 2 kg café → propuesta $850 → revisión y aprobación → solicitud pendiente → confirmación del operador → pago conciliado → una notificación → preparación del comercio. Verificados recarga de página, reinicio del servidor, estado conservado y nueva compra sin borrar la anterior. Pantallas móvil 390×844 y escritorio 1360×1000 sin desbordamiento horizontal. Evidencias PNG en outputs; no contienen claves ni datos bancarios reales.

Limitaciones: catálogo e intérprete local acotados; no chat libre con un modelo real desde la UI, producción o autenticación pública, proveedores reales ni entrega física. Fase 7 y habilitación bancaria comercial requieren trabajo/autorización posterior. Los diagnósticos bancarios previos permanecen separados del pedido simulado de la demo.
