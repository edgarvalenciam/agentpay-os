# Fase 2 — API y persistencia (Gate G2)

**Precondición:** G1 aprobado.

## Trabajo
- [ ] Fastify + Zod; rutas internas del plan maestro; errores estables y contrato OpenAPI propio si es sencillo.
- [ ] Persistencia SQLite local / Prisma en un solo proceso; migraciones y seeds de café controlados.
- [ ] Modelar `MerchantPaymentAccount`, `Order`, `OrderSnapshot`, `ConsentRecord`, `PaymentAttempt`, `ProviderResource`, `ProviderTransaction`, `PaymentEvent`, `AuditEvent`, `OutboxEvent`.
- [ ] Un índice único para `provider + resourceType + resourceId` y otro para transacción externa; permitir `ProviderResource` 1:N `ProviderTransaction`.
- [ ] Clave de idempotencia propia con hash de request y conflicto si se reutiliza con payload diferente.
- [ ] Auth mínima para demo sin suplantación de comercio; políticas de acceso por merchant. No exponer datos sensibles.
- [ ] Endpoints de creación y consulta de intención/orden/eventos; sin conectar pey.

## G2
- [ ] Una orden válida persiste y se reconsulta tras reinicio.
- [ ] Concurrencia simulada no genera dos órdenes aprobadas ni dos intentos reservados.
- [ ] Tests unitarios/integración verdes; comandos y diferencias documentados.
