import Collision from '../models/collision'
import Point from '../models/point'
import Shape from '../models/shape'

/**
 * Interpolazione lineare tra due valori
 * @param start - Valore iniziale
 * @param end - Valore finale
 * @param slice - Fattore di interpolazione (0-1, dove 0=start, 1=end)
 * @returns Il valore interpolato tra start e end
 * @example lerp(0, 10, 0.5) // Returns 5
 */
export const lerp = (start: number, end: number, slice: number) => {
    return start + (end - start) * slice
}

/**
 * Calcola l'intersezione tra due linee rappresentate come Shape
 * @param A - Prima linea (Shape con due punti)
 * @param B - Seconda linea (Shape con due punti)
 * @returns Oggetto Collision con punto di intersezione e parametro t, o null se non si intersecano
 * @description Usa l'algoritmo parametrico per trovare l'intersezione tra due segmenti di linea
 */
export const getIntersection = (A: Shape, B: Shape) => {
    const tTop =
        (B.getLast().getX() - B.getFirst().getX()) * (A.getFirst().getY() - B.getFirst().getY()) -
        (B.getLast().getY() - B.getFirst().getY()) * (A.getFirst().getX() - B.getFirst().getX())
    const uTop =
        (B.getFirst().getY() - A.getFirst().getY()) * (A.getFirst().getX() - A.getLast().getX()) -
        (B.getFirst().getX() - A.getFirst().getX()) * (A.getFirst().getY() - A.getLast().getY())
    const bottom =
        (B.getLast().getY() - B.getFirst().getY()) * (A.getLast().getX() - A.getFirst().getX()) -
        (B.getLast().getX() - B.getFirst().getX()) * (A.getLast().getY() - A.getFirst().getY())

    if (bottom != 0) {
        const t = tTop / bottom
        const u = uTop / bottom
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return new Collision(
                new Point(
                    lerp(A.getFirst().getX(), A.getLast().getX(), t),
                    lerp(A.getFirst().getY(), A.getLast().getY(), t),
                ),
                t,
            )
        }
    }

    return null
}

/**
 * Verifica se due poligoni si intersecano
 * @param A - Primo poligono (Shape con più punti)
 * @param B - Secondo poligono (Shape con più punti)
 * @returns true se i poligoni si intersecano, false altrimenti
 * @description Controlla ogni lato del primo poligono contro ogni lato del secondo
 */
export const checkPolygonsIntersection = (A: Shape, B: Shape) => {
    for (let i = 0; i < A.getPoints().length; i++) {
        const lineOfA = new Shape(A.getPoints()[i], A.getPoints()[(i + 1) % A.getPoints().length])
        for (let j = 0; j < B.getPoints().length; j++) {
            const lineOfB = new Shape(
                B.getPoints()[j],
                B.getPoints()[(j + 1) % B.getPoints().length],
            )
            const collision = getIntersection(lineOfA, lineOfB)
            if (collision) {
                return true
            }
        }
    }
    return false
}

/**
 * Normalizza un valore da un range ad un altro range
 * @param value - Valore da normalizzare
 * @param min - Valore minimo del range originale
 * @param max - Valore massimo del range originale
 * @param newMin - Valore minimo del nuovo range
 * @param newMax - Valore massimo del nuovo range
 * @returns Valore normalizzato nel nuovo range, limitato tra newMin e newMax
 * @example normalize(5, 0, 10, 0, 100) // Returns 50
 */
export const normalize = (
    value: number,
    min: number,
    max: number,
    newMin: number,
    newMax: number,
): number => {
    const oldScale = max - min
    const newScale = newMax - newMin
    const result = Math.min(newMax, Math.max(newMin, ((value - min) / oldScale) * newScale))
    return result
}

/**
 * Normalizza un valore e lo converte in formato esadecimale a 2 cifre
 * @param value - Valore da normalizzare
 * @param min - Valore minimo del range originale
 * @param max - Valore massimo del range originale
 * @returns Stringa esadecimale a 2 cifre (00-FF)
 * @example normalizeToHex(128, 0, 255) // Returns "80"
 */
export const normalizeToHex = (value: number, min: number, max: number): string => {
    const normalizedValue = Math.floor(normalize(value, min, max, 0, 255))
    return normalizedValue.toString(16).padStart(2, '00')
}

/**
 * Calculates the weighted average of a collection of values.
 *
 * @param values - An array of objects containing value and weight pairs
 * @returns The weighted average of all provided values
 */
export const weightedAverage = (...values: Array<{ value: number; weight: number }>): number => {
    let sumValues = 0
    let sumWeights = 0

    for (let item of values) {
        sumValues += item.value * item.weight
        sumWeights += item.weight
    }

    return sumValues / sumWeights
}

