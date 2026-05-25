# Admissibilidad de la heurística en Tartu Walker

## 1. Definiciones previas

### Grafo de búsqueda

Sea $G = (V, E)$ un grafo dirigido donde:

- $V$ es el conjunto de nodos OSM (intersecciones y puntos de vía).
- $E \subseteq V \times V$ es el conjunto de aristas, cada una con coste:

$$c(u, v) = d(u, v) \cdot \mu(u, v), \quad \mu(u,v) \geq \mu_{\min} > 0$$

donde $d(u,v)$ es la distancia haversine entre los nodos y $\mu(u,v)$ es el multiplicador de coste calculado por `GraphBuilder._mult(tags)`:

$$\mu(u,v) = \max\!\left(\mu_{\min},\; 1.0 + \sum_{i} \delta_i\right)$$

Los deltas $\delta_i$ pueden ser positivos (penalizaciones) o negativos (bonificaciones), pero $\mu_{\min} = 0.1$ garantiza que el coste de toda arista sea estrictamente positivo.

### Camino óptimo y coste real

Dado un nodo origen $s$ y un nodo destino $t$, el **coste real óptimo** $h^*(n)$ de un nodo $n$ hacia $t$ se define como:

$$h^*(n) = \min_{\pi: n \rightsquigarrow t} \sum_{(u,v) \in \pi} c(u,v)$$

donde el mínimo se toma sobre todos los caminos $\pi$ en $G$ desde $n$ hasta $t$.

---

## 2. La heurística utilizada

La función heurística $h(n)$ se obtiene ejecutando el **algoritmo de Dijkstra desde el destino** sobre el mismo grafo ponderado $G$:

```
dijkstraFromDest(G, t):
    dist[t] = 0
    para cada nodo n ≠ t:  dist[n] = ∞
    mientras la cola no esté vacía:
        u = extraer nodo con dist[u] mínimo
        para cada arista (u, v) con coste c(u,v):
            si dist[u] + c(u,v) < dist[v]:
                dist[v] = dist[u] + c(u,v)
    devolver dist
```

El resultado es que $h(n) = \text{dist}[n]$ para todo $n \in V$.

---

## 3. Demostración de admisibilidad

**Teorema.** La heurística $h$ es admisible, es decir:

$$\forall n \in V: \quad h(n) \leq h^*(n)$$

**Demostración.**

Por la correctitud del algoritmo de Dijkstra sobre grafos con costes de arista estrictamente positivos (condición garantizada por $\mu_{\min} > 0$), se cumple que, al terminar, $\text{dist}[n]$ contiene el coste mínimo de $n$ a $t$ en $G$.

Formalmente, Dijkstra computa el camino de coste mínimo en el mismo grafo $G$ con la misma función de coste $c$. Por tanto:

$$h(n) = \text{dist}[n] = \min_{\pi: n \rightsquigarrow t} \sum_{(u,v) \in \pi} c(u,v) = h^*(n)$$

La desigualdad de admisibilidad se satisface con **igualdad**:

$$h(n) = h^*(n) \leq h^*(n) \quad \checkmark$$

$\blacksquare$

---

## 4. Resultado más fuerte: consistencia

La heurística es además **consistente** (condición más fuerte que la admisibilidad). Una heurística es consistente si para toda arista $(u, v) \in E$:

$$h(u) \leq c(u, v) + h(v)$$

**Demostración.**

Dado que $h(u) = h^*(u)$ es el coste mínimo de $u$ a $t$, y el camino óptimo puede pasar por $v$:

$$h^*(u) \leq c(u, v) + h^*(v)$$

Sustituyendo $h = h^*$:

$$h(u) \leq c(u, v) + h(v) \quad \checkmark$$

La desigualdad triangular del coste óptimo garantiza la consistencia directamente.

---

## 5. Por qué las bonificaciones no afectan a la admisibilidad

Un error conceptual frecuente es asumir que las bonificaciones (multiplicadores $\mu < 1$) violan la admisibilidad. Esto solo sería cierto si la heurística fuera la **distancia geométrica** (euclídea o haversine), porque en ese caso:

$$h_{\text{euclid}}(n) = d(n, t) > c^*(n \rightsquigarrow t) \quad \text{si } \mu < 1 \text{ en el camino óptimo}$$

lo que produciría una sobreestimación.

Sin embargo, la heurística aquí utilizada no es la distancia geométrica: es el resultado de **Dijkstra sobre el mismo espacio de coste** en el que opera A*. Por tanto, el "coste real" $h^*$ y la heurística $h$ están definidos en el mismo espacio métrico ponderado, y la igualdad $h(n) = h^*(n)$ se mantiene independientemente de si los multiplicadores son mayores o menores que 1.

En resumen:

| Heurística | ¿Admisible con bonificaciones? | Motivo |
|---|---|---|
| Distancia euclídea / haversine | **No** | Puede sobreestimar si $\mu < 1$ |
| Dijkstra sobre el grafo real | **Sí** | $h(n) = h^*(n)$ por construcción |

---

## 6. Consecuencia algorítmica

Al ser $h$ consistente, A* con esta heurística satisface las siguientes garantías:

1. **Optimalidad**: el primer camino encontrado hasta $t$ es óptimo en la función de coste $c$.
2. **Eficiencia**: cada nodo es extraído de la cola de prioridad **como mucho una vez**, equivalente a una única ejecución de Dijkstra desde $s$.
3. **Sin reaperturas**: la consistencia elimina la posibilidad de que un nodo deba ser revisitado con un coste menor.

La implementación es por tanto equivalente en coste computacional a Dijkstra bidireccional, pero con la ventaja de que la pasada desde el destino se reutiliza como oráculo perfecto para guiar la búsqueda desde cualquier origen.

---

## Referencias

- Hart, P. E., Nilsson, N. J., & Raphael, B. (1968). *A formal basis for the heuristic determination of minimum cost paths*. IEEE Transactions on Systems Science and Cybernetics, 4(2), 100–107.
- Russell, S., & Norvig, P. (2020). *Artificial Intelligence: A Modern Approach* (4th ed.). Pearson. §3.5.
- Dijkstra, E. W. (1959). *A note on two problems in connexion with graphs*. Numerische Mathematik, 1, 269–271.
