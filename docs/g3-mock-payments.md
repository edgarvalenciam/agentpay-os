# G3 — Pagos simulados y conciliación

Estado: implementado para desarrollo local. Nunca se llama a pey ni a un banco. El adaptador solo soporta CODI_PUSH simulado; QR y links continúan fuera del camino operativo.

## Reproducir

Con Node.js 22+ y pnpm 11.25.0, desde la raíz:

```sh
pnpm install --frozen-lockfile
pnpm db:generate
pnpm test
pnpm typecheck
pnpm demo:payments
```

La demo crea una DB temporal, aplica las cuatro migraciones, inicia HTTP sobre loopback y genera secretos efímeros que no imprime. Crea orden por $850, solicita pago simulado, verifica pendiente, recibe evento firmado, ignora duplicado, entrega una notificación a la bandeja interna del comercio y comprueba recuperación tras reinicio. Elimina solo su directorio temporal. `pnpm demo` conserva la demostración comercial G2 sin intentos financieros.

## Configurar servidor local persistente

Además de DATABASE_URL y tokens G2, configurar un secreto MOCK_WEBHOOK_SECRET aleatorio de al menos 32 caracteres. Se permite un MOCK_CONTROL_TOKEN distinto, de al menos 24 caracteres, para controles de operador. No reutilizar tokens de compradores, comerciantes, secretos pey ni claves reales. Sin MOCK_WEBHOOK_SECRET, la API mantiene las rutas comerciales y no registra las rutas de simulación. Los controles se omiten si no se configura su token.

```sh
export MOCK_WEBHOOK_SECRET="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
export MOCK_CONTROL_TOKEN="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
export MOCK_SCENARIO=ACCEPT
pnpm db:migrate
pnpm dev:api
```

Completar primero configuración/seed de `api-contracts.md`. El servidor sigue escuchando solo 127.0.0.1 y rechaza producción, PAYMENT_PROVIDER distinto de mock o ALLOW_REAL_PAYMENTS=true. No hay adaptador real. Health mantiene paymentsEnabled=false y realPaymentsEnabled=false; mockPaymentsEnabled indica disponibilidad del simulador.

## Rutas nuevas (solo con simulador configurado)

| Ruta | Autorización | Comportamiento |
|---|---|---|
| POST /v1/orders/:id/payment-requests | comprador dueño + Idempotency-Key | approved=true, snapshotHash y method opcional CODI_PUSH; respuesta 202 SIMULADO |
| GET /v1/orders/:id/payments | comprador/comercio dueño | estado de orden, cumplimiento e intentos simulados |
| POST /v1/orders/:id/reconcile | comprador/comercio dueño, cuerpo {} | consulta ledger simulado y recupera confirmación perdida, sin reenviar solicitud |
| POST /v1/test-only/mock-webhook | firma mock, sin token de comprador | cuerpo crudo application/mock-event+json |
| POST /v1/test-only/mock-payments/:id/confirm | X-Mock-Control-Token de operador | pago simulado + evento firmado; no admite cambios de importe en el cuerpo |
| POST /v1/test-only/mock-payments/:id/reject | X-Mock-Control-Token de operador | evento mock de falta de autorización; mantiene pendiente, no representa un rechazo pey |
| POST /v1/test-only/outbox/dispatch | X-Mock-Control-Token de operador | procesa hasta 100 eventos internos |
| GET /v1/merchants/:id/notifications | comercio dueño | bandeja interna de notificaciones SIMULADO, máx. 100 |

El `:id` de confirm/reject es el ID del intento, no de la orden. Controles y dispatch requieren cuerpo {} y solo existen con controlToken. No se admite asignar PAID desde payload ni invocar herramientas financieras desde un agente. La ruta `/v1/webhooks/pey` no existe.

## Envío e idempotencia

1. Dentro de una transacción: verificar dueño, clave/cuerpo, ausencia de intento previo, orden APPROVED, snapshot y consentimiento; recargar precio, oferta, reserva, stock, cuenta, beneficiario y teléfono.
2. Crear PaymentAttempt SUBMISSION_PENDING con slot activo único por orden, referencia numérica, API key ID simulado, destino y expiración; pasar orden a PAYMENT_PENDING y guardar respuesta idempotente/auditoría.
3. Solo después del commit, invocar el gateway mock una vez. El simulador no es idempotente por sí mismo; guarda cada invocación en MockSubmission.
4. Recibo exitoso guarda IDs mock y PAYMENT_PENDING; no confirma pago. Cualquier respuesta perdida/error queda SUBMISSION_UNKNOWN. Un recibo tardío no rebaja una confirmación recibida por webhook.
5. Repetir misma clave/cuerpo devuelve la aceptación histórica 202 sin invocar gateway; otra clave no crea otro intento para la orden. GET muestra el estado actual. Al reiniciar, intentos CREATED/SUBMISSION_PENDING pasan conservadoramente a UNKNOWN; no se reanuda su envío automáticamente.

