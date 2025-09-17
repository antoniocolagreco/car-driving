import Point from '../models/point'

export const init = (container: HTMLElement) => {
    const mainCanvas = document.createElement('canvas')
    const chartCanvas = document.createElement('canvas')
    container.appendChild(mainCanvas)
    container.appendChild(chartCanvas)

    mainCanvas.style.cursor = 'none'
    chartCanvas.style.cursor = 'none'
    chartCanvas.style.position = 'absolute'
    chartCanvas.style.top = '0'
    chartCanvas.style.left = '0'
    chartCanvas.style.width = '200px'
    chartCanvas.style.height = '200px'
    chartCanvas.style.border = '1px solid #000'

    const mainContext = mainCanvas.getContext('2d')
    const chartContext = chartCanvas.getContext('2d')

    if (!mainContext || !chartContext) {
        return
    }

    const mainCanvasData: CanvasData = {
        center: new Point(0, 0),
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
    }
    const chartCanvasData: CanvasData = {
        center: new Point(0, 0),
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
    }

    const mainTriangleData: TriangleData = {
        A: new Point(0, 0),
        B: new Point(100, -100),
        C: new Point(100, 0),
        c: 0,
        b: 0,
        a: 0,
    }

    const mainAngleData: AngleData = { theta: 0, sin: 0, cos: 0, tan: 0 }

    const handleResize = () => {
        const parentWidth = mainCanvas.parentElement?.clientWidth
        const parentHeight = mainCanvas.parentElement?.clientHeight
        if (!parentWidth || !parentHeight) {
            return
        }
        mainCanvas.width = parentWidth - (parentWidth % 2) - 1
        mainCanvas.height = parentHeight - (parentHeight % 2) - 1
        setCenter(mainContext, mainCanvasData, mainCanvas.width / 2, mainCanvas.height / 2)
        chartCanvas.width = 199
        chartCanvas.height = 199
        setCenter(chartContext, chartCanvasData, 0, 0)
    }

    handleResize()

    mainCanvas.onmousemove = (event: MouseEvent) =>
        handleMouseMove(
            event.offsetX,
            event.offsetY,
            mainCanvasData,
            mainTriangleData,
            mainAngleData,
        )

    window.onresize = () => handleResize()

    drawSquare(chartContext, { fillColor: '#fff' })
    drawCoordinateSystem(chartContext, chartCanvasData)

    const animate = () => {
        drawSquare(mainContext)
        drawCoordinateSystem(mainContext, mainCanvasData)

        drawLine(mainContext, {
            positions: [
                new Point(mainCanvasData.left, mainCanvasData.bottom),
                new Point(mainCanvasData.right, mainCanvasData.bottom),
            ],
            thickness: 2,
        })

        drawText(mainContext, {
            text: `sin = a/c = ${mainAngleData.sin.toFixed(3)}`,
            position: new Point(mainCanvasData.left + 10, mainCanvasData.bottom - 70),
            align: 'left',
            baseline: 'bottom',
        })
        drawText(mainContext, {
            text: `cos = b/c = ${mainAngleData.cos.toFixed(3)}`,
            position: new Point(mainCanvasData.left + 10, mainCanvasData.bottom - 50),
            align: 'left',
            baseline: 'bottom',
        })
        drawText(mainContext, {
            text: `tan = a/b = ${mainAngleData.tan.toFixed(3)}`,
            position: new Point(mainCanvasData.left + 10, mainCanvasData.bottom - 30),
            align: 'left',
            baseline: 'bottom',
        })
        drawText(mainContext, {
            text: `θ = ${mainAngleData.theta.toFixed(2)}rad (${Math.round(convertToDegree(mainAngleData.theta))}°)`,
            position: new Point(mainCanvasData.left + 10, mainCanvasData.bottom - 10),
            align: 'left',
            baseline: 'bottom',
        })

        drawLine(mainContext, {
            positions: [mainTriangleData.A, mainTriangleData.B],
            thickness: 2,
            color: 'black',
        })
        drawLine(mainContext, {
            positions: [mainTriangleData.B, mainTriangleData.C],
            thickness: 2,
            color: 'black',
        })
        drawLine(mainContext, {
            positions: [mainTriangleData.C, mainTriangleData.A],
            thickness: 2,
            color: 'black',
        })

        drawCorner(mainContext, { thickness: 2, radius: 40 }, mainTriangleData, mainAngleData)

        drawText(mainContext, {
            text: `c=${Math.round(mainTriangleData.c)}`,
            position: calculateAverage(mainTriangleData.A, mainTriangleData.B),
            stroke: 'white',
            font: '14px monospace',
        })
        drawText(mainContext, {
            text: `b=${Math.round(mainTriangleData.b)}`,
            position: calculateAverage(mainTriangleData.A, mainTriangleData.C),
            stroke: 'white',
            font: '14px monospace',
        })
        drawText(mainContext, {
            text: `a=${Math.round(mainTriangleData.a)}`,
            position: calculateAverage(mainTriangleData.B, mainTriangleData.C),
            stroke: 'white',
            font: '14px monospace',
        })

        drawCircle(mainContext, { position: mainTriangleData.A, radius: 10, color: 'red' })
        drawText(mainContext, { text: 'A', position: mainTriangleData.A, fill: 'white' })
        drawCircle(mainContext, { position: mainTriangleData.B, radius: 10, color: 'green' })
        drawText(mainContext, { text: 'B', position: mainTriangleData.B, fill: 'white' })
        drawCircle(mainContext, { position: mainTriangleData.C, radius: 10, color: 'blue' })
        drawText(mainContext, { text: 'C', position: mainTriangleData.C, fill: 'white' })

        drawCircle(chartContext, {
            position: new Point(
                (mainAngleData.theta * chartCanvasData.right) / 2,
                (mainAngleData.sin * chartCanvasData.bottom) / 2,
            ),
            radius: 2,
            color: 'red',
        })
        drawCircle(chartContext, {
            position: new Point(
                (mainAngleData.theta * chartCanvasData.right) / 2,
                (mainAngleData.cos * chartCanvasData.bottom) / 2,
            ),
            radius: 2,
            color: 'blue',
        })
        drawCircle(chartContext, {
            position: new Point(
                (mainAngleData.theta * chartCanvasData.right) / 2,
                (mainAngleData.tan * chartCanvasData.bottom) / 2,
            ),
            radius: 2,
            color: 'green',
        })

        requestAnimationFrame(animate)
    }

    animate()
}

