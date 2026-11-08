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

## ADR-012 — Envío en tres pasos y resultado incierto
- Fecha: 2026-11-07. Implementada en G3.
- Persistir intento, slot activo, referencia y respuesta 202 antes del gateway. La llamada se realiza fuera de transacción DB; un replay no vuelve a invocarla. Se bloquea cualquier segundo intento de la orden en G3.
- Error de envío/respuesta perdida deja UNKNOWN. Al reiniciar, SUBMISSION_PENDING/CREATED huérfanos se tratan como inciertos, sin reenviar. Ledger durable propio del simulador permite recuperar una transacción aceptada; no se atribuye esta capacidad a pey.
- Se acepta una confirmación verificada mientras el recibo de creación está en vuelo; no se rebaja luego a pendiente. Las transiciones del core contemplan callback temprano y recuperación de excepción por evidencia correcta.

## ADR-013 — Protocolo mock aislado y efectos financieros
- Fecha: 2026-11-07. Implementada solo para desarrollo local.
- HMAC de desarrollo sobre cuerpo crudo, namespace mock, ventana de cinco minutos y secreto independiente. No es implementación de Standard Webhooks ni wire contract pey.
- Conciliar importe entero exacto, moneda, orden, intento, cuenta interna, API key ID mock, referencia y transacción. UNKNOWN exige vínculo a ledger mock independiente de metadata del evento. Deduplicar entrega y efecto por transacción.
- Evidencia financiera y cumplimiento separados: pago válido tardío confirma intento/transacción, pero orden EXCEPTION si no hay reserva/capacidad. Una compra pagada o bien consume inventario/reserva atómicamente, o alerta excepción; no se devuelve dinero automáticamente.
- Controles de confirmación/rechazo/dispatch requieren token operador separado, no son permisos del comprador. Producción/proveedor real rechazados.

## ADR-014 — Outbox con entrega local idempotente
- Fecha: 2026-11-07. Implementada en G3.
- Lease de 30 s, token de reclamación y reintentos exponenciales hasta 60 s. Sink simulado es MerchantNotification con eventId único. Confirmar entrega después de persistir bandeja; recuperable ante crash en medio.
- Solo MOCK_ORDER_PAID / MOCK_FULFILLMENT_EXCEPTION producen notificación de pago/alerta. ORDER_APPROVED_INTERNAL no autoriza preparación.
- Worker en servidor local cada segundo; pruebas y demos pueden despachar explícitamente. No se contacta un canal externo ni se afirma exactly-once externo.
- Migración G3 añade columnas/tablas y reconstruye solo OutboxEvent para su default temporal; preserva snapshots, consentimiento y triggers. Test de upgrade con datos G2 valida continuidad.

## ADR-015 — Receptor público aislado y bandeja cifrada
- Fecha: 2026-11-07. G4 parcial autorizado para URL.
- Puerto/receptor exclusivo para salud y webhook pey. No se publica Fastify API comercial ni rutas mock. Quick Tunnel temporal para desarrollo, procesos locales administrados por PID e identidad.
- SDK standardwebhooks oficial en lugar del HMAC mock de G3. Verificar raw body y cabeceras antes de almacenar; sin secreto del portal, rechazar con 503.
- PeyWebhookInbox separada, payload cifrado AES-256-GCM con clave local independiente. Logs apagados; no persistir cuerpos bancarios crudos en auditoría. Dedup entrega/hash, acuse solo tras commit.
- Cada registro queda VERIFIED_PENDING_RECONCILIATION; no se transforma en pago ni entrega de producto. La conciliación real y el transporte financiero están fuera de esta autorización de URL.
- Configuración privada 0600 recargada por solicitud; incluye teléfono proporcionado sin replicarlo a fixtures ni repositorio. Secretos se introducen en terminal con entrada oculta, no en chat.

## ADR — Prueba operativa aislada con cuenta vinculada (2026-11-07)

Tras autorización explícita de un centavo hacia la cuenta pública de pruebas y verificación visible del vínculo en portal, se permite una solicitud diagnóstica aislada sin bankAccountId, opción documentada de pey. No se elimina la exigencia de cuenta/identificadores del servicio comercial. El diagnóstico no consume inventario, no crea órdenes ficticias, no confirma pagos y no habilita pagos generales. El marcador exclusivo previo al HTTP bloquea cualquier reenvío incluso ante errores ambiguos. La evidencia bancaria y metadatos permanecen privados. G4-R comercial continúa pendiente.

## ADR-016 — Recuperar identificador perdido por consulta autenticada

Fecha 2026-11-07. Implementada en G4 con fixtures tras observar recuperación manual en pruebas bancarias. Se usa el endpoint documentado GET /transaction/api-key; no se supone idempotencia upstream ni se reenvía POST. Se comparan orden/intento/entorno exactos y se exigen método, tipo e importe. Debe completarse el listado dentro de cinco páginas/80 registros y límites de tamaño; no devolver un candidato parcial ni elegir entre varios IDs.

El descubrimiento solo vincula un recurso: no acredita PAID ni beneficiario. Se conserva la consulta individual, verificación de cuenta y liquidación atómica existentes. Ante callback concurrente, mismo ID reutilizable y distinto ID conflictivo, sin reemplazar pago confirmado. Un 404 o discrepancia del beneficiario no se transforma en éxito por confianza en metadata. No se consume inventario ni entrega notificación hasta completar todos los controles. La paginación no garantiza snapshot estable del proveedor; se limita la automatización al perfil local y se conserva conciliación individual, deduplicación y manejo de conflicto.
