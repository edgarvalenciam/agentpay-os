# Registro de avance — AgentPay OS

**Última actualización documental:** 2026-11-07 (v1.2)

| Fase | Estado | Evidencia | Bloqueo |
|---|---|---|---|
| 0 — Pey documental (G0-D) | Documentación revisada | `docs/pey-capabilities.md`; `docs/pey-validation.md` | Sin pruebas autenticadas |
| 0 — Pey operativo (G0-R) | NO INICIADO | — | credenciales, cuenta ACTIVE, pagador y consentimiento |
| 1 — Core (G1) | APROBADO | 47 tests; typecheck sin errores | Ninguno para G1 |
| 2 — API/DB (G2) | NO INICIADA | — | — |
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