type Shadow = {
    color?: string
    blur?: number
    offsetX?: number
    offsetY?: number
}

type DrawTextProps = {
    text: string
    position: Point
    align?: CanvasTextAlign
    baseline?: CanvasTextBaseline
    fill?: string
    stroke?: string
    font?: string
    shadow?: Shadow
}

type DrawCircleProps = {
    position: Point
    radius?: number
    color?: string
}

type DrawLineProps = {
    positions: Point[]
    thickness?: number
    dash?: number[]
    color?: string
}

type DrawSquareProps = {
    coords?: [Point, Point]
    thickness?: number
    fillColor?: string
    strokeColor?: string
}

type DrawArcProps = {
    position: Point
    startAngle: number
    endAngle: number
    counterClockwise?: boolean
    radius?: number
    thickness?: number
    dash?: number[]
    color?: string
}

type DrawCornerProps = Omit<DrawArcProps, 'position' | 'startAngle' | 'endAngle'> & {}

type CanvasData = {
    center: Point
    left: number
    right: number
    top: number
    bottom: number
}

type TriangleData = { A: Point; B: Point; C: Point; c: number; b: number; a: number }

type AngleData = { theta: number; sin: number; cos: number; tan: number }

const setCenter = (ctx: CanvasRenderingContext2D, canvasData: CanvasData, x: number, y: number) => {
    canvasData.center.set(x, y)
    ctx.translate(canvasData.center.getX(), canvasData.center.getY())
    canvasData.left = -canvasData.center.getX()
    canvasData.right = ctx.canvas.width - canvasData.center.getX()
    canvasData.top = -canvasData.center.getY()
    canvasData.bottom = ctx.canvas.height - canvasData.center.getY()
}

