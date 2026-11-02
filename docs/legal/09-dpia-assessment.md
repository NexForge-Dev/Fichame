# 09 — ¿Es obligatoria una EIPD (DPIA)? ¿Y un DPD?

> **BORRADOR — LEGAL REVIEW REQUIRED BEFORE PRODUCTION.**

## 1. EIPD (art. 35 RGPD)

### Criterios analizados

Referencias: art. 35.1 y 35.3 RGPD; Directrices WP248 rev.01 del GT29 (ratificadas por el EDPB), que indican que, como regla general, un tratamiento que cumple **dos o más** criterios probablemente requiere EIPD; y la **lista de la AEPD** de tratamientos que requieren EIPD (art. 35.4) — *verificar la versión vigente y su redacción exacta*.

| Criterio | ¿Se cumple hoy? | Motivo |
|---|---|---|
| Evaluación o puntuación / perfilado | **No** | No hay ranking, scoring ni IA ([05](05-ai-recruitment-risk.md)) |
| Decisiones automatizadas con efectos | **No** | Toda decisión es humana |
| Observación sistemática | **No** | — |
| Categorías especiales o datos muy personales | **Posible** | No se piden, pero los CV y las observaciones pueden contenerlos |
| Gran escala | **Incierto** | Por negocio es pequeño; a nivel de plataforma (encargado) depende del crecimiento |
| Combinación de conjuntos de datos | **No** | Datos aislados por negocio |
| **Interesados vulnerables** | **Probable** | WP248 menciona a los empleados por el desequilibrio de poder; los candidatos a un empleo están en una posición similar |
| Tecnología innovadora | **No** significativa | Código QR como acceso a un formulario |
| Impide ejercer un derecho o acceder a un servicio/contrato | **Posible** | La selección determina el acceso a un empleo |

### Conclusión técnica

Se cumplen **probablemente dos criterios** (interesados en situación de desequilibrio + tratamiento que condiciona el acceso a un contrato; potencialmente datos sensibles en CV). **No puede descartarse la obligación.** Recomendación conservadora: **realizar una EIPD antes del lanzamiento comercial**, al menos para el tratamiento A (candidaturas), que sirva a los negocios clientes (responsables) — el encargado debe ayudar (art. 28.3.f). La [evaluación de riesgos](../security/data-protection-risk-assessment.md) es el insumo técnico.

**Obligatoria en todo caso** si se activa: IA/ranking/matching, pool entre negocios, monitorización, o escala grande.

## 2. Delegado de Protección de Datos (art. 37 RGPD; art. 34 LOPDGDD)

- **Art. 37.1.b/c RGPD**: obligatorio si la *actividad principal* consiste en operaciones que requieran observación habitual y sistemática a gran escala, o tratamiento a gran escala de categorías especiales. Hoy: **no parece** cumplirse (no hay observación sistemática ni tratamiento deliberado de categorías especiales), **pero** la actividad principal de Fíchame *sí es* tratar datos de candidatos por cuenta de terceros, y la escala puede crecer. *LEGAL REVIEW REQUIRED.*
- **Art. 34.1 LOPDGDD**: enumera entidades obligadas (colegios profesionales, centros docentes, entidades financieras, aseguradoras, prestadores de servicios de la sociedad de la información que elaboren **a gran escala perfiles**, entre otras). Según nuestra lectura **no incluye expresamente** plataformas de candidaturas ni agencias de colocación — *verificar la lista completa y vigente*.
- **Negocios clientes**: en general (restaurantes, tiendas) **no** estarán obligados por su actividad de selección; no inventar una obligación.
- **Conclusión**: no designado. Revisar al alcanzar escala, si [01](01-analisis-agencia-colocacion.md) concluye que es agencia, o si se activa IA. Designación voluntaria posible (art. 37.4 RGPD; la LOPDGDD también la contempla — *verificar artículo*).
