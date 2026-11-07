# API local — G2 y extensión G3

API propia de AgentPay, no API de pey. Validación ejecutable: `packages/contracts/src/index.ts`. No hay rutas financieras reales. Las rutas simuladas opcionales se describen en `g3-mock-payments.md`. Respuestas de error: `{ "error": { "code": "..." } }` sin campos sensibles.

## Autenticación y límites

Bearer token local configurado por el operador, con al menos 24 caracteres aleatorios y distinto por actor. El servidor lo asocia a comprador o comercio; el cuerpo no admite buyerId, merchantId ni estados arbitrarios. El servidor solo escucha 127.0.0.1 y rechaza producción y banderas de pago real. No se incluye un token funcional en el repositorio.

Datos demo ficticios: buyer-demo / merchant-demo, teléfono sintético preconfigurado; no representa posesión o enrolamiento bancario. La demostración autenticada no sustituye identidad de producción. Sin CORS, sesiones públicas ni acceso remoto en G2.

## Operaciones

| Método y ruta | Actor | Entrada | Resultado |
|---|---|---|---|
| GET /health | público | — | salud y paymentsEnabled=false |
| POST /v1/intents | comprador | restricciones según CreateIntentSchema | 201 intención persistida, identidad del token |
| GET /v1/intents/:id | comprador dueño | — | intención propia; 404 si ajena |
| GET /v1/intents/:id/offers | comprador dueño | — | catálogo controlado (máx. 100) |
| POST /v1/offers/:id/evaluate | comprador dueño | intentId | checks; reserva hipotética, no aparta stock |
| POST /v1/intents/:id/proposals | comprador dueño | offerId, method opcional CODI_PUSH | 201 propuesta con reserva/hash/resumen; 422 si rechazada |
| POST /v1/orders | comprador dueño | proposalId, snapshotHash, approved=true | 201 orden APPROVED, sin cobro |
| GET /v1/orders/:id | comprador o comercio dueño | — | resumen sin teléfono ni texto libre del comprador |
| GET /v1/orders/:id/events | comprador o comercio dueño | — | hasta 100 eventos sanitizados |
| GET /v1/merchants/:id/orders | comercio dueño | — | hasta 100 órdenes propias |

Los endpoints de creación de intención, propuesta y orden exigen `Idempotency-Key` (8–128 letras/dígitos/guiones/guion bajo). Se normaliza y valida el cuerpo antes de calcular hash. La clave se acota por actor y ruta: repetir contenido devuelve exactamente respuesta/status originales, incluso tras reinicio; cambiar contenido produce 409. No existe POST de cobro en G2: la misma infraestructura transaccional servirá para él en G3.

La propuesta aparta producto por 30 minutos en el stub comercial controlado. La oferta y reserva deben cubrir 600 segundos + 60 de margen. Aprobación revalida intención, precio, cuenta, beneficiario, teléfono, versión de oferta, disponibilidad y vigencia. Un cambio comercial produce 409 y exige nueva propuesta y consentimiento. El valor stock del snapshot se conserva como evidencia histórica después de comprobar stock actual, para que otras reservas no alteren el hash de condiciones ya presentadas.

Cada propuesta aceptada lleva un orderId preasignado y una única reserva. Una propuesta y una intención solo pueden originar una orden. Otra clave para una propuesta ya usada recibe 409; otra propuesta de la misma intención también se bloquea y se liberan reservas alternativas al aprobar. Para una nueva compra, crear nueva intención. Orden, snapshot, consentimiento, cuatro eventos de auditoría, outbox interno y respuesta idempotente se guardan en una sola transacción. Un rechazo de políticas (422) se guarda con su evaluación pero no reserva stock.

Un replay devuelve el resultado histórico: se consulta GET para estado actual. Las reservas vencidas se marcan RELEASED al escribir o con `CommerceService.releaseExpired()`. Consultas de disponibilidad excluyen vencidas aunque no se haya ejecutado mantenimiento. En G2 no hay worker; la orden aprobada conserva su estado histórico, y su reserva debe volver a verificarse antes de enviar pagos en G3.

## Errores

- 400 INVALID_REQUEST: JSON/esquema/clave no válidos.
- 401 UNAUTHENTICATED; 403 BUYER_REQUIRED o MERCHANT_REQUIRED.
- 404 NOT_FOUND: recurso inexistente o ajeno. Las rutas financieras no existen.
- 409 IDEMPOTENCY_CONFLICT, SNAPSHOT_CHANGED, REVALIDATION_FAILED, PROPOSAL_ALREADY_ORDERED, INTENT_ALREADY_ORDERED o PROPOSAL_NOT_ELIGIBLE.
- 422: respuesta de propuesta con razones de política; no se ha creado orden.
- 500 INTERNAL_ERROR: fallo inesperado, sin detalles de DB ni datos de entrada.