const handleMouseMove = (
    width: number,
    height: number,
    canvasData: CanvasData,
    triangleData: TriangleData,
    angleData: AngleData,
) => {
    triangleData.B.set(width - canvasData.center.getX(), height - canvasData.center.getY())
    triangleData.C.set(triangleData.B.getX(), triangleData.C.getY())
    triangleData.c = calculateDistance(triangleData.A, triangleData.B)
    triangleData.b = calculateDistance(triangleData.A, triangleData.C)
    triangleData.a = calculateDistance(triangleData.B, triangleData.C)
    angleData.sin = triangleData.a / triangleData.c
    angleData.cos = triangleData.b / triangleData.c
    angleData.tan = triangleData.a / triangleData.b
    angleData.theta = Math.asin(angleData.sin)
}

const calculateAverage = (p1: Point, p2: Point) => {
    const x = (p1.getX() + p2.getX()) / 2
    const y = (p1.getY() + p2.getY()) / 2
    return new Point(x, y)
}

const convertToDegree = (value: number) => {
    return value * (180 / Math.PI)
}

const calculateDistance = (p1: Point, p2: Point) => {
    // const distance= Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2))
    const distance = Math.hypot(p2.getX() - p1.getX(), p2.getY() - p1.getY())

    return distance
}

const drawCircle = (ctx: CanvasRenderingContext2D, props: DrawCircleProps) => {
    ctx.beginPath()
    ctx.fillStyle = props.color ?? '#000'
    ctx.arc(
        props.position.getX() ?? 0,
        props.position.getY() ?? 0,
        props.radius ?? 10,
        0,
        Math.PI * 2,
    )
    ctx.fill()
}

const drawText = (ctx: CanvasRenderingContext2D, props: DrawTextProps) => {
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
        ctx.strokeText(props.text, props.position.getX(), props.position.getY())
    }
    ctx.fillText(props.text, props.position.getX(), props.position.getY())
}

const drawLine = (ctx: CanvasRenderingContext2D, props: DrawLineProps) => {
    ctx.beginPath()
    if (props.positions.length < 2) {
        return
    }
    ctx.moveTo(props.positions[0].getX(), props.positions[0].getY())
    for (let index = 1; index < props.positions.length; index++) {
        ctx.lineTo(props.positions[index].getX(), props.positions[index].getY())
    }
    ctx.setLineDash(props.dash ?? [])
    ctx.strokeStyle = props.color ?? '#000'
    ctx.lineWidth = props.thickness ?? 1
    ctx.stroke()
}

const drawArc = (ctx: CanvasRenderingContext2D, props: DrawArcProps) => {
    ctx.beginPath()
    ctx.strokeStyle = props.color ?? '#000'
    ctx.lineWidth = props.thickness ?? 1
    ctx.setLineDash(props.dash ?? [])
    ctx.arc(
        props.position.getX(),
        props.position.getY(),
        props.radius ?? 20,
        props.startAngle ?? 0,
        props.endAngle ?? 360,
        props.counterClockwise ?? false,
    )
    ctx.stroke()
}

