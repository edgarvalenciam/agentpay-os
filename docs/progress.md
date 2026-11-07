# Registro de avance — AgentPay OS

**Última actualización documental:** 2026-11-07 (v1.2)

| Fase | Estado | Evidencia | Bloqueo |
|---|---|---|---|
| 0 — Pey documental (G0-D) | Documentación revisada | `docs/pey-capabilities.md`; `docs/pey-validation.md` | Sin pruebas autenticadas |
| 0 — Pey operativo (G0-R) | NO INICIADO | — | credenciales, cuenta ACTIVE, pagador y consentimiento |
| 1 — Core (G1) | APROBADO | 47 tests; typecheck sin errores | Ninguno para G1 |
| 2 — API/DB (G2) | APROBADO | 72 tests, typecheck, 3 migraciones y demo HTTP | Local, un proceso; sin pagos |
| 3 — Mock/conciliación (G3) | NO INICIADA | — | — |
| 4 — Pey real (G4) | NO INICIADA | — | G0-R pendiente |
| 5 — OpenAI (G5) | NO INICIADA | — | — |
| 6 — Frontend (G6) | NO INICIADA | — | — |
| 7 — E2E/demo (G7) | NO INICIADA | — | — |

**El paquete original era documental. La implementación del 2026-11-07 añade core ejecutable y pruebas; no añade integración financiera.**

## Evidencias por ejecución

Codex debe anexar para cada gate: fecha, archivos modificados, comandos ejecutados, pruebas pasadas/fallidas, capturas o salidas sanitizadas, asuntos pendientes, decisión de avanzar o detenerse. No marcar `[x]` sin evidencia.

## Ejecución 2026-11-07 — G0-D y G1

- Base: ZIP AgentPay-v1_2 y cinco TXT complementarios idénticos al contenido correspondiente del ZIP.
- Commit base: `32ec9ea` — importación íntegra del starter v1.2. Commit de implementación: consultar `git log -1` (el registro se incluye en ese mismo commit).
- Archivos: configuración pnpm/TypeScript y lockfile; `packages/core/src/{models,policies,orders,payments,index}.ts`; `packages/core/tests/core.test.ts`; arquitectura, roadmap, AGENTS y revisión pey actualizados.
- G0-D: contraste independiente de OpenAPI y documentación pública; diferencias registradas en `pey-review-2026-11-07.md`.
- `pnpm install`: aprobado tras habilitar únicamente build de esbuild. Incidencias iniciales resueltas: red restringida, configuración allowBuilds requerida y Node ausente del PATH de la terminal. Se usó el Node incluido en el runtime de Codex añadiendo su carpeta al PATH de esta sesión; no se modificó la configuración del equipo.
- `pnpm test`: **47/47 aprobadas**, 1 archivo. Primera ejecución: 45/46, fallo de una aserción que contaba checks; sustituida por la comprobación de aprobación de cada check. Se agregó prueba de cumplimiento tras confirmar pago; última ejecución 47/47.
- `pnpm typecheck`: **aprobado**, salida 0, TypeScript strict.
- `git diff --check`: aprobado tras retirar espacios finales de una línea del roadmap. Instalación con `--frozen-lockfile`, 47 tests y typecheck repetidos al cierre con salida 0.
- Evidencia: $850 frente a presupuesto $1,000 elegible; $1,200 rechazado; ausencia/cambio de datos críticos rechazada; consentimiento se invalida ante cambio de precio, producto, entrega, cuenta, teléfono, intención, método o versión; snapshot congelado; replay estable y conflicto idempotente; sin resubmission tras UNKNOWN; cumplimiento bloqueado antes de confirmación.
- G1 aprobado. No iniciar Fase 2 en esta entrega. No existen HTTP, DB, proveedores mock/reales, OpenAI ni frontend.
- Riesgo pendiente: idempotencia durable, concurrencia, firma y conciliación requieren G2/G3/G4; pruebas unitarias no demuestran operación bancaria. No se usaron credenciales ni se generaron cobros.
- G0-R sigue bloqueado por habilitación/cuenta/pagador y autorización financiera explícita; no impide aprobar el dominio G1.

