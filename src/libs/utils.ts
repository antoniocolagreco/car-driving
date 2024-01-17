import Collision from '../models/Collision'
import Point from '../models/Point'
import Shape from '../models/Shape'

export const lerp = (start: number, end: number, slice: number) => {
    return start + (end - start) * slice
}

export const getIntersection = (A: Shape, B: Shape) => {
    const tTop =
        (B.getLast().x - B.getFirst().x) * (A.getFirst().y - B.getFirst().y) -
        (B.getLast().y - B.getFirst().y) * (A.getFirst().x - B.getFirst().x)
    const uTop =
        (B.getFirst().y - A.getFirst().y) * (A.getFirst().x - A.getLast().x) -
        (B.getFirst().x - A.getFirst().x) * (A.getFirst().y - A.getLast().y)
    const bottom =
        (B.getLast().y - B.getFirst().y) * (A.getLast().x - A.getFirst().x) -
        (B.getLast().x - B.getFirst().x) * (A.getLast().y - A.getFirst().y)

    if (bottom != 0) {
        const t = tTop / bottom
        const u = uTop / bottom
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return new Collision(
                new Point(lerp(A.getFirst().x, A.getLast().x, t), lerp(A.getFirst().y, A.getLast().y, t)),
                t
            )
        }
    }

    return null
}

export const checkPolygonsIntersection = (A: Shape, B: Shape) => {
    for (let i = 0; i < A.points.length; i++) {
        const lineOfA = new Shape(A.points[i], A.points[(i + 1) % A.points.length])
        for (let j = 0; j < B.points.length; j++) {
            const lineOfB = new Shape(B.points[j], B.points[(j + 1) % B.points.length])
            const collision = getIntersection(lineOfA, lineOfB)
            if (collision) return true
        }
    }
    return false
}

export const normalize = (value: number, min: number, max: number, newMin: number, newMax: number): number => {
    const oldScale = max - min
    const newScale = newMax - newMin
    const result = Math.min(newMax, Math.max(newMin, ((value - min) / oldScale) * newScale))
    return result
}

export const normalizeToHex = (value: number, min: number, max: number): string => {
    const normalizedValue = Math.floor(normalize(value, min, max, 0, 255))
    return normalizedValue.toString(16).padStart(2, '00')
}

export const getRandomColor = (): string => {
    const colorsArray = Object.values(colors)
    const color = colorsArray[Math.floor(Math.random() * colorsArray.length)]
    return color
}

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
