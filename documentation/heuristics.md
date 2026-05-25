# Cómo se construye la heurística en Tartu Walker

## El problema: encontrar el camino peatonal óptimo

Dado un grafo $G = (V, E)$ de intersecciones y vías de Tartu, queremos encontrar el camino de **menor coste** entre un origen $s$ y un destino $t$. El coste de cada arista no es simplemente la distancia geométrica: incluye un multiplicador $\mu$ que penaliza vías poco peatonales (carreteras principales, superficies malas) y premia vías verdes, zonas peatonales y áreas arboladas.

El algoritmo clásico para este problema es **Dijkstra**. Pero Dijkstra explora el grafo de forma radial desde el origen, sin saber en qué dirección está el destino. Esto lo hace correcto pero ineficiente: puede explorar miles de nodos que están en la dirección contraria.

**A\*** soluciona este problema añadiendo una función heurística $h(n)$ que estima cuánto falta desde cada nodo $n$ hasta $t$. En cada paso, A* prioriza los nodos para los que $f(n) = g(n) + h(n)$ es menor, donde $g(n)$ es el coste ya acumulado desde $s$ hasta $n$. Si $h$ es buena, A* se dirige directamente hacia el destino en lugar de explorar todo el grafo.

---

## ¿Qué heurística usar?

La elección de $h$ determina tanto la **eficiencia** como la **correctitud** del algoritmo.

### Opción 1: distancia haversine hasta el destino

La idea más intuitiva: estimar el coste restante como la distancia geométrica entre $n$ y $t$.

$$h_{\text{geo}}(n) = d_{\text{haversine}}(n, t)$$

**El problema:** esta heurística no conoce los multiplicadores de coste. Si el camino óptimo pasa por vías con $\mu < 1$ (bonificadas), $h_{\text{geo}}$ sobreestima el coste real y A* podría descartar rutas óptimas, dejando de ser correcto.

### Opción 2: Dijkstra desde el destino (la elegida)

En lugar de una estimación geométrica, ejecutamos **Dijkstra una vez desde $t$ sobre el mismo grafo ponderado** antes de lanzar A*. El resultado es un vector de distancias exactas:

$$h(n) = \text{dist}_t[n]$$

Esto no es una estimación: es el **coste real óptimo** de $n$ hasta $t$, calculado con la misma función de coste $c$ que usará A*. La heurística es perfecta por construcción.

---

## El pipeline completo

```
1. El usuario introduce origen y destino
         │
         ▼
2. Snapping al nodo más cercano con h[n] < ∞
   (nodo conectado al destino en el grafo ponderado)
         │
         ▼
3. A* desde el origen, usando h como oráculo
   ┌──────────────────────────────────────┐
   │  f(n) = g(n) + h(n)                 │
   │  h(n) = dist_desde_t[n]  (exacto)   │
   └──────────────────────────────────────┘
         │
         ▼
4. Reconstrucción del camino óptimo
```

La pasada de Dijkstra desde $t$ (paso 2 y precómputo de $h$) se realiza **una sola vez por consulta**, antes de lanzar A*. Su coste computacional es comparable al de una ejecución normal de Dijkstra.

---

## ¿Por qué no usar Dijkstra directamente desde el origen?

Con una heurística perfecta ($h(n) = h^{*}(n)$), A* es equivalente a Dijkstra bidireccional pero con una ventaja importante: **nunca reabre nodos**. Esto se debe a la propiedad de consistencia de $h$ (ver [admissibility.md](admissibility.md)):

$$h(u) \leq c(u, v) + h(v) \quad \forall (u,v) \in E$$

Cuando esta condición se cumple, el primer camino encontrado hasta $t$ es óptimo y cada nodo se extrae de la cola de prioridad exactamente una vez. El resultado es que A* con heurística perfecta es **al menos tan eficiente como Dijkstra** y, en la práctica, más rápido porque la información de $h$ guía la exploración hacia el destino.

La ventaja práctica en Tartu Walker es que la pasada desde el destino se puede reutilizar: si el usuario cambia el origen manteniendo el mismo destino, no hace falta recalcular $h$.

---

## Resumen comparativo

| Algoritmo | Necesita $h$ | Correcto con $\mu < 1$ | Eficiencia |
|---|---|---|---|
| Dijkstra desde $s$ | No | Sí | Explora radialmente |
| A* con $h_{\text{geo}}$ | Sí (geométrica) | **No** si $\mu < 1$ | Buena, pero incorrecta |
| A* con $h = $ Dijkstra desde $t$ | Sí (exacta) | **Sí** | Óptima (nodos sin reaperturas) |

La solución adoptada en Tartu Walker es la tercera: A* con heurística exacta obtenida por Dijkstra previo desde el destino. Combina la **correctitud garantizada** (prueba formal en [admissibility.md](admissibility.md)) con la **máxima eficiencia** que puede ofrecer A* sobre este grafo.
