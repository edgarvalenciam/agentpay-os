# Architecture Decision Log

## ADR-001 — Core primero, frontend después
- **Fecha:** 2026-11-07
- **Decisión:** core independiente, API-first, frontend definido por contratos y construido después.
- **Razón:** la integridad transaccional y la conciliación son el riesgo principal.
- **Estado:** aceptada.

## ADR-002 — Aprobación bancaria obligatoria
- **Fecha:** 2026-11-07
- **Decisión:** el agente no inicia pagos directamente; el comprador solicita el cobro y autoriza en su aplicación bancaria.
- **Estado:** aceptada.

## ADR-003 — Entorno simulado por defecto
- **Fecha:** 2026-11-07
- **Decisión:** sin claves ni pagos reales por defecto. Toda demo simulada debe etiquetarse como tal.
- **Estado:** aceptada.

## Pendientes
- Beneficiario final y contrato operativo de pey.
- Habilitación de CoDi Push y prueba de banco pagador.
- Manejo exacto de rechazos, vencimientos y consulta de estados del proveedor.

## ADR-004 — Diseño multimétodo sin implementación temprana
- **Fecha:** 2026-11-07
- **Decisión:** el dominio admite `CODI_PUSH`, `CODI_QR`, `PAYMENT_LINK`, pero el MVP implementa CoDi Push primero y los demás solo si no comprometen G7.
- **Razón:** aprovechar pey sin ampliar prematuramente el camino crítico.
- **Estado:** aceptada.

## ADR-005 — Cuenta bancaria por comercio con gate legal
- **Fecha:** 2026-11-07
- **Decisión:** modelar `MerchantPaymentAccount`, exigir estado ACTIVE para CoDi y no habilitar producción de terceros sin revisar contratos/KYB.
- **Estado:** aceptada como diseño; operación multi-comercio pendiente.

## ADR-006 — Recurso del proveedor distinto de transacción
- **Fecha:** 2026-11-07
- **Decisión:** separar `ProviderResource` de `ProviderTransaction`; QR y Payment Link pueden relacionarse con más de una transacción, y Push trae transactionId inicial.
- **Estado:** aceptada.

## ADR-007 — Link alojado no cambia orden aprobada
- **Fecha:** 2026-11-07
- **Decisión:** una modificación de monto exige nueva evaluación y consentimiento; no actualizar en silencio links `pending`. `hasTip=false` para compras de monto cerrado.
- **Estado:** aceptada.

## ADR-008 — Reglas concretas de G1
- Fecha: 2026-11-07.
- Cantidad y unidad exactas, moneda MXN, ventanas con reloj inyectado. Oferta y reserva cubren TTL + margen explícito; igualdad con el vencimiento falla de forma segura.
- Hash SHA-256 de JSON canónico y snapshot clonado/congelado. Es vínculo de contenido; no sustituye autenticación.
- `mañana` produce fecha local; hora límite explícita obligatoria. No adivinar plazos.
- QR y links modelados pero no habilitados por políticas en G1. Sin gateways, ni siquiera simulados.
- Idempotencia como función pura en G1 por petición original del usuario; persistencia y exclusión mutua quedan en G2/G3. Se usa la nomenclatura de estados detallada en contratos v1.2, sobre los nombres alternativos del plan.
- Estados y evidencia financiera: reducers confiables de dominio; firma, deduplicación duradera y conciliación pertenecen a G3/G4. Cumplimiento separado exige CONFIRMED.
- La revisión oficial corrige la metadata y `partial`; no incorpora nuevas capacidades por inferencia.

## ADR-009 — Persistencia y exclusión mutua G2
- Fecha: 2026-11-07. Estado: implementada.
- Prisma 6.19.3 fijado con SQLite local; cliente y CLI instalados en el mismo paquete de DB para resolución correcta con pnpm. No se migra a Prisma 7 durante este gate.
- Unidad de trabajo transaccional con cola por instancia, un proceso y una Database por archivo; CLI server tiene lock exclusivo por ruta. No hay garantía multiproceso por parte de la cola; índices/foreign keys/triggers son defensa adicional.
- Reserva de producto compartida entre ofertas: 30 minutos, consulta de disponibilidad descuenta reservas activas. Expiración se aplica al escribir o por mantenimiento explícito; no hay worker en G2.
- Orden, snapshot, consentimiento, auditoría, outbox interno e idempotencia se escriben atómicamente. Replays devuelven resultado histórico; mismo proposalId con nueva clave no crea otra orden.
- Slots activos de intentos deben ser orderId y únicos; UNKNOWN y excepción conservan slot hasta resolución. No se crean intentos desde HTTP en G2.
- Snapshots/consentimientos no se actualizan; audit append-only por triggers de migración. Outbox se almacena, no se despacha.
- Cliente Prisma se genera explícitamente con `pnpm db:generate` después de instalar, evitando depender de políticas de lifecycle de cada entorno. Script de migración crea archivo vacío modo 0600 si falta, sin truncar, antes de ejecutar migrate deploy: evita fallo del schema engine observado al crear DB ausente.

## ADR-010 — Identidad y aprobación comercial G2
- Fecha: 2026-11-07. Estado: implementada solo para demo local.
- Tokens aleatorios distintos por actor configurados fuera del repo; identidad no aceptada en payload. Servidor solo loopback, rechaza producción y banderas de proveedor real. No se afirma identidad o verificación de teléfono de producción.
- Propuesta persistida con reserva y hash; aprobación explícita con hash presentado. Servicio vuelve a cargar intención, comercio, cuenta, teléfono, oferta y reserva actuales antes de crear orden.
- Cambios comerciales invalidan consentimiento; stock se revalida en vivo pero su valor histórico en snapshot no cambia por otras reservas.
- `POST /evaluate` no reserva inventario y etiqueta reserva hipotética. Solo `POST /proposals` persiste reserva del comercio demo.
- Las órdenes quedan APPROVED, nunca PAID. No se expone reducer de estados ni endpoints de cobro/preparación. Sus intentos y contratos se implementan en G3.
- DB local contiene snapshot/teléfono sin cifrado, archivo privado; respuestas de orden, auditoría y outbox omiten PII. Auth pública, cifrado/retención y rate limiting antes de producción.

## ADR-011 — Una compra por intención
- Fecha: 2026-11-07. Estado: implementada en G2.
- Una intención representa una compra; puede tener propuestas alternativas pero solo una orden aprobada. Índice único Order.intentId y revalidación transaccional evitan dos aprobaciones simultáneas incluso con distintas claves/propuestas.
- Al aprobar, liberar reservas de propuestas alternativas de esa intención. Para repetir compra se crea una intención nueva. La prueba concurrente demuestra una respuesta 201, una 409 y una sola reserva activa.
