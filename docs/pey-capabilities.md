# Pey — Inventario de capacidades API y webhooks

**Versión de análisis:** 1.2 | **Fecha:** 2026-11-07 | **Estado:** revisión documental; no hay integración real probada.

Fuente de referencia: https://docs.pey.mx/ y https://docs.pey.mx/docs/api/codi-api/ (versión de la API indicada en la referencia: 2026-10-20).

## Matriz de API (11 operaciones públicas)

| Grupo | Método y ruta de pey | Comportamiento documentado | Estrategia AgentPay | Prioridad |
|---|---|---|---|---|
| CoDi Push | `POST /codi/pn` | Emite solicitud al teléfono, devuelve `transactionId`, `codiId`; `200` no significa pagado | principal para compra agéntica | P0 |
| CoDi QR | `POST /codi/qr` | Genera código, devuelve `id`, `qrString`, `qrImage` opcional; `201` | fallback pos-MVP | P1 |
| Cuentas | `POST /bank-account` | Registra CLABE asociada a API key; retorna `id`, `codiStatus` | onboarding de cuenta receptora | P1 |
| Cuentas | `GET /bank-account/:id` | Consulta registro y estado CoDi | gating antes de cobrar | P1 |
| Payment Links | `POST /payment-link/create` | Genera URL alojada, retorna `id`, `url`; `200` | checkout multimétodo | P1 |
| Payment Links | `POST /payment-link/update` | Actualiza **solo amount** si está `pending` | no utilizar para cambiar orden aprobada | P2 |
| Payment Links | `GET /payment-link/:id` | Detalle y estado del link | comprobación de link, no sustituye conciliación | P1 |
| Transacciones | `GET /transaction/:id` | Obtiene transacción de API key; estados `PENDING`, `PAID` | recuperación y conciliación por transactionId | P0 |
| Transacciones | `GET /transaction/api-key` | Lista transacciones de API key; **80 por página**, `nextToken` | reconciliación por lotes | P1 |
| Transacciones | `GET /transaction/bank-account/:id` | Operaciones **pagadas**, **80 por página**, `nextToken` | conciliación por beneficiario | P1 |
| Transacciones | `GET /transaction/codi/qr/:id` | Transacciones de un QR; **20 por página**, `nextToken` | QR potencialmente múltiples pagos | P1 |

## Eventos publicados (4)

| Tipo de evento | Cuándo aplica | Correlación y tratamiento |
|---|---|---|
| `codi.pn.payment_received` | Push pagado | `transactionId`, importe en MXN, `numRef`, `bankAccountId` condicional, `metadata` |
| `codi.qr.payment_received` | QR pagado | `transactionId` + `codiQrId`, `numRef`, cuenta condicional |
| `payment_link.status_updated` | Cambio de estado del link | `paymentLinkId`, `clientReferenceId`, `status` `pending` / `processing` / `paid`, `transactions[]` |
| `bank.account.updated` | Una cuenta cambia a `ACTIVE` | `bankAccountId`, `codiStatus=ACTIVE`; **NO** comunica `PENDING`/`PROCESSING`/`ERROR` |

Un webhook puede repetirse. Validar firma Standard Webhooks con **cuerpo original** y cabeceras `webhook-id`, `webhook-timestamp`, `webhook-signature` según el SDK. Deduplicar `webhook-id` y deduplicar efectos financieros por identificadores de proveedor en la misma transacción de persistencia. No asumir secuencia de entrega ni exactly-once.

## Límites por método

### CoDi Push (`POST /codi/pn`)
- Autenticación: Bearer API key desde backend.
- `amount`: MXN en **pesos**; mayor que cero y hasta 1,000,000.
- `phoneNumber`: diez dígitos (`^[0-9]{10}$`), pertenencia y enrolamiento no demostrados por formato.
- `expiration`: mínimo 360 segundos, 360 por defecto.
- `numRef`: uno a siete dígitos; no puede transportar UUID ni una referencia alfanumérica de orden.
- `bankAccountId`: ID registrado de la cuenta CoDi receptora activa; si se omite, la cuenta CoDi asociada a la API key recibe el cobro.
- `metadata`: hasta 50 pares, claves ≤40 caracteres, valores ≤500 caracteres, tipos escalares; pey los convierte a strings. Usar `orderId` y `paymentAttemptId`, no datos sensibles.
- Respuesta `200`: `transactionId` (ULID) y `codiId` (identificador CoDi de 20 dígitos). **No significa que el pagador haya aceptado**.
- Consulta `GET /transaction/:id` para `PENDING` / `PAID`. No se documentan eventos de rechazo/notificación vista/no entregada.

### CoDi QR (`POST /codi/qr`)
- `amount`: **0 es válido** y permite al pagador introducir importe. Para órdenes de precio fijo, **no permitir 0**. No presuponer que un QR equivale a un único pago.
- `expiration`: 0 sin vencimiento o >=360 segundos; 0 es default.
- `numRef`, `bankAccountId`, `metadata`: análogos a push.
- `generateImage`: `false` por default; si se necesita velocidad, renderizar imagen del `qrString` en el cliente. `qrImage` es opcional, puede ser null.
- Respuesta `201`: `id` (IDC QR), `qrString`, `qrImage` opcional. **Un QR puede tener varias transacciones**: existe listado por QR de 20/página; no forzar unicidad de cobro con su id.

