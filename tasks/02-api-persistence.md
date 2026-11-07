# Fase 2 — API y persistencia (Gate G2)

**Precondición:** G1 aprobado.

## Trabajo
- [x] Fastify + Zod; rutas internas del plan maestro; errores estables y contrato OpenAPI propio si es sencillo.
- [x] Persistencia SQLite local / Prisma en un solo proceso; migraciones y seeds de café controlados.
- [x] Modelar `MerchantPaymentAccount`, `Order`, `OrderSnapshot`, `ConsentRecord`, `PaymentAttempt`, `ProviderResource`, `ProviderTransaction`, `PaymentEvent`, `AuditEvent`, `OutboxEvent`.
- [x] Un índice único para `provider + resourceType + resourceId` y otro para transacción externa; permitir `ProviderResource` 1:N `ProviderTransaction`.
- [x] Clave de idempotencia propia con hash de request y conflicto si se reutiliza con payload diferente.
- [x] Auth mínima para demo sin suplantación de comercio; políticas de acceso por merchant. No exponer datos sensibles.
- [x] Endpoints de creación y consulta de intención/orden/eventos; sin conectar pey.

## G2
- [x] Una orden válida persiste y se reconsulta tras reinicio.
- [x] Concurrencia simulada no genera dos órdenes aprobadas ni dos intentos reservados.
- [x] Tests unitarios/integración verdes; comandos y diferencias documentados.

Contrato en Markdown y Zod, sin OpenAPI duplicado manualmente. G2 no expone cobros: la idempotencia durable cubre intención/propuesta/orden; la ruta financiera se incorporará en G3. 72 pruebas aprobadas, incluida concurrencia y reinicio.