## Reproducción

`pnpm demo` crea una DB temporal aislada, aplica las migraciones, siembra fixtures, inicia HTTP en loopback con tokens efímeros y ejecuta intención → propuesta → orden → replay → cierre/reapertura → consulta de orden/auditoría. Verifica cero intentos de pago y elimina exclusivamente su directorio temporal. No modifica una DB existente.

Para un servidor local persistente, desde la raíz del repo (Node 22+):

```sh
pnpm install --frozen-lockfile
pnpm db:generate
export DATABASE_URL="file:$PWD/work/agentpay.db"
export DEMO_BUYER_TOKEN="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
export DEMO_MERCHANT_TOKEN="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
pnpm db:migrate
pnpm db:seed
pnpm dev:api
```

El servidor requiere ruta SQLite absoluta. Los comandos usan variables del proceso; no cargan automáticamente `.env`. Conservar los tokens localmente si se necesitan en otra terminal; no copiarlos al chat. Ejemplo de consulta en otra terminal con la misma variable configurada:

```sh
curl --fail http://127.0.0.1:3001/health
curl --fail -H "Authorization: Bearer $DEMO_BUYER_TOKEN" \
  -H 'Idempotency-Key: example-intent-001' -H 'Content-Type: application/json' \
  -d '{"originalText":"2 kg café máximo $1,000","productId":"coffee","category":"specialty","quantity":2,"unit":"kg","maxAmountMinor":100000,"currency":"MXN","deliveryDeadline":"2030-01-01T00:00:00Z","timezone":"America/Mexico_City"}' \
  http://127.0.0.1:3001/v1/intents
```

El seed fija plazos relativos al primer arranque y no renueva datos existentes: una oferta demo vencida exige una DB de demo nueva, no resetear evidencia. Detener servidor antes de migrar o sembrar. El lock `.server.lock` impide dos instancias sobre la misma ruta; tras un cierre forzado, comprobar que no hay proceso activo antes de retirar un lock residual. No reutilizar rutas mediante symlinks para ejecutar una segunda instancia.

## Persistencia y siguientes gates

SQLite de archivo y Prisma 6.19.3, un proceso. Una cola de unidad de trabajo serializa lecturas/escrituras y SQLite aplica transacciones, claves foráneas, índices únicos y triggers de evidencia inmutable. No desplegar en un filesystem efímero, multinstancia o acceso remoto. PostgreSQL/auth de producción/retención/cifrado/rate limiting corresponden a endurecimiento posterior.

Los snapshots completos y el teléfono preconfigurado viven en la DB local; archivo creado con modo 0600. No están cifrados en reposo. Respuestas públicas, logs (desactivados), auditoría y outbox omiten teléfono/CLABE/RFC/secretos. El outbox contiene ORDER_APPROVED_INTERNAL y no notifica al comercio para preparar; ningún worker se implementa hasta G3.

El modelo de pagos solo prepara tablas y restricciones. Slot activo único por orden, recursos únicos por proveedor/tipo/id, transacciones externas únicas por proveedor/id y relación recurso 1:N transacciones. Las inserciones sintéticas de tests son pruebas de restricciones, no un proveedor simulado ni evidencia financiera.

Fuentes de implementación: [Prisma SQLite v6](https://www.prisma.io/docs/orm/v6/overview/databases/sqlite), [Prisma generación](https://www.prisma.io/docs/orm/v6/prisma-client/setup-and-configuration/generating-prisma-client), [Fastify testing](https://fastify.dev/docs/latest/Guides/Testing/), [Fastify hooks](https://fastify.dev/docs/latest/Reference/Hooks/).

## Extensión G3 vigente

G2 continúa reproducible sin configurar simulador. Con MOCK_WEBHOOK_SECRET se habilitan solicitud/consulta/conciliación simuladas, evento crudo firmado y bandeja de comercio; controles de operador requieren secreto adicional distinto. Toda respuesta de pago y resumen de orden mock lleva SIMULADO. `pnpm demo:payments` verifica el flujo completo local. El comportamiento «sin rutas financieras» de las secciones G2 se refiere a su configuración comercial original; ver `g3-mock-payments.md` para contrato G3 completo.