### Cuentas receptoras (`POST /bank-account`, `GET /bank-account/:id`)
- La cuenta se registra con `codiStatus` `PENDING` y solo `ACTIVE` permite CoDi.
- Referencia de tipo de cuenta describe `pending`, `processing`, `active`, `error` (ejemplos del webhook usan MAYÚSCULAS). Normalizar case-insensitive, conservar valor original.
- Hasta 5 días hábiles de activación comunicados por pey. En `ERROR`, consultar `GET`; el webhook `bank.account.updated` solo confirma `ACTIVE`.
- Una API key puede estar asociada a una cuenta de pago CoDi y una Stripe en el portal; puede registrar cuentas adicionales por API. **Validar viabilidad legal/contractual para comercios independientes; técnicamente posible ≠ autorizado para operar**.
- Tratar nombre legal, RFC, CLABE y otros datos de titularidad como datos personales/confidenciales. No escribirlos en logs.

### Payment Links (`POST /payment-link/create`, `update`, `GET`)
- `amount` > 0 en MXN, `successUrl` y `backUrl` son **HTTPS obligatorios**.
- `hasTip` default `false` y debe permanecer `false` para precio cerrado.
- `clientReferenceId` opcional, string ≤255; metadata plana como en CoDi.
- Creación retorna `id` y `url`; **no** devuelve transacción pagada.
- `update` cambia solamente el importe mientras el link esté `pending`. Si una orden cambia, invalidar snapshot y consentimiento; no mutar silenciosamente.
- Estado webhook de link: `pending`, `processing`, `paid`; puede incluir transacciones y desglose `base`, `tip`, `fee` y `applicationFee`. Conciliar el monto **base** de la orden y política de cargos, sin afirmar que `total pagado = abono neto`.
- Checkout describe CoDi, tarjeta, Apple Pay y Google Pay, sujetos a habilitación de cuenta Stripe/contrato. **El payload de creación no expone `bankAccountId` por link**; no asegurar selección dinámica de beneficiario por link.

### Transacciones
- `GET /transaction/:id` no expone una máquina completa de estados bancarios; solo `PENDING`, `PAID`.
- El objeto incluye `paymentMethod` (`CODI` o `CARD`), `payableType` (`PAYMENT_LINK`, `API_CODI_QR`, `API_CODI_PN`), `payableId`, monto y `amountBreakdown`.
- Los listados por API key/cuenta/QR usan `nextToken` y los tamaños de página documentados. No calcular totales como si una sola página fuese exhaustiva.

## Capacidades no documentadas — nunca inventar

No hay endpoints públicos confirmados en esta referencia para: transferencias salientes, autopagos CoDi sin banca del cliente, reembolsos programáticos, escrow, split payments, tokenización de cuenta pagadora ni suscripciones que debiten sin autorización. No concluir que estas capacidades son inexistentes fuera de la API pública; consultar comercialmente a pey.

## Ambiente y habilitación

Producción: `https://api.pey.mx`. Entorno sandbox dedicado: anunciado como **próximamente** en documentación (fecha de revisión). Pey sugiere pruebas productivas de $0.01 MXN con cuenta de prueba, cuyos fondos **no se devuelven**. **AgentPay no autoriza ni ejecuta por defecto esa prueba**; activar pagos reales solo con consentimiento y cuentas verificadas.

## Links a fuente oficial

- Inicio y entorno: https://docs.pey.mx/
- API: https://docs.pey.mx/docs/api/codi-api/
- Push: https://docs.pey.mx/docs/api/create-push-notification/
- QR: https://docs.pey.mx/docs/api/create-qr/
- Registro cuenta: https://docs.pey.mx/docs/api/register-bank-account/
- Consulta cuenta: https://docs.pey.mx/docs/api/get-bank-account/
- Crear link: https://docs.pey.mx/docs/api/create-payment-link/
- Actualizar link: https://docs.pey.mx/docs/api/update-payment-link/
- Consultar link: https://docs.pey.mx/docs/api/get-payment-link/
- Consultar transacción: https://docs.pey.mx/docs/api/get-transaction/
- Listado API key: https://docs.pey.mx/docs/api/get-api-key-transactions/
- Listado por cuenta: https://docs.pey.mx/docs/api/get-bank-account-transactions/
- Listado por QR: https://docs.pey.mx/docs/api/get-co-di-qr-transactions/
- Seguridad webhook: https://docs.pey.mx/docs/webhooks/introduction/
- Webhook Push: https://docs.pey.mx/docs/webhooks/codi/pn/
- Webhook QR: https://docs.pey.mx/docs/webhooks/codi/qr/
- Webhook link: https://docs.pey.mx/docs/webhooks/payment-link/status-update/
- Webhook cuenta: https://docs.pey.mx/docs/webhooks/bank-account/updated/
- Alta API key: https://docs.pey.mx/docs/tutorials/getting-started/create-an-api-key/
- Configuración webhook: https://docs.pey.mx/docs/tutorials/getting-started/set-up-webhooks/
