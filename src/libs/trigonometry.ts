import Position from '../models/Position';

type SimplePosition = { x: number; y: number }

type Shadow = {
    color?: string
    blur?: number
    offsetX?: number
    offsetY?: number
}

type DrawTextProps = {
    text: string
    position: Position | SimplePosition
    align?: CanvasTextAlign
    baseline?: CanvasTextBaseline
    fill?: string
    stroke?: string
    font?: string
    shadow?: Shadow
}

type DrawLineProps = {
    positions: (Position | SimplePosition)[]
    thickness?: number
    dash?: number[]
    color?: string
}

type DrawArcProps = {
    position: Position | SimplePosition
    startAngle: number
    endAngle: number
    counterClockwise?: boolean
    radius?: number
    thickness?: number
    dash?: number[]
    color?: string
}

type DrawCornerProps = Omit<DrawArcProps, 'position' | 'startAngle' | 'endAngle'> & {}

export const init = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let c = 0
    let b = 0
    let a = 0
    let theta = 0
    let sin = 0
    let cos = 0
    let tan = 0
    let TranslationCoords = new Position()
    let X = { left: 0, center: 0, right: 0 }
    let Y = { top: 0, center: 0, bottom: 0 }

    const handleResize = () => {
        const parentWidth = canvas.parentElement?.clientWidth
        const parentHeight = canvas.parentElement?.clientHeight
        if (!parentWidth || !parentHeight) return
        canvas.width = parentWidth - (parentWidth % 2) - 1
        canvas.height = parentHeight - (parentHeight % 2) - 1

        TranslationCoords.set(canvas.width / 2, canvas.height / 2)
        ctx.translate(TranslationCoords.x, TranslationCoords.y)

        X.right = TranslationCoords.x
        X.left = -TranslationCoords.x
        Y.bottom = TranslationCoords.y
        Y.top = -TranslationCoords.y
    }

    handleResize()

    const A = new Position(0, 0)
    const B = new Position(100, -100)
    const C = new Position(B.x, 0)

    canvas.onmousemove = (event: MouseEvent) => {
        B.x = event.offsetX - TranslationCoords.x
        B.y = event.offsetY - TranslationCoords.y
        C.x = B.x
        c = calculateDistance(A, B)
        b = calculateDistance(A, C)
        a = calculateDistance(B, C)
        sin = a / c
        cos = b / c
        tan = a / b
        theta = Math.asin(sin)
    }

    const calculateAverage = (p1: Position, p2: Position) => {
        const x = (p1.x + p2.x) / 2
        const y = (p1.y + p2.y) / 2
        return new Position(x, y)
    }

    const convertToDegree = (value: number) => {
        return value * (180 / Math.PI)
    }

    const calculateDistance = (p1: Position, p2: Position) => {
        // const distance= Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2))
        const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y)

        return distance
    }

    const drawCircle = (position: Position, radius: number, color: string = '#000') => {
        ctx.beginPath()
        ctx.fillStyle = color
        ctx.arc(position.x, position.y, radius, 0, Math.PI * 2)
        ctx.fill()
    }

    const drawText = (props: DrawTextProps) => {
        ctx.beginPath()
        ctx.textAlign = props.align ?? 'center'
        ctx.textBaseline = props.baseline ?? 'middle'
        ctx.font = props.font ?? '16px monospace'
        ctx.fillStyle = props.fill ?? '#000'
        ctx.shadowBlur = props.shadow?.blur ?? 0
        ctx.shadowColor = props.shadow?.color ?? '#000'
        ctx.shadowOffsetX = props.shadow?.offsetX ?? 0
        ctx.shadowOffsetY = props.shadow?.offsetY ?? 0
        if (props.stroke) {
            ctx.lineWidth = 5
            ctx.strokeStyle = props.stroke
            ctx.strokeText(props.text, props.position.x, props.position.y)
        }
        ctx.fillText(props.text, props.position.x, props.position.y)
    }

    const drawLine = (props: DrawLineProps) => {
        ctx.beginPath()
        if (props.positions.length < 2) return
        ctx.moveTo(props.positions[0].x, props.positions[0].y)
        for (let index = 1; index < props.positions.length; index++) {
            ctx.lineTo(props.positions[index].x, props.positions[index].y)
        }
        ctx.setLineDash(props.dash ?? [])
        ctx.strokeStyle = props.color ?? '#000'
        ctx.lineWidth = props.thickness ?? 1
        ctx.stroke()
    }

    const drawArc = (props: DrawArcProps) => {
        ctx.beginPath()
        ctx.strokeStyle = props.color ?? '#000'
        ctx.lineWidth = props.thickness ?? 1
        ctx.setLineDash(props.dash ?? [])
        ctx.arc(
            props.position.x,
            props.position.y,
            props.radius ?? 20,
            props.startAngle ?? 0,
            props.endAngle ?? 360,
            props.counterClockwise ?? false
        )
        ctx.stroke()
    }

    const drawCoordinateSystem = () => {
        ctx.fillStyle = '#fff'
        ctx.fillRect(-canvas.width, -canvas.height, canvas.width * 2, canvas.height * 2)

        for (let index = X.center; index < X.right + 10; index += 10) {
            drawLine({
                positions: [
                    { x: index, y: Y.bottom },
                    { x: index, y: Y.top },
                ],
                color: Boolean(index % 100) ? '#eee' : '#ddd',
            })
        }
        for (let index = X.center; index > X.left - 10; index -= 10) {
            drawLine({
                positions: [
                    { x: index, y: Y.bottom },
                    { x: index, y: Y.top },
                ],
                color: Boolean(index % 100) ? '#eee' : '#ddd',
            })
        }
        for (let index = Y.center; index > Y.top - 10; index -= 10) {
            drawLine({
                positions: [
                    { x: X.left, y: index },
                    { x: X.right, y: index },
                ],
                color: Boolean(index % 100) ? '#eee' : '#ddd',
            })
        }
        for (let index = Y.center; index < Y.bottom + 10; index += 10) {
            drawLine({
                positions: [
                    { x: X.left, y: index },
                    { x: X.right, y: index },
                ],
                color: Boolean(index % 100) ? '#eee' : '#ddd',
            })
        }

        drawLine({
            positions: [
                { x: X.center, y: Y.center },
                { x: X.right, y: Y.center },
            ],
            dash: [5, 5],
            color: 'gray',
        })
        drawLine({
            positions: [
                { x: X.center, y: Y.center },
                { x: X.left, y: Y.center },
            ],
            dash: [5, 5],
            color: 'gray',
        })
        drawLine({
            positions: [
                { x: X.center, y: Y.center },
                { x: X.center, y: Y.top },
            ],

            dash: [5, 5],
            color: 'gray',
        })
        drawLine({
            positions: [
                { x: X.center, y: Y.center },
                { x: X.center, y: Y.bottom },
            ],
            dash: [5, 5],
            color: 'gray',
        })
    }

    const drawCorner = (props: DrawCornerProps) => {
        let counterClockwise = false
        if (B.x < A.x && B.y > A.y) counterClockwise = true
        if (B.x > A.x && B.y < A.y) counterClockwise = true

        const startAngle = B.x > A.x ? 0 : Math.PI

        let endAngle = theta
        if (B.x < A.x && B.y > A.y) endAngle = Math.PI - theta
        if (B.x > A.x && B.y < A.y) endAngle = -theta
        if (B.x < A.x && B.y < A.y) endAngle = Math.PI + theta

        if (b > 50) {
            drawArc({ position: A, startAngle, endAngle, thickness: 2, radius: 40, counterClockwise })
        }
    }

    window.onresize = () => handleResize()

    const animate = () => {
        drawCoordinateSystem()

        ctx.translate(0, 0)
        drawText({
            text: `sin = a/c = ${sin.toFixed(3)}`,
            position: { x: X.left + 10, y: Y.bottom - 70 },
            align: 'left',
            baseline: 'bottom',
        })
        drawText({
            text: `cos = b/c = ${cos.toFixed(3)}`,
            position: { x: X.left + 10, y: Y.bottom - 50 },
            align: 'left',
            baseline: 'bottom',
        })
        drawText({
            text: `tan = a/b = ${tan.toFixed(3)}`,
            position: { x: X.left + 10, y: Y.bottom - 30 },
            align: 'left',
            baseline: 'bottom',
        })
        drawText({
            text: `θ = ${theta.toFixed(2)}rad (${Math.round(convertToDegree(theta))}°)`,
            position: { x: X.left + 10, y: Y.bottom - 10 },
            align: 'left',
            baseline: 'bottom',
        })

        drawLine({ positions: [A, B, C, A], thickness: 2 })

        drawCorner({ thickness: 2, radius: 40 })

        drawText({
            text: `c=${Math.round(c)}`,
            position: calculateAverage(A, B),
            stroke: 'white',
            font: '14px monospace',
        })
        drawText({
            text: `b=${Math.round(b)}`,
            position: calculateAverage(A, C),
            stroke: 'white',
            font: '14px monospace',
        })
        drawText({
            text: `a=${Math.round(a)}`,
            position: calculateAverage(B, C),
            stroke: 'white',
            font: '14px monospace',
        })

        drawCircle(A, 10, 'red')
        drawText({ text: 'A', position: A, fill: 'white' })
        drawCircle(B, 10, 'green')
        drawText({ text: 'B', position: B, fill: 'white' })
        drawCircle(C, 10, 'blue')
        drawText({ text: 'C', position: C, fill: 'white' })

        requestAnimationFrame(animate)
    }

    animate()
}