Escenarios de operador: ACCEPT; TIMEOUT_BEFORE_ACCEPT (sin ledger); TIMEOUT_AFTER_ACCEPT (ledger persistido, respuesta perdida). No son opciones del comprador. Un UNKNOWN sin transacción recuperable permanece bloqueado para consulta/revisión; no se inventa un fallo bancario ni se permite reintento ciego.

## Firma de desarrollo y conciliación

**El protocolo mock es propio de AgentPay; no es Standard Webhooks ni acredita compatibilidad con pey.** Fase 4 implementará la firma oficial y sus payloads reales.

`signMockEvent` y `verifyMockEvent` están en integrations. Usan HMAC-SHA256 sobre `deliveryId.timestamp.rawBody` y cabeceras mock-event-id (prefijo mock-event-), mock-event-timestamp (Unix segundos) y mock-event-signature (mock-v1=hex). Se exige diferencia temporal de máximo cinco minutos y se compara firma en tiempo constante sobre los bytes originales. JSON se parsea después de verificar; se valida schema estricto y environment=mock. Datos completos de eventos no se guardan en logs ni auditoría: se conserva hash del raw body y resultado sanitizado.

El aviso incluye tipo mock.codi.push.paid o mock.codi.push.unconfirmed, attemptId, orderId, transactionId, amount (pesos decimales), currency, beneficiaryAccountId interno, apiKeyId mock, numRef y datePaid. **Estos nombres/valores no son un contrato de request/webhook pey.** Los IDs de transacción y codiId usan prefijo mock- deliberadamente.

Antes de confirmar se cotejan los ocho campos de correlación/importe contra el intento persistido. Incluso si se perdió el recibo, la transacción debe corresponder al único registro del ledger durable del simulador; nunca se acepta un ID inventado a partir de metadata. Se rechazan pagos anteriores al intento, fechas inválidas, precisión mayor de dos decimales, ambientes reales y firmas inválidas. Conversión pesos↔centavos usa texto decimal y BigInt sin redondear.

- Misma entrega y mismo cuerpo: devolver resultado persistido. Misma entrega con contenido distinto: 409 EVENT_ID_CONFLICT.
- Misma transacción con otra entrega: registrar entrega sin repetir confirmación, consumo de stock ni outbox.
- Firma/esquema inválidos: 401/400, sin efectos. Un mismatch firmado registra RECONCILIATION_EXCEPTION y no confirma. Una confirmación anterior válida no se rebaja por eventos posteriores contradictorios o unconfirmed.
- Un evento correcto posterior o polling del ledger pagado pueden resolver una excepción de conciliación. No se modifica el snapshot/consentimiento para hacer coincidir un pago incorrecto.
- Evento, transacción, estado del intento/orden, consumo de stock, auditoría y outbox se guardan atómicamente. Solo después se responde éxito.

## Dinero y cumplimiento separados

Una confirmación válida registra transacción PAID e intento CONFIRMED una vez (siempre mock). Si la reserva sigue válida, hay capacidad y stock, la orden pasa a PAID y cumplimiento READY_FOR_PREPARATION; consume inventario y marca reserva CONSUMED en la misma transacción. Así el inventario de una compra pagada no vuelve a quedar disponible al vencer su reserva histórica.

Si la reserva venció/se liberó o ya no se puede cumplir, conservar pago confirmado, orden EXCEPTION y FULFILLMENT_EXCEPTION. Se crea alerta interna al comercio, no autorización de preparación. No hay reembolsos automáticos. El vencimiento local de solicitud no demuestra rechazo del banco.

## Outbox y bandeja interna

Un efecto financiero crea un outbox con effectKey único por transacción. El dispatcher reclama mediante lease/token por 30 segundos; tras entregar confirma en otra transacción. Reintenta fallos con espera exponencial limitada a 60 segundos y recupera leases vencidos tras reinicio. La bandeja MerchantNotification deduplica por eventId, de modo que un crash entre entrega y acuse no duplica la notificación. ORDER_APPROVED_INTERNAL se consume sin notificar preparación.

En servidor configurado, el worker corre cada segundo y se detiene con la API; en tests/constructor sin intervalo se procesa explícitamente. La entrega es a una **bandeja local persistente**, no email, mensajería ni webhook a personas. Un canal externo futuro debe aceptar su propia clave idempotente: no se garantiza exactly-once externo.

## Evidencia y límites

Suite final: 122 pruebas (61 core + 61 integración), incluidos 36 casos de pagos/migración. Typecheck, cuatro migraciones, demo comercial y demo HTTP de pagos simulados aprobados. La prueba de actualización preserva una orden G2 con snapshot, consentimiento, auditoría, outbox, claves foráneas y triggers inmutables.

Continúan límites G2: SQLite local un proceso, tokens de demo, DB sin cifrado y listados limitados. Se conserva historial G2 y no se usan datos/credenciales reales. G4 no iniciado: Standard Webhooks, transporte pey, habilitación de cuenta y evidencia bancaria siguen pendientes. Este gate prueba integridad simulada, no integración bancaria.

Referencia técnica consultada: [parser de cuerpo crudo de Fastify](https://fastify.dev/docs/latest/Reference/ContentTypeParser/).