const drawSquare = (ctx: CanvasRenderingContext2D, props?: DrawSquareProps) => {
    const x1 = props?.coords ? props.coords[0].getX() : -ctx.canvas.width
    const y1 = props?.coords ? props.coords[0].getY() : -ctx.canvas.height
    const x2 = props?.coords ? props.coords[1].getX() : ctx.canvas.width * 2
    const y2 = props?.coords ? props.coords[1].getY() : ctx.canvas.height * 2
    if (props?.strokeColor) {
        ctx.lineWidth = props?.thickness ?? 0
        ctx.strokeStyle = props?.strokeColor
        ctx.strokeRect(x1, y1, x2, y2)
    }
    if (props?.fillColor) {
        ctx.fillStyle = props?.fillColor
        ctx.fillRect(x1, y1, x2, y2)
    }
}

const drawCoordinateSystem = (ctx: CanvasRenderingContext2D, canvasData: CanvasData) => {
    drawSquare(ctx, { fillColor: '#fff' })

    for (let index = 0; index < canvasData.right + 10; index += 10) {
        drawLine(ctx, {
            positions: [new Point(index, canvasData.bottom), new Point(index, canvasData.top)],
            color: Boolean(index % 100) ? '#eee' : '#ddd',
        })
    }
    for (let index = 0; index > canvasData.left - 10; index -= 10) {
        drawLine(ctx, {
            positions: [new Point(index, canvasData.bottom), new Point(index, canvasData.top)],
            color: Boolean(index % 100) ? '#eee' : '#ddd',
        })
    }
    for (let index = 0; index > canvasData.top - 10; index -= 10) {
        drawLine(ctx, {
            positions: [new Point(canvasData.left, index), new Point(canvasData.right, index)],
            color: Boolean(index % 100) ? '#eee' : '#ddd',
        })
    }
    for (let index = 0; index < canvasData.bottom + 10; index += 10) {
        drawLine(ctx, {
            positions: [new Point(canvasData.left, index), new Point(canvasData.right, index)],
            color: Boolean(index % 100) ? '#eee' : '#ddd',
        })
    }

    drawLine(ctx, {
        positions: [new Point(0, 0), new Point(canvasData.right, 0)],
        dash: [5, 5],
        color: 'gray',
    })
    drawLine(ctx, {
        positions: [new Point(0, 0), new Point(canvasData.left, 0)],
        dash: [5, 5],
        color: 'gray',
    })
    drawLine(ctx, {
        positions: [new Point(0, 0), new Point(0, canvasData.top)],
        dash: [5, 5],
        color: 'gray',
    })
    drawLine(ctx, {
        positions: [new Point(0, 0), new Point(0, canvasData.bottom)],
        dash: [5, 5],
        color: 'gray',
    })
}

const drawCorner = (
    ctx: CanvasRenderingContext2D,
    props: DrawCornerProps,
    triangleData: TriangleData,
    angleData: AngleData,
) => {
    let counterClockwise = false
    if (
        triangleData.B.getX() < triangleData.A.getX() &&
        triangleData.B.getY() > triangleData.A.getY()
    ) {
        counterClockwise = true
    }
    if (
        triangleData.B.getX() > triangleData.A.getX() &&
        triangleData.B.getY() < triangleData.A.getY()
    ) {
        counterClockwise = true
    }

    const startAngle = triangleData.B.getX() > triangleData.A.getX() ? 0 : Math.PI

    let endAngle = angleData.theta
    if (
        triangleData.B.getX() < triangleData.A.getX() &&
        triangleData.B.getY() > triangleData.A.getY()
    ) {
        endAngle = Math.PI - angleData.theta
    }
    if (
        triangleData.B.getX() > triangleData.A.getX() &&
        triangleData.B.getY() < triangleData.A.getY()
    ) {
        endAngle = -angleData.theta
    }
    if (
        triangleData.B.getX() < triangleData.A.getX() &&
        triangleData.B.getY() < triangleData.A.getY()
    ) {
        endAngle = Math.PI + angleData.theta
    }

    if (triangleData.b > 50) {
        drawArc(ctx, {
            position: triangleData.A,
            startAngle,
            endAngle,
            thickness: props.thickness,
            radius: props.radius,
            counterClockwise,
        })
    }
}
