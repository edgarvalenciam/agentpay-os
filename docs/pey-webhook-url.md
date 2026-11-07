# URL temporal y receptor dedicado de pey

Estado: G4 parcial, solo infraestructura de recepción. No se inicia ni se confirma ningún pago. El adaptador de envío y la conciliación real siguen pendientes.

## Servicios

`pnpm webhook:up` arranca un receptor exclusivo en 127.0.0.1:3010 y un Quick Tunnel HTTPS de Cloudflare. Solo existen GET /health y POST /v1/webhooks/pey. La API comercial, órdenes, controles mock y archivos privados no se exponen por ese puerto. El binario cloudflared se instala localmente; en esta ejecución se descargó la versión 2026.10.7 desde el release oficial de Cloudflare y se verificó su SHA-256 contra el digest del release.

La dirección vigente y los PID están en `work/webhook-runtime/state.json` (privado e ignorado por Git). Un segundo `pnpm webhook:up` reutiliza los procesos vivos y la URL. `pnpm webhook:down` verifica identidad de los procesos registrados antes de detener sus grupos. Una sesión incompleta se revisa/detiene antes de crear otra. La URL cambia al reiniciar el túnel; no tiene garantía de disponibilidad ni sirve como hosting permanente.

El teléfono proporcionado por el usuario se conserva exclusivamente en `.env.pey.local`, modo 0600, excluido de Git y de entregables. No se replica a datos seed, tests, auditoría, logs ni payloads públicos. Tampoco se utiliza para enviar cobros.

## Terminar configuración en el portal

1. Copiar la URL vigente de la salida de `pnpm webhook:up` o del informe de salida.
2. En el portal pey, abrir Desarrollador, configuración de la API key, registrar URL del webhook y crear/guardar el webhook.
3. El portal muestra un secreto de webhook. Este secreto es distinto de la API key. Guardarlo solo en configuración local con:

```sh
pnpm webhook:configure
```

Ejecutar desde la carpeta del proyecto, en una terminal local. La entrada está oculta y no imprime el secreto. El comando conserva las demás variables privadas y escribe de forma atómica con permisos 0600. El receptor recarga la configuración en cada entrega: no necesita cambiar la URL ni reiniciarse.

Hasta configurar el secreto, GET /health devuelve waiting_for_webhook_secret y POST devuelve 503 WEBHOOK_NOT_CONFIGURED, sin almacenar nada. Después de configurarlo, queda listo para verificar firmas; eso por sí solo no demuestra un webhook real de pey ni una prueba bancaria exitosa. No pegar API keys, secretos ni configuración privada en el chat.

## Verificación y almacenamiento

Se usa el SDK oficial `standardwebhooks` 1.1.1 sobre cuerpo original y encabezados webhook-id, webhook-timestamp y webhook-signature, con validación temporal del SDK. Se añaden límites de tamaño, formato de encabezados y presupuesto de solicitudes. Los rechazos no guardan el cuerpo ni exponen detalles del proveedor/DB.

Una entrega con firma válida se guarda antes de responder 200, con deduplicación durable por deliveryId y hash del contenido. Mismo ID con cuerpo distinto produce 409. Fallo de persistencia responde 503 para permitir reentrega. Tipos reconocidos: codi.pn.payment_received, codi.qr.payment_received, payment_link.status_updated y bank.account.updated; eventos desconocidos firmados se conservan como UNSUPPORTED_EVENT para revisión posterior.

El payload completo puede contener datos bancarios: se almacena cifrado con AES-256-GCM en PeyWebhookInbox, junto a IV aleatorio, tag de autenticidad y fingerprint de clave. La clave local de cifrado es independiente del secreto de firma y no se guarda en DB. Conservar copia privada de esa clave: perderla impide recuperar el contenido almacenado. El receiver no ofrece endpoint para leer la bandeja.

Estado de toda entrega: VERIFIED_PENDING_RECONCILIATION. No se modifica Order, PaymentAttempt, ProviderTransaction, inventario ni notificaciones del comercio. El procesador real futuro deberá comprobar API key ID, destinatario, importe y correlación antes de confirmar un pago. Una firma auténtica por sí sola no equivale a una orden conciliada.

Los procesos se ejecutan en segundo plano en este Mac. La computadora debe permanecer encendida y con conexión; suspensión, reinicio o cierre del túnel pueden interrumpir la URL. Los logs, DB, PID y estado viven en work/ y no se empaquetan.

## Evidencia de esta entrega

- 15 pruebas nuevas del receptor: SDK oficial, cuerpo alterado, secreto incorrecto, timestamps, duplicados concurrentes y reinicio, cifrado recuperable, ausencia de secreto, aislamiento de rutas, fallo de storage y permisos locales.
- Suite completa 137/137 aprobada y typecheck correcto.
- Quinta migración aplicada a DB dedicada del receptor; no se reseteó la DB comercial.
- Pruebas HTTPS públicas: health 200; recepción sin secreto 503; rutas de órdenes y controles mock 404.
- G4-R pendiente. No se usó la API key real ni se llamó a api.pey.mx; cero cobros.

Fuentes: [configurar webhooks pey](https://docs.pey.mx/docs/tutorials/getting-started/set-up-webhooks/), [webhook push](https://docs.pey.mx/docs/webhooks/codi/pn/), [Standard Webhooks JavaScript](https://github.com/standard-webhooks/standard-webhooks/tree/main/libraries/javascript), [Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/), [descargas cloudflared](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/).

## Guardar la API key sin compartirla en el chat

`pnpm pey:configure-key` abre una entrada local oculta y guarda PEY_API_KEY en .env.pey.local con permisos 0600. No recibe argumentos con la key ni la imprime. Conserva el secreto de webhook, clave de cifrado, teléfono y banderas de pago; no contacta a pey, no verifica la key y no activa operaciones financieras. El helper Configurar-API-key-pey.command permite iniciar este paso desde Terminal. Solo pegar el valor de la API key, sin el prefijo Bearer.