/**
 * Funzione di attivazione sigmoide
 * @param sum - Somma pesata degli input
 * @param bias - Valore di bias da aggiungere
 * @returns Valore tra 0 e 1, calcolato come 1/(1 + e^(-(sum + bias)))
 * @description Funzione smooth per attivazione graduale nelle reti neurali
 */
export const sigmoid = (sum: number, bias: number) => 1 / (1 + Math.exp(-(sum + bias)))

/**
 * Funzione di attivazione a soglia (step function)
 * @param sum - Somma pesata degli input
 * @param bias - Valore di soglia
 * @returns 1 se sum > bias, altrimenti 0
 * @description Funzione binaria per attivazione tutto-o-niente
 */
export const threshold = (sum: number, bias: number) => (sum > bias ? 1 : 0)

/**
 * Funzione di attivazione tangente iperbolica
 * @param sum - Somma pesata degli input
 * @param bias - Valore di bias da aggiungere
 * @returns Valore tra -1 e 1, calcolato come (e^x - e^(-x))/(e^x + e^(-x)) dove x = sum + bias
 * @description Funzione smooth simmetrica, ideale per reti neurali
 */
export const tanh = (sum: number, bias: number): number => {
    const exponent = sum + bias
    const numerator = Math.exp(exponent) - Math.exp(-exponent)
    const denominator = Math.exp(exponent) + Math.exp(-exponent)
    return numerator / denominator
}

/**
 * Crea una copia profonda di un oggetto
 * @param obj - Oggetto da copiare (può essere di qualsiasi tipo T)
 * @returns Copia profonda dell'oggetto originale
 * @description Gestisce oggetti, array e tipi primitivi ricorsivamente
 */
export function deepCopy<T>(obj: T): T
export function deepCopy<T extends unknown[]>(obj: T): T
export function deepCopy<T extends Record<string, unknown>>(obj: T): T
export function deepCopy(obj: unknown): unknown {
    if (obj === null || typeof obj !== 'object') {
        return obj
    }

    if (Array.isArray(obj)) {
        return obj.map((item) => deepCopy(item)) as unknown
    }

    const result: Record<string, unknown> = {}
    for (const key in obj as Record<string, unknown>) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            result[key] = deepCopy((obj as Record<string, unknown>)[key])
        }
    }

    return result
}

/**
 * Confronta due oggetti per uguaglianza profonda
 * @param obj1 - Primo oggetto da confrontare
 * @param obj2 - Secondo oggetto da confrontare
 * @returns true se gli oggetti sono identici in struttura e valori, false altrimenti
 * @description Esegue confronto ricorsivo di tutti i campi e sottooggetti
 */
export const areObjectsEqual = (
    obj1: Record<string, unknown>,
    obj2: Record<string, unknown>,
): boolean => {
    const keys1 = Object.keys(obj1)
    const keys2 = Object.keys(obj2)

    if (keys1.length !== keys2.length) {
        return false
    }

    for (const key of keys1) {
        const value1 = obj1[key]
        const value2 = obj2[key]

        if (
            typeof value1 === 'object' &&
            value1 !== null &&
            typeof value2 === 'object' &&
            value2 !== null
        ) {
            if (
                !areObjectsEqual(
                    value1 as Record<string, unknown>,
                    value2 as Record<string, unknown>,
                )
            ) {
                return false
            }
        } else if (value1 !== value2) {
            return false
        }
    }

    return true
}

/**
 * Seleziona un colore casuale dalla palette predefinita
 * @returns Stringa esadecimale rappresentante un colore casuale
 * @example getRandomColor() // Returns "#dc2626" (o qualsiasi altro colore della palette)
 */
export const getRandomColor = (): string => {
    const colorsArray = Object.values(colors)
    const color = colorsArray[Math.floor(Math.random() * colorsArray.length)]
    return color
}

/**
 * Palette di colori predefinita con colori Tailwind CSS
 * @description Oggetto contenente colori in formato esadecimale
 */
export const colors = {
    red: '#dc2626',
    orange: '#ea580c',
    amber: '#d97706',
    yellow: '#ca8a04',
    lime: '#65a30d',
    green: '#16a34a',
    emerald: '#059669',
    teal: '#0d9488',
    cyan: '#0891b2',
    sky: '#0284c7',
    blue: '#2563eb',
    indingo: '#4f46e5',
    violet: '#7c3aed',
    purple: '#9333ea',
    fuchsia: '#c026d3',
    pink: '#db2777',
    rose: '#e11d48',
}

/**
 * Genera un ID casuale alfanumerico
 * @returns Stringa di 8 caratteri contenente lettere maiuscole e numeri
 * @example generateId() // Returns "A3F7K9M2"
 * @description Usa caratteri A-Z e 0-9 per creare identificatori univoci
 */
export const generateId = (): string => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const idLength = 8
    let generatedId = ''

    for (let i = 0; i < idLength; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length)
        generatedId += characters.charAt(randomIndex)
    }

    return generatedId
}
