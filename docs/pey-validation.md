# Pey — Matriz de validación G0

**Fecha:** 2026-11-07. **Estado:** documentación pública revisada. Ninguna llamada autenticada, cuenta operativa ni pago real se verificó en este paquete.

| Capacidad | Evidencia documental | Evidencia operativa | Pendiente |
|---|---|---|---|
| CoDi Push `POST /codi/pn` | ✅ contrato y respuesta | ❌ no se ha llamado | API key habilitada, teléfono enrolado, pago controlado |
| CoDi QR `POST /codi/qr` | ✅ contrato | ❌ no se ha llamado | Render y comportamiento multipago |
| `POST /bank-account` | ✅ registro vía API | ❌ no se ha llamado | titularidad y permisos de multi-comercio |
| `GET /bank-account/:id` | ✅ consulta status | ❌ no se ha llamado | cuenta ACTIVE propia/merchant |
| Payment Link create/update/get | ✅ contratos | ❌ no se ha llamado | habilitación, fees, métodos, destino de fondos |
| Transaction `GET /transaction/:id` | ✅ PENDING/PAID | ❌ no se ha llamado | comportamiento real de 404/tardíos |
| Transaction list API key / bank / QR | ✅ `nextToken` y paginación | ❌ no se ha llamado | exhaustividad y frecuencia de conciliación |
| Webhooks Standard Webhooks | ✅ firma y `webhook-id` | ❌ no se ha recibido | secreto y HTTPS público |
| 4 eventos publicados | ✅ payloads | ❌ no se ha recibido | orden y reintentos de entrega |
| Entorno dedicado de pruebas | ⚠️ anunciado como próximo | ❌ no disponible/validado | usar mocks; prod solo previa autorización |

## Dudas abiertas — preguntas para pey

**P0 (responder antes de G4 real):**
1. ¿Existe clave idempotente en `POST /codi/pn`? Si no, ¿cómo rastrear un intento HTTP cuyo response se pierde antes de obtener `transactionId`?
2. ¿Se expone evento de push rechazado, expirado, no entregado o leído, fuera de `payment_received`? ¿Cómo se recupera esa información?
3. ¿Cuál es la política real de vencimiento y confirmaciones tardías de un CoDi Push?
4. ¿Cuál es la firma/secreto oficial por API key y cómo se prueban reintentos de webhooks?
5. ¿La cuenta receptora y el pagador habilitados están disponibles para un pago real explícitamente autorizado de un centavo?

**P1 (antes de multi-comercio y links):**
6. ¿Las CLABEs registradas programáticamente pueden pertenecer a **terceros comerciantes** bajo una API key administrada por AgentPay? ¿Qué contratos, KYB/KYC y consentimientos exige pey?
7. ¿Cómo se realiza autorización del titular para registrar cuentas de terceros, y qué ocurre ante cambios/desactivación?
8. ¿Payment Links permiten dirigir el cobro a cuentas CoDi registradas por terceros? Su request público **no** muestra `bankAccountId`; no prometerlo.
9. ¿Qué tarifas, cuotas y comisiones aplican por CoDi, tarjetas, Apple Pay y Google Pay? ¿Cómo distinguir `amountBreakdown`, `fee` y `applicationFee` contablemente?
10. ¿Existen APIs privadas para reembolsos o cancelación de links/QR? No incluirlas hasta contrato.

## Riesgos

- Registrar una cuenta puede tomar hasta 5 días hábiles; sin `ACTIVE`, no puede recibir CoDi.
- Una API key se vincula en el portal a una cuenta de pago CoDi y/o una cuenta Stripe; varias cuentas por API requieren revisar permisos y ownership.
- La documentación recomienda probar directamente en producción con $0.01 MXN. La cuenta de prueba publicada pertenece a un tercero y los fondos no son recuperables; no generar ni transferir pagos como parte de esta tarea.
- Crear push, QR o link **no confirma cobro**; verificar evento o consulta.
- Bancos, disponibilidad del proveedor y métodos de Payment Links pueden variar de acuerdo con habilitación.

## Entrega G0

**G0-D (documental): COMPLETO para los endpoints públicos conocidos.** Ver `docs/pey-capabilities.md` y `docs/pey-adapter-contracts.md`.

**G0-R (operativo): BLOQUEADO / NO INICIADO.** Falta acceso al portal/credenciales, cuenta ACTIVE, teléfono CoDi, endpoint webhook y prueba real autorizada.

Fuentes: enlaces oficiales listados en `docs/pey-capabilities.md`.
