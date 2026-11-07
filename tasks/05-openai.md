# Fase 5 — Agente OpenAI (Gate G5)

**Precondición:** G3 aprobado, preferentemente G4 si hay entorno real.

## Trabajo
- [ ] Interpretación de intención con salida estructurada y validación Zod.
- [ ] Herramientas explícitas y limitadas: consultar catálogo, obtener oferta y proponer orden; no otorgar herramienta de cobro al modelo.
- [ ] Resolver fecha de entrega relativa con timezone explícito; pedir aclaraciones cuando un dato crucial falta.
- [ ] Catalogar prompt injection procedente de fichas de producto, nombres de merchant y mensajes externos.
- [ ] Evaluación de política determinista posterior a interpretación y selección.
- [ ] Tests de salida inválida, inyección, cantidad/precio inventados y ausencia de oferta.

## G5
- [ ] Prompt de "2 kg de café por máximo $1,000 mañana" genera intención y propuesta, sin ejecutar pago.
- [ ] La propuesta superior al presupuesto es rechazada por core independientemente de lo que afirme la IA.