## Ejecución 2026-11-07 — Fase 2 / G2

- Autorización: usuario indicó avanzar tras definir Fase 2. Base local `a303c2f` (G1); implementación G2 registrada en el siguiente commit, consultar historial por mensaje `feat(api): complete G2 transactional API and persistence`.
- Entregables: `apps/api` (Fastify, auth por actor, servicio transaccional y servidor loopback), `packages/contracts` (Zod), `packages/database` (Prisma/SQLite, 19 modelos, tres migraciones, seed no destructivo, unidad de trabajo), scripts de migración/demo; roadmap, AGENTS, arquitectura y contratos actualizados.
- Operaciones: crear/consultar intención, listar/evaluar ofertas, reservar propuesta, aprobar orden ligada a hash, consultar orden/eventos y listar órdenes del comercio. No hay endpoints de cobro o preparación.
- Persistencia atómica: orden/snapshot/consentimiento/auditoría/outbox interno/respuesta idempotente. Duplicados sobreviven al reinicio; payload distinto genera 409. Una orden por intención; concurrencia sobre propuestas alternativas produce 201/409 sin duplicar compra.
- Integridad: unicidad de slot activo de intento por orden, recursos por proveedor/tipo/id y transacciones por proveedor/id; recurso permite múltiples transacciones. Triggers impiden actualizar snapshot/consentimiento y alterar/borrar auditoría. Tests de pagos son solo inserts sintéticos para probar constraints, no gateway mock.
- Comandos reales aprobados: `pnpm install --frozen-lockfile`; `pnpm db:generate`; `pnpm db:migrate` (3 migraciones aplicadas de forma incremental, sin reset); `pnpm db:seed`; `pnpm typecheck` (salida 0); `pnpm test` (**72/72**, 47 core + 25 integración); `pnpm demo` (HTTP real loopback, repetición, reinicio, cuatro eventos, cero intentos financieros); `git diff --check`.
- Pruebas adversas: suplantación mediante body; acceso ajeno de compradores/comercios; duplicados simultáneos; stock compartido; timeout/UNKNOWN del core; monto $1,200 rechazado; precio/beneficiario/teléfono/versión/merchant/cuenta cambiados; reserva vencida; rollback; evidencia inmutable; seed repetido; lifecycle CLI y rechazo de segunda instancia.
- Incidencias resueltas: primera instalación bloqueada por red del entorno; instalación posterior autorizada y completada. Prisma no resolvía cliente por disposición pnpm: CLI y cliente instalados juntos en paquete database. Engine de migraciones fallaba al crear archivo ausente: wrapper crea archivo vacío 0600 sin truncar. Primeras 19 pruebas de integración fallaron por ese arranque, luego 19/19, 23/23 y finalmente 25/25 tras agregar restricciones y ciclo del servidor. No se ocultan fallos como éxitos de integración bancaria.
- Privacidad: tokens fuera del repo y teléfonos demo sintéticos; orden/eventos/outbox no exponen teléfono, texto libre ni datos bancarios. HTTP/Prisma sin logs. DB local no cifrada; no apto para datos reales/producción.
- G2 aprobado; G3 no iniciado. No frontend, OpenAI, llamadas pey, webhooks operativos, envío de pagos ni credenciales reales. No se publicó a remoto.
- Bloqueos para G2: ninguno. Límites: SQLite local un proceso, seed/CLI con servidor detenido, lock residual tras cierre forzado se revisa manualmente, auth solo demo, listados limitados a 100 sin paginación todavía. Outbox no despachado. Próximo gate G3 implementa mock explícito, conciliación y despacho idempotente; G0-R sigue pendiente para pagos reales.
