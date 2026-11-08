# Fase 5 — Agente OpenAI (Gate G5)

**Precondición:** G3 aprobado, preferentemente G4 si hay entorno real.

## Trabajo
- [x] Interpretación de intención con salida estructurada y validación Zod.
- [x] Herramientas explícitas y limitadas: consultar catálogo, obtener oferta y proponer orden; no otorgar herramienta de cobro al modelo.
- [x] Resolver fecha de entrega relativa con timezone explícito; pedir aclaraciones cuando un dato crucial falta.
- [x] Catalogar prompt injection procedente de fichas de producto, nombres de merchant y mensajes externos.
- [x] Evaluación de política determinista posterior a interpretación y selección.
- [x] Tests de salida inválida, inyección, cantidad/precio inventados y ausencia de oferta.

## G5
- [x] Prompt de "2 kg de café por máximo $1,000 mañana" genera intención y propuesta, sin ejecutar pago.
- [x] La propuesta superior al presupuesto es rechazada por core independientemente de lo que afirme la IA.

## Estado de implementación

Contrato de intérprete OpenAI, grounding determinista, capacidades reducidas y endpoint autenticado con AgentRun/idempotencia implementados. Criterios anteriores verificados con respuestas ficticias; no se declara todavía evaluación con modelo real aprobada. Pendiente configurar una clave/modelo OpenAI y autorizar una prueba acotada. Sin frontend ni herramientas de cobro. Ver docs/g5-shopping-agent.md y docs/pey-pendientes.md.
