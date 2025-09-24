import Features from './features'
import Size from './size'
import Vehicle, { type VehicleProps } from './vehicle'

export type CarProps = Omit<VehicleProps, 'features'> & {
    features?: Features
}

export class Car extends Vehicle {
    constructor({ features, ...rest }: CarProps) {
        super({
            ...rest,
            features:
                features ||
                new Features({
                    maxSpeed: 5,
                    acceleration: 0.02,
                    maxReverse: 1,
                    breakPower: 0.05,
                }),
        })
        this.size = new Size(40, 70)
    }

    protected afterDrawing(context: CanvasRenderingContext2D): void {
        super.afterDrawing(context)

        // Draw car lights (rear lights with base + brake lights when braking)
        this.drawRearLights(context)
    }

    private drawRearLights(context: CanvasRenderingContext2D): void {
        const currentCarPosition = this.getPosition()
        const currentCarDirection = this.getDirection()
        const currentCarSize = this.getSize()

        // Calculate rear section position of the car
        const distanceFromCarCenterToRear = currentCarSize.getHeight() / 2 - 5
        const lateralSpacingBetweenLights = currentCarSize.getWidth() * 0.3

        // Calculate rear center point of the car
        const rearCenterPositionX =
            currentCarPosition.getX() + Math.sin(currentCarDirection) * distanceFromCarCenterToRear
        const rearCenterPositionY =
            currentCarPosition.getY() + Math.cos(currentCarDirection) * distanceFromCarCenterToRear

        // Calculate positions for left and right rear lights
        const leftRearLightPositionX =
            rearCenterPositionX - Math.cos(currentCarDirection) * lateralSpacingBetweenLights
        const leftRearLightPositionY =
            rearCenterPositionY + Math.sin(currentCarDirection) * lateralSpacingBetweenLights
        const rightRearLightPositionX =
            rearCenterPositionX + Math.cos(currentCarDirection) * lateralSpacingBetweenLights
        const rightRearLightPositionY =
            rearCenterPositionY - Math.sin(currentCarDirection) * lateralSpacingBetweenLights

        // Draw base rear lights (always visible - wider gray lines)
        this.drawBaseLights(
            context,
            currentCarDirection,
            leftRearLightPositionX,
            leftRearLightPositionY,
            rightRearLightPositionX,
            rightRearLightPositionY,
        )

        // Draw brake lights (only when braking - narrower red lines on top)
        if (this.controls.isBreaking() && !this.damaged) {
            this.drawBrakeLights(
                context,
                currentCarDirection,
                leftRearLightPositionX,
                leftRearLightPositionY,
                rightRearLightPositionX,
                rightRearLightPositionY,
            )
        }
    }

    private drawBaseLights(
        context: CanvasRenderingContext2D,
        carDirection: number,
        leftLightX: number,
        leftLightY: number,
        rightLightX: number,
        rightLightY: number,
    ): void {
        // Base lights configuration (wider lines, semi-transparent)
        const baseLightLength = 14
        const baseLightHalfLength = baseLightLength / 2
        const baseLightThickness = 6
        const baseLightOpacity = 0.5

        // Calculate start and end points for base lights (perpendicular to car direction)
        const leftBaseLightStartX = leftLightX - Math.cos(carDirection) * baseLightHalfLength
        const leftBaseLightStartY = leftLightY + Math.sin(carDirection) * baseLightHalfLength
        const leftBaseLightEndX = leftLightX + Math.cos(carDirection) * baseLightHalfLength
        const leftBaseLightEndY = leftLightY - Math.sin(carDirection) * baseLightHalfLength

        const rightBaseLightStartX = rightLightX - Math.cos(carDirection) * baseLightHalfLength
        const rightBaseLightStartY = rightLightY + Math.sin(carDirection) * baseLightHalfLength
        const rightBaseLightEndX = rightLightX + Math.cos(carDirection) * baseLightHalfLength
        const rightBaseLightEndY = rightLightY - Math.sin(carDirection) * baseLightHalfLength

        // Set base light drawing properties
        context.globalAlpha = baseLightOpacity
        context.strokeStyle = 'gray'
        context.lineWidth = baseLightThickness
        context.setLineDash([]) // Reset line dash to solid line

        // Draw left base light
        context.beginPath()
        context.moveTo(leftBaseLightStartX, leftBaseLightStartY)
        context.lineTo(leftBaseLightEndX, leftBaseLightEndY)
        context.stroke()

        // Draw right base light
        context.beginPath()
        context.moveTo(rightBaseLightStartX, rightBaseLightStartY)
        context.lineTo(rightBaseLightEndX, rightBaseLightEndY)
        context.stroke()
    }

    private drawBrakeLights(
        context: CanvasRenderingContext2D,
        carDirection: number,
        leftLightX: number,
        leftLightY: number,
        rightLightX: number,
        rightLightY: number,
    ): void {
        // Restore original alpha value to not affect other cars
        context.globalAlpha = 1

        // Brake lights configuration (narrower lines, full opacity, red color)
        const brakeLightLength = 12
        const brakeLightHalfLength = brakeLightLength / 2
        const brakeLightThickness = 4
        const brakeLightOpacity = 1

        // Calculate start and end points for brake lights (perpendicular to car direction)
        const leftBrakeLightStartX = leftLightX - Math.cos(carDirection) * brakeLightHalfLength
        const leftBrakeLightStartY = leftLightY + Math.sin(carDirection) * brakeLightHalfLength
        const leftBrakeLightEndX = leftLightX + Math.cos(carDirection) * brakeLightHalfLength
        const leftBrakeLightEndY = leftLightY - Math.sin(carDirection) * brakeLightHalfLength

        const rightBrakeLightStartX = rightLightX - Math.cos(carDirection) * brakeLightHalfLength
        const rightBrakeLightStartY = rightLightY + Math.sin(carDirection) * brakeLightHalfLength
        const rightBrakeLightEndX = rightLightX + Math.cos(carDirection) * brakeLightHalfLength
        const rightBrakeLightEndY = rightLightY - Math.sin(carDirection) * brakeLightHalfLength

        // Set brake light drawing properties
        context.globalAlpha = brakeLightOpacity
        context.strokeStyle = 'red'
        context.lineWidth = brakeLightThickness

        // Draw left brake light
        context.beginPath()
        context.moveTo(leftBrakeLightStartX, leftBrakeLightStartY)
        context.lineTo(leftBrakeLightEndX, leftBrakeLightEndY)
        context.stroke()

        // Draw right brake light
        context.beginPath()
        context.moveTo(rightBrakeLightStartX, rightBrakeLightStartY)
        context.lineTo(rightBrakeLightEndX, rightBrakeLightEndY)
        context.stroke()
    }
}
